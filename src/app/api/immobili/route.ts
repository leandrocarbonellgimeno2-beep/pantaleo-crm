import { NextResponse } from 'next/server';
import { guard, sesionActual } from '@/lib/api-guard';
import { getClientIp } from '@/lib/rate-limit';
import { db, admin } from '@/lib/firebase-admin';
import { sanitizeBody, IMMOBILI_ALLOWED } from '@/lib/sanitize';
import { buildUpdateArgs } from '@/lib/firestore-update';
import { markForSoftDelete } from '@/lib/services/soft-delete';
import { deactivateOnIdealista } from '@/lib/services/idealista-deactivate';
import { recountProprietario } from '@/lib/services/proprietari-counter';
import { extractImageUrls } from '@/lib/imageUtils';
import { resolveListLimits } from '@/lib/immobili/list-limits';
import { prepararImmobileParaCrear, sanearImmobileParaEditar } from '@/lib/immobili/sospeso';
import type { Property } from '@/types/property';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Lectura, pero con guard: sin el, bloquear a alguien no le cortaba el
  // acceso a los datos. Un ex-empleado con la pestaña abierta seguia listando
  // clientes y descargando documentos durante las ocho horas que le quedaran
  // de sesion, porque ningun GET de negocio pasaba por aqui. «agente» es el
  // nivel mas bajo, asi que ningun rol pierde acceso: lo que se gana es que el
  // bloqueo y la degradacion surtan efecto de verdad.
  const denegado = await guard(request, 'agente');
  if (denegado) return denegado;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const proprietarioId = searchParams.get('proprietarioId');
    const qRaw = searchParams.get('q');
    const q = qRaw ? qRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : undefined;
    const codice = searchParams.get('codice');
    // Tope de SALIDA y tope de ESCANEO. No son el mismo número y con `?q=` el
    // limit no puede empujarse a la consulta: el porqué, en list-limits.ts.
    const { limitCount, scanLimit } = resolveListLimits(searchParams.get('limit'), Boolean(q));
    const cursor = searchParams.get('cursor');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    // Helper: strip full images array to reduce payload size
    const stripToThumbnail = (doc: any) => {
      const { images, ...rest } = doc;
      return { ...rest, thumbnail: images?.[0] || null, imageCount: images?.length || 0 };
    };

    // 1. Single ID fetch (full document) — with image normalization for backward compat
    if (id) {
      const doc = await db.collection('immobili').doc(id).get();
      if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const data: any = { id: doc.id, ...doc.data() };
      if (data._status === 'pendente_cancellazione') return NextResponse.json({ error: 'Not found' }, { status: 404 });

      // Image legacy normalization — fonte unica in lib/imageUtils.
      if (!Array.isArray(data.images) || data.images.length === 0) {
        const uniqueUrls = extractImageUrls(data);
        if (uniqueUrls.length > 0) data.images = uniqueUrls;
      }

      return NextResponse.json(data);
    }

    // 2. Fetch by Owner
    if (proprietarioId) {
      // Traia documentos COMPLETOS y sin tope. Lo unico que se pinta con esto es
      // el modal "otros inmuebles del propietario", y al elegir uno se recarga
      // la ficha entera por id, asi que un documento parcial basta de sobra.
      const snapshot = await db.collection('immobili')
        .where('proprietarioId', '==', proprietarioId)
        .select(
          'DatiBase.Codice', 'DatiBase.Tipologia', 'DatiBase.Citta', 'DatiBase.Zona',
          'GestioneCommerciale.InVendita', 'GestioneCommerciale.InAffitto',
          'GestioneCommerciale.PrezzoVendita', 'GestioneCommerciale.PrezzoAffitto',
          'DettagliFisici.MetriCommerciali',
          'images', '_status',
        )
        .limit(100)
        .get();
      return NextResponse.json(
        snapshot.docs
          .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
          .map(doc => ({ id: doc.id, ...doc.data() }))
      );
    }

    // 3. Exact code lookup
    if (codice) {
      const snapshot = await db.collection('immobili').where('DatiBase.Codice', '==', codice).limit(10).get();
      let docs = snapshot.docs
        .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
        .map((doc: any) => stripToThumbnail({ id: doc.id, ...doc.data() }));
      if (status === 'attivi') docs = docs.filter((d: any) => !d.GestioneCommerciale?.Sospeso);
      else if (status === 'sospesi') docs = docs.filter((d: any) => d.GestioneCommerciale?.Sospeso === true);
      if (type === 'vendita') docs = docs.filter((d: any) => d.GestioneCommerciale?.InVendita === true);
      if (type === 'affitto') docs = docs.filter((d: any) => d.GestioneCommerciale?.InAffitto === true);
      return NextResponse.json({ data: docs, nextCursor: null, totalCount: docs.length });
    }

    // 4. Build base Firestore query — ALL status+type filters pushed to DB level
    let baseQuery: any = db.collection('immobili');
    if (status === 'sospesi') baseQuery = baseQuery.where('GestioneCommerciale.Sospeso', '==', true);
    else if (status === 'attivi') baseQuery = baseQuery.where('GestioneCommerciale.Sospeso', '==', false);
    // 'attivi' YA se empuja a Firestore. Antes no se podía: un documento sin el
    // campo Sospeso no entra en el índice, así que where('==',false) lo habría
    // excluido y habría escondido inmuebles activos de la pantalla principal.
    //
    // Comprobado sobre la base real antes de hacer el cambio, por dos vías:
    //  - count() sobre el índice: 631 (false) + 239 (true) = 870 = total de la
    //    colección. Si un solo documento careciera del campo, la suma no daría.
    //  - comparación de conjuntos de ids entre la consulta vieja (escanear todo
    //    y filtrar en JS) y esta: 631 y 631, sin un id de diferencia.
    // El script que lo comprueba es scripts/verificar-sospeso.cjs, y se puede
    // relanzar cuando se quiera: solo lee.
    //
    // Efecto: la vista por defecto del CRM deja de escanear la colección entera
    // y pasa a servirse del índice (Sospeso ASC, DatiBase.Codice DESC).
    if (type === 'vendita') baseQuery = baseQuery.where('GestioneCommerciale.InVendita', '==', true);
    else if (type === 'affitto') baseQuery = baseQuery.where('GestioneCommerciale.InAffitto', '==', true);

    let query = baseQuery.orderBy('DatiBase.Codice', 'desc');

    // 5. Projection: only fields used by the list UI — reduces Lambda↔Browser payload ~80%.
    //    Single-ID fetches (above) still return the full document.
    const snapshot = await query
      .select(
        'DatiBase.Codice', 'DatiBase.Indirizzo', 'DatiBase.Citta', 'DatiBase.Zona',
        'DatiBase.Tipologia', 'DatiBase.Riferimento', 'DatiBase.SortKey',
        'GestioneCommerciale.PrezzoVendita', 'GestioneCommerciale.PrezzoAffitto',
        'GestioneCommerciale.InVendita', 'GestioneCommerciale.InAffitto', 'GestioneCommerciale.Sospeso',
        'DettagliFisici.MetriCommerciali', 'DettagliFisici.CamereLetto', 'DettagliFisici.Bagni', 'DettagliFisici.Vani',
        'images', '_status', 'proprietarioId', 'createdAt',
        'Idealista.idealistaStatus',

        // ESTOS CUATRO FALTABAN, y no es una mejora futura: es un fallo vivo.
        // applyAdvancedFilters (lib/immobili/filters.ts) los lee para filtrar por
        // piano, clase energetica, estado y caracteristicas. Al no venir en la
        // proyeccion llegaban como undefined, y el filtro no fallaba: devolvia
        // CERO resultados en silencio. Son doce filtros avanzados que hoy no
        // encuentran nada.
        'DettagliFisici.Piano',
        'DettagliFisici.ClasseEnergetica',
        'DettagliFisici.StatoFiniture',
        // El mapa ENTERO, no por subcampos: se recorre con clave dinamica.
        'Caratteristiche',
      )
      .limit(scanLimit)
      .get();
    const docs = snapshot.docs
      .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
      .map((doc: any) => stripToThumbnail({ id: doc.id, ...doc.data() }))
      // Red de seguridad, ya redundante: desde que 'attivi' se filtra en
      // Firestore (ver baseQuery arriba) esto no descarta nada. Se mantiene
      // porque opera sobre un array que ya está en memoria —coste cero— y
      // porque deja la pantalla correcta si alguien retira el where de arriba.
      .filter((d: any) => status !== 'attivi' || !d.GestioneCommerciale?.Sospeso);

    // Text search in-memory (Firestore doesn't support full-text natively)
    if (q) {
      const filtered = docs.filter((i: any) => {
        const s = `${i.DatiBase?.Codice || ''} ${i.DatiBase?.Riferimento || ''} ${i.DatiBase?.Indirizzo || ''} ${i.DatiBase?.Citta || ''} ${i.DatiBase?.Zona || ''}`
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return s.includes(q);
      });
      // El recorte va AL FINAL, sobre lo ya filtrado: con `q` la consulta no
      // pudo limitarse, así que este es el único sitio donde aplicarlo.
      return NextResponse.json({
        data: limitCount > 0 ? filtered.slice(0, limitCount) : filtered,
        totalCount: filtered.length,
      });
    }

    // Ojo con totalCount cuando se pide `limit`: cuenta lo que había en la
    // ventana escaneada, no la colección entera. Saber el total exacto exige
    // recorrerla, que es justo lo que este limit evita; para eso está
    // /api/stats, que lo resuelve con agregaciones count().
    return NextResponse.json({
      data: limitCount > 0 ? docs.slice(0, limitCount) : docs,
      totalCount: docs.length,
    });
  } catch (error: any) {
    console.error('[immobili GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

  try {
    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // Saneado de Sospeso: un valor ininteligible (null, cadena vacía, un
    // objeto...) se descarta en vez de escribirse. Escribir null dejaría el
    // inmueble fuera de las DOS vistas —ni activo ni suspendido— y convertirlo
    // a false reactivaría un inmueble suspendido por culpa de un payload roto.
    const updates = sanearImmobileParaEditar(
      sanitizeBody(body, IMMOBILI_ALLOWED, 'immobili.PATCH'),
    );

    // Guard: un PATCH de texto (Textos, DatiBase...) no puede llevarse las
    // fotos por delante si no manda la clave.
    //
    // PERO UN ARRAY VACIO SI SE ESCRIBE, y esa distincion es el arreglo. Antes
    // se descartaba tambien `images: []`, que es justo lo que manda el flujo de
    // borrar la ULTIMA foto. Resultado: el fichero desaparecia del bucket y
    // Firestore conservaba la URL, asi que al recargar la ficha volvia a decir
    // «1 foto» con la imagen rota. Vaciar la galeria una a una guardaba todos
    // los pasos menos el ultimo, el de 1 a 0.
    //
    // Descartar solo lo que NO es un array cumple igual el proposito original:
    // un PATCH que no toca fotos no manda la clave, y el elemento proyectado
    // del listado tampoco la lleva —stripToThumbnail la sustituye por
    // thumbnail e imageCount mas arriba, en este mismo fichero—.
    if (!Array.isArray(updates.images)) {
      delete (updates as any).images;
    }
    if (!updates.thumbnail) {
      delete (updates as any).thumbnail;
    }

    // Escritura por field paths, no por mapas completos: `update({ DatiBase })`
    // REEMPLAZA el mapa entero y borra los subcampos que el payload no traiga.
    // Como el listado va proyectado (.select), el frontend manda a menudo
    // objetos parciales — de ahí que un cambio rápido de estado borrase campos
    // del incarico. Ver src/lib/firestore-update.ts.
    const updateArgs = buildUpdateArgs({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('immobili').doc(id).update(
      ...(updateArgs as [string, unknown, ...unknown[]]),
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[immobili PATCH]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

  try {
    const rawBody = await request.json();
    // El default de Sospeso se aplica AQUÍ, antes que nada: desde que el
    // listado filtra por ese campo en Firestore, un inmueble que se cree sin él
    // nace invisible en la pantalla principal. Ver lib/immobili/sospeso.ts.
    const body: any = prepararImmobileParaCrear(
      sanitizeBody(rawBody, IMMOBILI_ALLOWED, 'immobili.POST'),
    );
    const now = Date.now().toString();

    // DatiBase se asegura fuera del bloque del contador: ese bloque tiene su
    // propio try/catch y, si el contador fallaba antes de crear el mapa, la
    // línea `body.DatiBase.SortKey` de más abajo reventaba con un TypeError y
    // el alta entera se perdía con un 500.
    if (!body.DatiBase) body.DatiBase = {};

    // ── Auto-increment Codice — atomic via Firestore counter document ────────
    // Uses a dedicated counter doc (counters/immobili_codice) so concurrent POSTs
    // can never produce duplicate codes. On first use the counter is bootstrapped
    // from the current max in the collection, then all increments are transactional.
    const BASE_CODE = 1000000;
    try {
      const counterRef = db.collection('counters').doc('immobili_codice');

      // Check once outside the transaction so we can bootstrap if needed
      const counterSnap = await counterRef.get();
      let seedValue = BASE_CODE;

      if (!counterSnap.exists) {
        // One-time bootstrap: scan existing codes to find the true max
        const snapshot = await db.collection('immobili').select('DatiBase.Codice').get();
        for (const doc of snapshot.docs) {
          const raw = doc.data()?.DatiBase?.Codice;
          if (raw) {
            const parsed = parseInt(String(raw), 10);
            if (!isNaN(parsed) && parsed > seedValue) seedValue = parsed;
          }
        }
      }

      // Atomic increment — if two requests race on initialization, the transaction
      // retry mechanism ensures each gets a unique value
      const nextCode = await db.runTransaction(async (tx) => {
        const cd = await tx.get(counterRef);
        const current = cd.exists ? (cd.data()!.value as number) : seedValue;
        const next = current + 1;
        tx.set(counterRef, { value: next });
        return next;
      });

      body.DatiBase.Codice = String(nextCode);
    } catch (codeErr: any) {
      // Non-fatal: if the counter transaction fails, keep whatever the frontend sent
      console.error('[Auto-Codice] Failed to assign next code:', codeErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Ensure SortKey exists for pagination
    if (!body.DatiBase.SortKey) {
      body.DatiBase.SortKey = now;
    }

    const docRef = await db.collection('immobili').add({
      ...body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Keep proprietario counter in sync — increment atomically so concurrent
    // creates never produce a stale count.
    if (body.proprietarioId) {
      await db.collection('proprietari').doc(body.proprietarioId).update({
        numero_immobili: admin.firestore.FieldValue.increment(1),
      }).catch(() => {}); // non-fatal: counter will be corrected by sync-counters if needed
    }

    return NextResponse.json({ id: docRef.id, codice: body.DatiBase.Codice, success: true });
  } catch (error: any) {
    console.error('[immobili POST]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    const docRef = db.collection('immobili').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const data = doc.data() as Property;

    // Despublicar de Idealista ANTES de marcar el borrado: si no, el anuncio
    // sigue vivo en el portal —y cobrándose— con el inmueble ya fuera del CRM.
    // Nunca bloquea el borrado: si el portal está caído, se marca igual y el
    // cron de purga lo reintenta antes de eliminar el documento.
    const idealista = await deactivateOnIdealista(id, data as any);
    if (!idealista.ok) {
      console.error(`[immobili DELETE] Idealista no despublicó ${id}: ${idealista.reason}`);
    }

    const sesion = await sesionActual(request);
    await markForSoftDelete('immobili', id, {
      email: sesion?.email ?? 'sconosciuto',
      role: sesion?.ruolo ?? 'sconosciuto',
      ip: getClientIp(request),
    });
    if (data.proprietarioId) await recountProprietario(data.proprietarioId);

    return NextResponse.json({
      success: true,
      message: 'Property marked for deletion.',
      idealista: idealista.ok
        ? (idealista.changed ? 'deactivated' : idealista.reason)
        : 'deactivation-failed',
    });
  } catch (error: any) {
    console.error('[immobili DELETE]', error);
    return NextResponse.json({ error: 'Eliminazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
