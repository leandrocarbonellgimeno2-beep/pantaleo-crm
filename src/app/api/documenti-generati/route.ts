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
    const snapshot = await db.collection(COLLECTION)
      .orderBy('dataCreazione', 'desc')
      .limit(200)
      .select(
        'nomeFile', 'categoria', 'urlDownload', 'dataCreazione',
        'clienteNome', 'clienteId', 'sezione', 'azione',
        'fileName', 'size', '_status',
      )
      .get();
    // Esclude i soft-deleted per coerenza con immobili/clienti/proprietari.
    const data = snapshot.docs
      .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
      .map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(data);
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
