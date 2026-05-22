import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

const COLLECTION = 'documenti_generati';

/**
 * GET  → Fetch all generated documents (ordered by date desc)
 * POST → Save new generated document metadata
 * DELETE → Remove a generated document by ID
 */

export async function GET() {
  try {
    const snapshot = await db.collection(COLLECTION).orderBy('dataCreazione', 'desc').limit(200).get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('GET /api/documenti-generati error:', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const docRef = db.collection(COLLECTION).doc();
    const finalData = {
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
