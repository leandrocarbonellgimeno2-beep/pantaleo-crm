import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

const COLLECTION_NAME = 'documenti_template';

export async function GET(request: Request) {
  try {
    const snapshot = await db.collection(COLLECTION_NAME).orderBy('dataCreazione', 'desc').limit(200).get();
    // Esclude i soft-deleted per coerenza con immobili/clienti/proprietari.
    const data = snapshot.docs
      .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
      .map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[documenti]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const docRef = db.collection(COLLECTION_NAME).doc();
    
    // Si trae un ID forzado, lo usamos (o actualizamos)
    const idToUse = body.id || docRef.id;
    const finalData = { ...body, id: idToUse };
    if (!finalData.dataCreazione) finalData.dataCreazione = new Date().toISOString();

    await db.collection(COLLECTION_NAME).doc(idToUse).set(finalData, { merge: true });
    
    return NextResponse.json({ success: true, id: idToUse, data: finalData });
  } catch (error: any) {
    console.error('[documenti]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await db.collection(COLLECTION_NAME).doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[documenti]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
