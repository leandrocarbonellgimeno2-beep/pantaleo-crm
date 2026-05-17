import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { requireAuth, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BATCH_SIZE = 500;

async function fetchAllPaginated(collectionName: string): Promise<any[]> {
  const allDocs: any[] = [];
  let lastVisible: any = null;

  while (true) {
    let q: any = db.collection(collectionName).limit(BATCH_SIZE);
    if (lastVisible) q = q.startAfter(lastVisible);

    const snap = await q.get();
    if (snap.empty) break;

    snap.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => allDocs.push({ _firestoreId: doc.id, ...doc.data() }));
    lastVisible = snap.docs[snap.docs.length - 1];

    if (snap.size < BATCH_SIZE) break;
  }

  return allDocs;
}

export async function GET(request: Request) {
  try {
    await requireAuth(request.headers.get('cookie'));
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  try {
    const [immobiliData, proprietariData, clientiData] = await Promise.all([
      fetchAllPaginated('immobili'),
      fetchAllPaginated('proprietari'),
      fetchAllPaginated('clienti'),
    ]);

    const elapsedMs = Date.now() - startTime;

    const backup = {
      timestamp,
      elapsedMs,
      totalImmobili: immobiliData.length,
      totalProprietari: proprietariData.length,
      totalClienti: clientiData.length,
      collections: {
        immobili: immobiliData,
        proprietari: proprietariData,
        clienti: clientiData,
      },
    };

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="backup_${timestamp}.json"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      status: '❌ error',
      message: error.message,
    }, { status: 500 });
  }
}
