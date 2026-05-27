import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { sanitizeBody, IMMOBILI_ALLOWED } from '@/lib/sanitize';
import { markForSoftDelete } from '@/lib/services/soft-delete';
import { recountProprietario } from '@/lib/services/proprietari-counter';
import { extractImageUrls } from '@/lib/imageUtils';
import type { Property } from '@/types/property';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const proprietarioId = searchParams.get('proprietarioId');
    const qRaw = searchParams.get('q');
    const q = qRaw ? qRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : undefined;
    const codice = searchParams.get('codice');
    const limitCount = parseInt(searchParams.get('limit') || '50');
    const cursor = searchParams.get('cursor');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    // Helper: strip full images array to reduce payload size
    const stripToThumbnail = (doc: any) => {
      const { images, ...rest } = doc;
      return { ...rest, thumbnail: images?.[0] || null, imageCount: images?.length || 0 };
    };

    // 1. Single ID fetch (full document) — with image normalization for backward compat
    if (id) {
      const doc = await db.collection('immobili').doc(id).get();
      if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const data: any = { id: doc.id, ...doc.data() };
      if (data._status === 'pendente_cancellazione') return NextResponse.json({ error: 'Not found' }, { status: 404 });

      // Image legacy normalization — fonte unica in lib/imageUtils.
      if (!Array.isArray(data.images) || data.images.length === 0) {
        const uniqueUrls = extractImageUrls(data);
        if (uniqueUrls.length > 0) data.images = uniqueUrls;
      }

      return NextResponse.json(data);
    }

    // 2. Fetch by Owner
    if (proprietarioId) {
      const snapshot = await db.collection('immobili').where('proprietarioId', '==', proprietarioId).get();
      return NextResponse.json(
        snapshot.docs
          .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
          .map(doc => ({ id: doc.id, ...doc.data() }))
      );
    }

    // 3. Exact code lookup
    if (codice) {
      const snapshot = await db.collection('immobili').where('DatiBase.Codice', '==', codice).limit(10).get();
      let docs = snapshot.docs
        .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
        .map((doc: any) => stripToThumbnail({ id: doc.id, ...doc.data() }));
      if (status === 'attivi') docs = docs.filter((d: any) => !d.GestioneCommerciale?.Sospeso);
      else if (status === 'sospesi') docs = docs.filter((d: any) => d.GestioneCommerciale?.Sospeso === true);
      if (type === 'vendita') docs = docs.filter((d: any) => d.GestioneCommerciale?.InVendita === true);
      if (type === 'affitto') docs = docs.filter((d: any) => d.GestioneCommerciale?.InAffitto === true);
      return NextResponse.json({ data: docs, nextCursor: null, totalCount: docs.length });
    }

    // 4. Build base Firestore query — ALL status+type filters pushed to DB level
    let baseQuery: any = db.collection('immobili');
    if (status === 'sospesi') baseQuery = baseQuery.where('GestioneCommerciale.Sospeso', '==', true);
    else if (status === 'attivi') baseQuery = baseQuery.where('GestioneCommerciale.Sospeso', '==', false);
    if (type === 'vendita') baseQuery = baseQuery.where('GestioneCommerciale.InVendita', '==', true);
    else if (type === 'affitto') baseQuery = baseQuery.where('GestioneCommerciale.InAffitto', '==', true);

    let query = baseQuery.orderBy('DatiBase.Codice', 'desc');

    // 5. Projection: only fields used by the list UI — reduces Lambda↔Browser payload ~80%.
    //    Single-ID fetches (above) still return the full document.
    const snapshot = await query
      .select(
        'DatiBase.Codice', 'DatiBase.Indirizzo', 'DatiBase.Citta', 'DatiBase.Zona',
        'DatiBase.Tipologia', 'DatiBase.Riferimento', 'DatiBase.SortKey',
        'GestioneCommerciale.PrezzoVendita', 'GestioneCommerciale.PrezzoAffitto',
        'GestioneCommerciale.InVendita', 'GestioneCommerciale.InAffitto', 'GestioneCommerciale.Sospeso',
        'DettagliFisici.MetriCommerciali', 'DettagliFisici.CamereLetto', 'DettagliFisici.Bagni',
        'images', '_status', 'proprietarioId', 'createdAt',
        'Idealista.idealistaStatus',
      )
      .limit(1000)
      .get();
    const docs = snapshot.docs
      .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
      .map((doc: any) => stripToThumbnail({ id: doc.id, ...doc.data() }));

    // Text search in-memory (Firestore doesn't support full-text natively)
    if (q) {
      const filtered = docs.filter((i: any) => {
        const s = `${i.DatiBase?.Codice || ''} ${i.DatiBase?.Riferimento || ''} ${i.DatiBase?.Indirizzo || ''} ${i.DatiBase?.Citta || ''} ${i.DatiBase?.Zona || ''}`
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return s.includes(q);
      });
      return NextResponse.json({ data: filtered, totalCount: filtered.length });
    }

    return NextResponse.json({ data: docs, totalCount: docs.length });
  } catch (error: any) {
    console.error('[immobili GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const updates = sanitizeBody(body, IMMOBILI_ALLOWED, 'immobili.PATCH');

    // Guard: never overwrite images/thumbnail with empty/falsy values.
    // A PATCH for text fields (Textos, DatiBase, etc.) must never accidentally
    // wipe photos if the client omits or sends an empty array.
    if (!updates.images || (Array.isArray(updates.images) && (updates.images as any[]).length === 0)) {
      delete (updates as any).images;
    }
    if (!updates.thumbnail) {
      delete (updates as any).thumbnail;
    }

    await db.collection('immobili').doc(id).update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[immobili PATCH]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body: any = sanitizeBody(rawBody, IMMOBILI_ALLOWED, 'immobili.POST');
    const now = Date.now().toString();

    // ── Auto-increment Codice — atomic via Firestore counter document ────────
    // Uses a dedicated counter doc (counters/immobili_codice) so concurrent POSTs
    // can never produce duplicate codes. On first use the counter is bootstrapped
    // from the current max in the collection, then all increments are transactional.
    const BASE_CODE = 1000000;
    try {
      const counterRef = db.collection('counters').doc('immobili_codice');

      // Check once outside the transaction so we can bootstrap if needed
      const counterSnap = await counterRef.get();
      let seedValue = BASE_CODE;

      if (!counterSnap.exists) {
        // One-time bootstrap: scan existing codes to find the true max
        const snapshot = await db.collection('immobili').select('DatiBase.Codice').get();
        for (const doc of snapshot.docs) {
          const raw = doc.data()?.DatiBase?.Codice;
          if (raw) {
            const parsed = parseInt(String(raw), 10);
            if (!isNaN(parsed) && parsed > seedValue) seedValue = parsed;
          }
        }
      }

      // Atomic increment — if two requests race on initialization, the transaction
      // retry mechanism ensures each gets a unique value
      const nextCode = await db.runTransaction(async (tx) => {
        const cd = await tx.get(counterRef);
        const current = cd.exists ? (cd.data()!.value as number) : seedValue;
        const next = current + 1;
        tx.set(counterRef, { value: next });
        return next;
      });

      if (!body.DatiBase) body.DatiBase = {};
      body.DatiBase.Codice = String(nextCode);
    } catch (codeErr: any) {
      // Non-fatal: if the counter transaction fails, keep whatever the frontend sent
      console.error('[Auto-Codice] Failed to assign next code:', codeErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Ensure SortKey exists for pagination
    if (!body.DatiBase.SortKey) {
      body.DatiBase.SortKey = now;
    }

    const docRef = await db.collection('immobili').add({
      ...body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Keep proprietario counter in sync — increment atomically so concurrent
    // creates never produce a stale count.
    if (body.proprietarioId) {
      await db.collection('proprietari').doc(body.proprietarioId).update({
        numero_immobili: admin.firestore.FieldValue.increment(1),
      }).catch(() => {}); // non-fatal: counter will be corrected by sync-counters if needed
    }

    return NextResponse.json({ id: docRef.id, codice: body.DatiBase.Codice, success: true });
  } catch (error: any) {
    console.error('[immobili POST]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    const docRef = db.collection('immobili').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const data = doc.data() as Property;

    await markForSoftDelete('immobili', id);
    if (data.proprietarioId) await recountProprietario(data.proprietarioId);

    return NextResponse.json({ success: true, message: 'Property marked for deletion.' });
  } catch (error: any) {
    console.error('[immobili DELETE]', error);
    return NextResponse.json({ error: 'Eliminazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
