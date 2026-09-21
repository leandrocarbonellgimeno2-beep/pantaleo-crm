import { NextResponse } from 'next/server';
import { guard, sesionActual } from '@/lib/api-guard';
import { db, admin } from '@/lib/firebase-admin';
import { sanitizeBody, sanitizeFirestoreId, DOCUMENTI_GENERATI_ALLOWED } from '@/lib/sanitize';
import { markForSoftDelete } from '@/lib/services/soft-delete';
import { getClientIp } from '@/lib/rate-limit';

const COLLECTION = 'documenti_generati';

/**
 * Si el documento lleva una firma trazada de verdad.
 *
 * El umbral de 100 caracteres no es arbitrario: las firmas se guardan como
 * `data:image/png;base64,…`, que para cualquier trazo real pasa de los miles
 * de caracteres. Una cadena corta es un campo inicializado a vacio o un
 * `data:` degenerado, no una firma.
 *
 * Medido sobre los 320 documentos de produccion: 154 con firma del cliente,
 * 0 con la del agente —el recuadro «Firma Agente» existe y no se ha usado
 * nunca—. Se miran las dos igualmente: lo que decide es que haya ALGUNA firma.
 */
export function tieneFirma(datos: any): boolean {
  const fd = datos?.formData;
  if (!fd || typeof fd !== 'object') return false;
  return Object.entries(fd).some(
    ([clave, valor]) => /firma/i.test(clave) && typeof valor === 'string' && valor.length > 100,
  );
}

/**
 * GET  → Fetch all generated documents (ordered by date desc)
 * POST → Save new generated document metadata
 * DELETE → Remove a generated document by ID
 */

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

    // Single-doc fetch (full document, incl. formData) — usato dal pulsante
    // "Riapri e modifica" che ha bisogno dello snapshot completo del form.
    if (id) {
      const doc = await db.collection(COLLECTION).doc(id).get();
      if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ id: doc.id, ...doc.data() });
    }

    // Lista: proietta SOLO i campi leggeri della tabella. `formData` (snapshot
    // completo del form, incl. firme base64) viene ESCLUSO dal payload della
    // lista: con 200 documenti era la causa del picco di memoria. Si recupera
    // on-demand via ?id= solo quando l'utente apre un documento per modificarlo.
    //
    // PAGINAZIONE A CURSORE, e non è un dettaglio di prestazioni.
    //
    // Il `limit(200)` fisso non era un tetto prudente: era un MURO. In
    // Firestore ci sono 320 documenti, quindi i 120 più vecchi —59 dei quali
    // CON la firma del cliente— non si potevano elencare, né cercare, né
    // scaricare, né riaprire dall'applicazione. La ricerca filtra in memoria
    // su quello che è già arrivato, quindi nemmeno cercarli per nome li
    // trovava. Per reclamare una provvigione con un foglio di maggio bisognava
    // entrare nella console di Firebase.
    //
    // E peggiorava da solo: al ritmo di ~65 documenti al mese, ogni due mesi
    // altri 120 finivano fuori portata.
    //
    // `dataCreazione` è una stringa ISO in tutti e 320, quindi l'ordinamento è
    // coerente e `startAfter` è affidabile. Se un giorno convivessero tipi
    // diversi, Firestore ordinerebbe prima per TIPO e il cursore salterebbe
    // documenti: vedi lib/fecha-ms.ts per lo stesso problema nella lista
    // clienti.
    const PAGINA = 100;
    const cursor = searchParams.get('cursor');

    let consulta = db.collection(COLLECTION)
      .orderBy('dataCreazione', 'desc')
      .select(
        'nomeFile', 'categoria', 'urlDownload', 'dataCreazione',
        'clienteNome', 'clienteId', 'sezione', 'azione',
        'fileName', 'size', '_status',
      );

    if (cursor) consulta = consulta.startAfter(cursor);

    // Si chiede uno in più del necessario: è così che si sa se c'è un'altra
    // pagina senza pagare una seconda query di conteggio.
    const snapshot = await consulta.limit(PAGINA + 1).get();

    const docs = snapshot.docs.slice(0, PAGINA);
    const hayMas = snapshot.docs.length > PAGINA;

    // Esclude i soft-deleted per coerenza con immobili/clienti/proprietari.
    // Il filtro è DOPO il taglio della pagina, di proposito: il cursore deve
    // avanzare sulla posizione reale nella collezione, altrimenti una pagina
    // piena di soft-deleted farebbe credere che non c'è altro.
    const data = docs
      .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
      .map(doc => ({ id: doc.id, ...doc.data() }));

    const ultimo = docs[docs.length - 1];
    const proximoCursor = hayMas && ultimo ? (ultimo.data() as any).dataCreazione ?? null : null;

    // `data` y no `documenti`: es la forma que ya usa /api/immobili, y asi
    // `listaDeRespuesta` la entiende sin tocarla.
    return NextResponse.json({ data, cursor: proximoCursor, hayMas });
  } catch (error: any) {
    console.error('GET /api/documenti-generati error:', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

  try {
    const raw = await request.json();
    const body = sanitizeBody(raw, DOCUMENTI_GENERATI_ALLOWED, 'documenti_generati.POST');
    const docRef = db.collection(COLLECTION).doc();
    const finalData: any = {
      ...body,
      id: docRef.id,
      dataCreazione: body.dataCreazione || new Date().toISOString(),
    };

    await docRef.set(finalData);

    return NextResponse.json({ success: true, id: docRef.id, data: finalData });
  } catch (error: any) {
    console.error('POST /api/documenti-generati error:', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

/**
 * Actualiza un documento YA EXISTENTE, en vez de crear otro.
 *
 * EL PROBLEMA QUE CIERRA. Reabrir un folio y volver a guardarlo creaba un
 * documento nuevo, con su propio PDF. Medido en produccion: los 320 documentos
 * del archivo son en realidad 171 visitas; sobran 149 copias, el 47 % del
 * archivo. Y no son visitas repetidas: el 95 % de los pares se crean el mismo
 * dia y 130 de 149 siguen el patron borrador-sin-firma -> copia-firmada en
 * menos de 24 h. Buscar un folio devolvia dos resultados casi identicos y nada
 * decia cual era el bueno.
 *
 * NO toca los 149 duplicados que ya existen: limpiarlos es otra decision y
 * otro script. Esto solo hace que de aqui en adelante haya UNO por visita.
 */
export async function PATCH(request: Request) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

  try {
    const raw = await request.json();

    // El id va aparte del cuerpo saneado: `sanitizeBody` lo descarta siempre
    // (esta en ALWAYS_FORBIDDEN) para que nadie pueda reescribirlo.
    let idSeguro: string;
    try {
      idSeguro = sanitizeFirestoreId(raw?.id);
    } catch (e: any) {
      console.warn('[documenti-generati PATCH] id rechazado:', raw?.id, '→', e.message);
      return NextResponse.json({ error: 'ID non valido' }, { status: 400 });
    }

    const ref = db.collection(COLLECTION).doc(idSeguro);
    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Documento non trovato' }, { status: 404 });
    }

    // Un documento marcado para eliminar no se resucita por la puerta de
    // atras: si alguien lo reabre, que se decida antes que hacer con el.
    if (doc.data()?._status === 'pendente_cancellazione') {
      return NextResponse.json(
        { error: 'Il documento è stato eliminato e non può essere aggiornato.' },
        { status: 409 },
      );
    }

    const body = sanitizeBody(raw, DOCUMENTI_GENERATI_ALLOWED, 'documenti_generati.PATCH');

    // `dataCreazione` NO se toca: es la fecha de la visita y es la clave por la
    // que se ordena y se pagina el archivo. Reabrir un folio de mayo en
    // septiembre no lo convierte en un folio de septiembre.
    delete (body as any).dataCreazione;

    await ref.update({
      ...body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: idSeguro });
  } catch (error: any) {
    console.error('PATCH /api/documenti-generati error:', error);
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
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    let idSeguro: string;
    try {
      idSeguro = sanitizeFirestoreId(id);
    } catch (e: any) {
      console.warn('[documenti-generati DELETE] id rechazado:', id, '→', e.message);
      return NextResponse.json({ error: 'ID non valido' }, { status: 400 });
    }

    const ref = db.collection(COLLECTION).doc(idSeguro);
    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Documento non trovato' }, { status: 404 });
    }

    const datos = doc.data() || {};

    // Ya estaba marcado: no se vuelve a marcar ni se duplica el registro.
    if (datos._status === 'pendente_cancellazione') {
      return NextResponse.json({ success: true, yaEliminado: true, firmato: tieneFirma(datos) });
    }

    // ────────────────────────────────────────────────────────────────────
    // AQUI YA NO SE BORRA NADA FISICAMENTE.
    //
    // Antes esto era `.doc(id).delete()` y el cliente borraba ademas el PDF
    // del bucket justo despues. Dos clics —papelera y confirmar— y un verbale
    // firmado, con la firma manuscrita del cliente y el importe de la
    // provvigione, desaparecia de Firestore y de Storage a la vez. Sin
    // papelera, sin purga diferida como en las otras tres colecciones y sin
    // constancia de quien lo hizo.
    //
    // Lo llamativo es que la propia ruta estaba escrita COMO SI el soft-delete
    // existiera: los dos GET filtran `_status !== 'pendente_cancellazione'` y
    // nadie escribia nunca ese centinela.
    //
    // Ahora se marca, y ya esta. El PDF se queda en el bucket: un documento
    // firmado no se destruye, y menos desde un boton de la lista.
    // ────────────────────────────────────────────────────────────────────
    const sesion = await sesionActual(request);
    await markForSoftDelete(COLLECTION, idSeguro, {
      email: sesion?.email ?? 'sconosciuto',
      role: sesion?.ruolo ?? 'sconosciuto',
      ip: getClientIp(request),
      label: String(datos.nomeFile || idSeguro),
    });

    return NextResponse.json({ success: true, firmato: tieneFirma(datos) });
  } catch (error: any) {
    console.error('DELETE /api/documenti-generati error:', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
