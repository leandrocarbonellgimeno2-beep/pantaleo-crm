import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { sanitizeBody, CLIENTI_ALLOWED } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const q = searchParams.get('q')?.toLowerCase();
    const codice = searchParams.get('codice'); // buscar immobile por código
    const limitParams = searchParams.get('limit'); 
    const limitCount = limitParams ? parseInt(limitParams) : 0;

    // Fetch single client
    if (id) {
      const doc = await db.collection('clienti').doc(id).get();
      if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const docData = doc.data() as any;
      if (docData._status === 'pendente_cancellazione') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ id: doc.id, ...docData });
    }

    // Fetch immobile by codice (for manual add in matching tab)
    if (codice) {
      const snapshot = await db.collection('immobili')
        .where('DatiBase.Codice', '==', codice)
        .limit(1)
        .get();
      if (snapshot.empty) {
        return NextResponse.json({ error: `Nessun immobile trovato con codice ${codice}` }, { status: 404 });
      }
      const doc = snapshot.docs[0];
      return NextResponse.json({ id: doc.id, ...doc.data() });
    }

    // Optional server-side tipo filter — avoids loading entire collection
    // when only one operation type is requested.
    const tipo = searchParams.get('tipo'); // 'vendita' | 'affitto' | null

    let query: any = db.collection('clienti');
    if (tipo === 'vendita') {
      // No orderBy here — where+orderBy on different fields needs a composite
      // Firestore index. Sorting is handled client-side in useMemo (page.tsx).
      query = query.where('Richiesta.Operazione.Vendita', '==', true);
    } else if (tipo === 'affitto') {
      query = query.where('Richiesta.Operazione.Affitto', '==', true);
    } else {
      query = query.orderBy('createdAt', 'desc');
    }
    if (limitCount > 0) query = query.limit(limitCount);

    // Projection: omits large binary fields (firmaDigitale, etc.) not needed in the list.
    // Single-ID fetches (above) still return the full document.
    const snapshot = await query
      .select(
        'DatiPersonali', 'Richiesta', 'Matching', 'Caratteristiche',
        'status', '_status', 'createdAt', 'updatedAt', 'dataCreazione',
        'note', 'note_riservate',
        'nome', 'cognome', 'cell1', // legacy top-level fields
      )
      .get();
    let data = snapshot.docs
      .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
      .map((doc: any) => ({ id: doc.id, ...doc.data() }));

    if (q) {
      const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const nq = normalize(q);
      data = data.filter((c: any) => {
        const dp = c.DatiPersonali || {};
        const fullSearch = normalize(`${dp.Nome || ''} ${dp.Cognome || ''} ${dp.Telefono || ''} ${dp.Email || ''} ${dp.CittaResidenza || ''}`);
        return fullSearch.includes(nq);
      });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[clienti]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;
    const rest = sanitizeBody(body, CLIENTI_ALLOWED, id ? 'clienti.UPDATE' : 'clienti.CREATE');

    const clientData: any = {
      ...rest,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // UPDATE existing
    if (id) {
      await db.collection('clienti').doc(id).update(clientData);
      return NextResponse.json({ success: true, id });
    }

    // CREATE new
    clientData.createdAt = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection('clienti').add(clientData);
    return NextResponse.json({ success: true, id: ref.id });
  } catch (error: any) {
    console.error('[clienti]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // Block delete if client has associated generated documents
    const docsSnap = await db.collection('documenti_generati')
      .where('clienteId', '==', id)
      .limit(1)
      .get();
    if (!docsSnap.empty) {
      return NextResponse.json({
        error: 'Impossibile eliminare: il cliente ha documenti generati associati. Elimina prima i documenti dalla sezione Documenti.',
        hasDocuments: true,
      }, { status: 409 });
    }

    // Soft-delete: cron purges physically at midnight
    await db.collection('clienti').doc(id).update({
      _status: 'pendente_cancellazione',
      _deletedAt: Date.now(),
    });
    return NextResponse.json({ success: true, message: 'Client marked for deletion.' });
  } catch (error: any) {
    console.error('[clienti DELETE]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
