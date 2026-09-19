import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { db } from '@/lib/firebase-admin';
import { requireAuth, AuthError } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

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
  const denegado = await guard(request, 'propietario');
  if (denegado) return denegado;

  let session: any;
  try {
    session = await requireAuth(request.headers.get('cookie'));
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Throttle: massimo 3 backup ogni 10 minuti per utente. Un backup completo
  // scarica ~2000 docs Firestore — preserva la quota free-tier in caso di
  // click ripetuti o di un client buggato che ri-richiede in loop.
  const userKey = session?.email || getClientIp(request);
  const rl = await rateLimit({ key: `backup:${userKey}`, max: 3, windowMs: 10 * 60_000 });
  if (!rl.allowed) {
    console.warn(`[backup-db] rate-limited for ${userKey}, retry in ${rl.retryAfterSec}s`);
    return NextResponse.json(
      { error: `Troppi backup ravvicinati. Riprova tra ${Math.ceil(rl.retryAfterSec / 60)} minuti.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
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
