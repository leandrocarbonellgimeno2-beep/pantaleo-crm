import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParams = searchParams.get('limit'); 
    const limitCount = limitParams ? parseInt(limitParams) : 50;

    // List all richieste order by createdAt desc
    const snapshot = await db.collection('richieste')
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();
      
    const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[richieste GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
