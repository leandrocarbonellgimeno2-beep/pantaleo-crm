import { NextResponse } from 'next/server';
import { guard, sesionActual } from '@/lib/api-guard';
import { getClientIp } from '@/lib/rate-limit';
import { db, admin } from '@/lib/firebase-admin';
import { sanitizeBody, CLIENTI_ALLOWED } from '@/lib/sanitize';
import { buildUpdateArgs } from '@/lib/firestore-update';
import { markForSoftDelete } from '@/lib/services/soft-delete';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const q = searchParams.get('q')?.toLowerCase();
    const codice = searchParams.get('codice'); // buscar immobile por código
    const limitParams = searchParams.get('limit'); 
    const limitCount = limitParams ? parseInt(limitParams) : 0;

    // Fetch single client
    if (id) {
      const doc = await db.collection('clienti').doc(id).get();
      if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const docData = doc.data() as any;
      if (docData._status === 'pendente_cancellazione') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ id: doc.id, ...docData });
    }

    // Fetch immobile by codice (for manual add in matching tab)
    if (codice) {
      const snapshot = await db.collection('immobili')
        .where('DatiBase.Codice', '==', codice)
        .limit(1)
        .get();
      if (snapshot.empty) {
        return NextResponse.json({ error: `Nessun immobile trovato con codice ${codice}` }, { status: 404 });
      }
      const doc = snapshot.docs[0];
      return NextResponse.json({ id: doc.id, ...doc.data() });
    }

    // Optional server-side tipo filter — avoids loading entire collection
    // when only one operation type is requested.
    const tipo = searchParams.get('tipo'); // 'vendita' | 'affitto' | null

    let query: any = db.collection('clienti');
    if (tipo === 'vendita') {
      // No orderBy here — where+orderBy on different fields needs a composite
      // Firestore index. Sorting is handled client-side in useMemo (page.tsx).
      query = query.where('Richiesta.Operazione.Vendita', '==', true);
    } else if (tipo === 'affitto') {
      query = query.where('Richiesta.Operazione.Affitto', '==', true);
    } else {
      query = query.orderBy('createdAt', 'desc');
    }
    // Tope de ESCANEO, distinto del tope de SALIDA. Sin ?limit= explícito
    // tampoco se pasa de aquí. Hoy hay ~453 clientes activos, así que 1500 deja
    // 3x de margen.
    const SCAN_CAP = 1500;

    // Cuando hay búsqueda de texto, el filtro ocurre EN MEMORIA más abajo, así
    // que el limit no puede aplicarse en la consulta: recortaría antes de
    // filtrar. Era el bug de `?q=rossi&limit=5`, que traía los 5 clientes más
    // recientes y buscaba "rossi" solo entre ellos — casi siempre nada.
    //
    // Buscar subcadenas obliga a escanear: Firestore no lo hace de forma
    // nativa y añadir un campo normalizado indexado exigiría migrar datos. Una
    // búsqueda cuesta por tanto ~453 lecturas; los typeaheads que consumen esto
    // llevan debounce para que sea una por búsqueda y no una por tecla.
    query = query.limit(q ? SCAN_CAP : (limitCount > 0 ? Math.min(limitCount, SCAN_CAP) : SCAN_CAP));

    // Projection: omits large binary fields (firmaDigitale, etc.) not needed in the list.
    // Single-ID fetches (above) still return the full document.
    const snapshot = await query
      .select(
        'DatiPersonali', 'Richiesta', 'Matching', 'Caratteristiche',
        'status', '_status', 'createdAt', 'updatedAt', 'dataCreazione',
        'note', 'note_riservate',
        'nome', 'cognome', 'cell1', // legacy top-level fields
      )
      .get();
    let data = snapshot.docs
      .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
      .map((doc: any) => ({ id: doc.id, ...doc.data() }));

    if (q) {
      const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const nq = normalize(q);
      data = data.filter((c: any) => {
        const dp = c.DatiPersonali || {};
        const fullSearch = normalize(
          `${dp.Nome || ''} ${dp.Cognome || ''} ${dp.Telefono || ''} ${dp.Email || ''} ${dp.CittaResidenza || ''}` +
          ` ${c.nome || ''} ${c.cognome || ''} ${c.cell1 || ''}` // legacy top-level fields
        );
        return fullSearch.includes(nq);
      });
    }

    // El recorte de salida va AL FINAL, sobre lo ya filtrado. Sin búsqueda de
    // texto es un no-op, porque la consulta ya aplicó el mismo límite.
    return NextResponse.json(limitCount > 0 ? data.slice(0, limitCount) : data);
  } catch (error: any) {
    console.error('[clienti]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

  try {
    const body = await request.json();
    const { id } = body;

    // ── Mutaciones atómicas de Matching (race-safe) ──────────────────────────
    // Los quick-actions (proponi/scarta) mandan deltas en `MatchingOps` en vez del
    // array completo. Así dos agentes editando el mismo cliente a la vez no se
    // pisan (la race del read-modify-write): arrayUnion añade, arrayRemove quita,
    // ambos atómicos a nivel Firestore. Los dot-paths crean Matching/sub-array si
    // no existen aún.
    const ops = body.MatchingOps;
    if (id && ops && typeof ops === 'object') {
      const FV = admin.firestore.FieldValue;
      const fieldUpdates: Record<string, any> = { updatedAt: FV.serverTimestamp() };
      if (Array.isArray(ops.addProposti) && ops.addProposti.length)
        fieldUpdates['Matching.Proposti'] = FV.arrayUnion(...ops.addProposti);
      if (Array.isArray(ops.removeProposti) && ops.removeProposti.length)
        fieldUpdates['Matching.Proposti'] = FV.arrayRemove(...ops.removeProposti);
      if (Array.isArray(ops.addListaNera) && ops.addListaNera.length)
        fieldUpdates['Matching.ListaNera'] = FV.arrayUnion(...ops.addListaNera);
      if (Array.isArray(ops.removeListaNera) && ops.removeListaNera.length)
        fieldUpdates['Matching.ListaNera'] = FV.arrayRemove(...ops.removeListaNera);
      if (Array.isArray(ops.addPreferiti) && ops.addPreferiti.length)
        fieldUpdates['Matching.Preferiti'] = FV.arrayUnion(...ops.addPreferiti);
      if (Array.isArray(ops.removePreferiti) && ops.removePreferiti.length)
        fieldUpdates['Matching.Preferiti'] = FV.arrayRemove(...ops.removePreferiti);

      await db.collection('clienti').doc(id).update(fieldUpdates);
      return NextResponse.json({ success: true, id });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const rest = sanitizeBody(body, CLIENTI_ALLOWED, id ? 'clienti.UPDATE' : 'clienti.CREATE');

    // Guard: mai sovrascrivere Matching con sub-array vuoti.
    // Un salvataggio di campi non correlati (es. Documentazione) non deve
    // cancellare Proposti/ListaNera/Preferiti accumulati.
    if (rest.Matching) {
      const m = rest.Matching as any;
      if (Array.isArray(m.Proposti) && m.Proposti.length === 0) delete m.Proposti;
      if (Array.isArray(m.ListaNera) && m.ListaNera.length === 0) delete m.ListaNera;
      if (Array.isArray(m.Preferiti) && m.Preferiti.length === 0) delete m.Preferiti;
      if (Object.keys(m).length === 0) delete (rest as any).Matching;
    }

    // Guard: mai sovrascrivere la firma digitale con un valore vuoto.
    //
    // La ficha se abre y el pad sale en blanco mientras el documento completo
    // todavia viaja —o si ese fetch fallo, que solo deja un console.error—. Si
    // el agente cambia un telefono y pulsa Salva en esa ventana, la firma del
    // cliente se pierde para siempre. Es el mismo candado que proprietari ya
    // tiene para su documentacion, y que aqui existia para Matching pero no
    // para la firma.
    //
    // Conviven dos grafias por herencia: FirmaDigitale (la que declara el tipo
    // Cliente y la que leen los PDF) y firmaDigitale, de documentos antiguos.
    for (const clave of ['FirmaDigitale', 'firmaDigitale'] as const) {
      const f = (rest as any)[clave];
      if (f === undefined) continue;
      if (!f || typeof f !== 'object') { delete (rest as any)[clave]; continue; }
      if (typeof f.UrlFirma === 'string' && f.UrlFirma.trim() === '') delete f.UrlFirma;
      if (typeof f.urlFirma === 'string' && f.urlFirma.trim() === '') delete f.urlFirma;
      // Sin URL no hay firma que anunciar: un HasFirma:false suelto solo sirve
      // para apagar la insignia de una firma que sigue guardada.
      if (f.UrlFirma === undefined && f.urlFirma === undefined) delete (rest as any)[clave];
    }

    const clientData: any = {
      ...rest,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // UPDATE existing
    if (id) {
      // Por field paths, no por mapas completos: `update({ Matching })` habría
      // reemplazado el mapa entero y borrado las proposte que otro agente
      // acumuló mientras esta ficha estaba abierta. Lo mismo con Documentazione
      // al subir un adjunto sobre un cliente proyectado.
      // El guard de sub-arrays vacíos de arriba sigue siendo necesario: un
      // array vacío sí sustituye al array existente.
      const updateArgs = buildUpdateArgs(clientData);
      await db.collection('clienti').doc(id).update(
        ...(updateArgs as [string, unknown, ...unknown[]]),
      );
      return NextResponse.json({ success: true, id });
    }

    // CREATE new
    clientData.createdAt = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection('clienti').add(clientData);
    return NextResponse.json({ success: true, id: ref.id });
  } catch (error: any) {
    console.error('[clienti]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // Block delete if client has associated generated documents
    const docsSnap = await db.collection('documenti_generati')
      .where('clienteId', '==', id)
      .limit(1)
      .get();
    if (!docsSnap.empty) {
      return NextResponse.json({
        error: 'Impossibile eliminare: il cliente ha documenti generati associati. Elimina prima i documenti dalla sezione Documenti.',
        hasDocuments: true,
      }, { status: 409 });
    }

    const sesion = await sesionActual(request);
    await markForSoftDelete('clienti', id, {
      email: sesion?.email ?? 'sconosciuto',
      role: sesion?.ruolo ?? 'sconosciuto',
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, message: 'Client marked for deletion.' });
  } catch (error: any) {
    console.error('[clienti DELETE]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
