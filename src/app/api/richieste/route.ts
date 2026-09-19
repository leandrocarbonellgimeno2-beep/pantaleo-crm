import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParams = searchParams.get('limit');

    // `parseInt` sin validar era un 500 y un full-scan a petición: ?limit=abc
    // da NaN y ?limit=-1 un negativo, y Firestore lanza con ambos; ?limit=99999
    // traía la colección entera. Se acota a un rango sensato.
    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 200;
    const parsed = limitParams ? Number.parseInt(limitParams, 10) : DEFAULT_LIMIT;
    const limitCount = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, MAX_LIMIT)
      : DEFAULT_LIMIT;

    // List all richieste order by createdAt desc
    // NOTA: esta ruta no tiene hoy ningun consumidor en el repositorio; su
    // ultimo llamador era el dashboard viejo. Se proyecta igualmente por
    // coherencia, pero es candidata a eliminarse.
    const snapshot = await db.collection('richieste')
      .orderBy('createdAt', 'desc')
      .select('nome', 'cognome', 'telefono', 'immobileCodice', 'createdAt')
      .limit(limitCount)
      .get();
      
    const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[richieste GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
