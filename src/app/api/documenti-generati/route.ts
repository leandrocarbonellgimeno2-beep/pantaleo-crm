import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { db } from '@/lib/firebase-admin';
import { sanitizeBody, DOCUMENTI_GENERATI_ALLOWED } from '@/lib/sanitize';

const COLLECTION = 'documenti_generati';

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

export async function DELETE(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await db.collection(COLLECTION).doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/documenti-generati error:', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
