import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { sanitizeBody, PROPRIETARI_ALLOWED } from '@/lib/sanitize';
import { markForSoftDelete } from '@/lib/services/soft-delete';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (id) {
      const doc = await db.collection('proprietari').doc(id).get();
      if (!doc.exists) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ id: doc.id, ...doc.data() });
    }

    // Fetch ALL proprietari WITHOUT orderBy — using orderBy('createdAt') would
    // silently exclude documents that lack the createdAt field (Firestore treats
    // orderBy as an implicit "field exists" filter). Migrated records without
    // createdAt would disappear from the list entirely.
    // Fetch immobili in parallel to compute the real per-owner count.
    // Safety cap: 677 proprietari attivi → 2000 lascia margine 3x.
    // 806 immobili → 1500 idem.
    const [snapshot, immobiliSnap] = await Promise.all([
      db.collection('proprietari').limit(2000).get(),
      // Projection: only the 2 fields needed to compute the live count.
      // This avoids transferring ~4.5 MB of full immobili documents on every owner list load.
      db.collection('immobili').select('proprietarioId', '_status').limit(1500).get(),
    ]);

    // Build a real-time count map: proprietarioId → number of immobili
    const immobiliCount = new Map<string, number>();
    immobiliSnap.docs.forEach((d: any) => {
      if (d.data()._status === 'pendente_cancellazione') return;
      const pid = d.data().proprietarioId;
      if (pid) immobiliCount.set(pid, (immobiliCount.get(pid) ?? 0) + 1);
    });

    const allP = snapshot.docs.filter((d: any) => d.data()._status !== 'pendente_cancellazione').map((d: any) => {
      const data = d.data();
      const realCount = immobiliCount.get(d.id) ?? 0;
      // Overwrite the stale stored counter with the live count so the UI
      // always shows a number that matches the actual immobili documents.
      data.numero_immobili = realCount;
      data.immobili_collegati = Array(realCount).fill('id');
      return { id: d.id, ...data };
    });

    // Sort: newest createdAt first → oldest → records with no date last.
    // Using -1 as sentinel guarantees no-date items never sort before real dates.
    const toMs = (p: any): number => {
      if (!p.createdAt) return -1;
      const s = p.createdAt._seconds ?? p.createdAt.seconds;
      if (s != null) return s * 1000;
      if (typeof p.createdAt.toMillis === 'function') return p.createdAt.toMillis();
      return -1;
    };

    allP.sort((a: any, b: any) => {
      const aMs = toMs(a);
      const bMs = toMs(b);
      if (aMs === -1 && bMs === -1) return 0;
      if (aMs === -1) return 1;   // a has no date → goes after b
      if (bMs === -1) return -1;  // b has no date → goes after a
      return bMs - aMs;           // both dated → newest first
    });

    return NextResponse.json(allP);
  } catch (error: any) {
    console.error('[proprietari GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const updates = sanitizeBody(body, PROPRIETARI_ALLOWED, 'proprietari.PATCH');

    await db.collection('proprietari').doc(id).update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[proprietari PATCH]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = sanitizeBody(body, PROPRIETARI_ALLOWED, 'proprietari.POST');

    const docRef = await db.collection('proprietari').add({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error('[proprietari POST]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // Block delete if proprietario has active (non-soft-deleted) immobili
    const immobiliSnap = await db.collection('immobili')
      .where('proprietarioId', '==', id)
      .get();
    const hasActive = immobiliSnap.docs.some(
      (d: any) => d.data()._status !== 'pendente_cancellazione'
    );
    if (hasActive) {
      return NextResponse.json({
        error: 'Impossibile eliminare: il proprietario ha immobili associati. Scollega o elimina prima gli immobili.',
        hasImmobili: true,
      }, { status: 409 });
    }

    await markForSoftDelete('proprietari', id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[proprietari DELETE]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
