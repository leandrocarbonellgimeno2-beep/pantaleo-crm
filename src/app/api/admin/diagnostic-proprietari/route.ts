import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';

/**
 * GET /api/admin/diagnostic-proprietari
 *
 * Audits referential integrity between `immobili` and `proprietari`.
 * Returns:
 *  - allProprietari: every doc in the collection (id + key fields)
 *  - missingCreatedAt: proprietari docs that have no createdAt (were invisible before the fix)
 *  - orphanedImmobili: immobili whose proprietarioId doesn't exist in `proprietari`
 *  - nameMismatches: immobili where NomeProprietario doesn't match the linked proprietario name
 *
 * POST /api/admin/diagnostic-proprietari
 * Body: { action: 'stamp-created-at' }
 * Stamps createdAt = now on every proprietario that is missing it (batch write).
 */

export async function GET() {
  try {
    const [proprietariSnap, immobiliSnap] = await Promise.all([
      db.collection('proprietari').get(),
      db.collection('immobili').get(),
    ]);

    // Build a map id → proprietario for fast lookup
    const propMap = new Map<string, any>();
    proprietariSnap.docs.forEach((d) => {
      propMap.set(d.id, { id: d.id, ...d.data() });
    });

    const allProprietari = Array.from(propMap.values()).map((p) => ({
      id: p.id,
      nome: p.nome || p.Nome || p.NomeCompleto || p.nominativo || '',
      cognome: p.cognome || p.Cognome || '',
      email: p.email || p.Email || '',
      telefono: p.telefono || p.cell1 || p.Cellulare || '',
      hasCreatedAt: !!p.createdAt,
      fields: Object.keys(p).filter((k) => k !== 'id'),
    }));

    const missingCreatedAt = allProprietari.filter((p) => !p.hasCreatedAt);

    const orphanedImmobili: any[] = [];
    const nameMismatches: any[] = [];

    immobiliSnap.docs.forEach((d) => {
      const data = d.data();
      const pid = data.proprietarioId;
      const nomeInImmobile = data.DatiBase?.NomeProprietario || data.NomeProprietario || '';

      if (pid && !propMap.has(pid)) {
        orphanedImmobili.push({
          immobileId: d.id,
          codice: data.DatiBase?.Codice ?? '',
          indirizzo: data.DatiBase?.Indirizzo ?? '',
          proprietarioId: pid,
          nomeProprietario: nomeInImmobile,
        });
      } else if (pid && propMap.has(pid)) {
        const p = propMap.get(pid);
        const nomeProp = `${p.nome || p.Nome || p.NomeCompleto || p.nominativo || ''} ${p.cognome || p.Cognome || ''}`.trim().toLowerCase();
        const nomeImm = nomeInImmobile.toLowerCase();
        if (nomeImm && nomeProp && !nomeImm.includes(nomeProp.split(' ')[0]) && !nomeProp.includes(nomeImm.split(' ')[0])) {
          nameMismatches.push({
            immobileId: d.id,
            codice: data.DatiBase?.Codice ?? '',
            proprietarioId: pid,
            nomeInImmobile,
            nomeInProprietari: `${p.nome || p.Nome || ''} ${p.cognome || p.Cognome || ''}`.trim(),
          });
        }
      }
    });

    return NextResponse.json({
      counts: {
        totalProprietari: allProprietari.length,
        missingCreatedAt: missingCreatedAt.length,
        orphanedImmobili: orphanedImmobili.length,
        nameMismatches: nameMismatches.length,
      },
      allProprietari,
      missingCreatedAt,
      orphanedImmobili,
      nameMismatches,
    });
  } catch (error: any) {
    console.error('[diagnostic-proprietari GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === 'stamp-created-at') {
      const snap = await db.collection('proprietari').get();
      const toStamp = snap.docs.filter((d) => !d.data().createdAt);

      if (toStamp.length === 0) {
        return NextResponse.json({ success: true, stamped: 0, message: 'All proprietari already have createdAt.' });
      }

      // Firestore batch limit = 500 ops
      const BATCH_SIZE = 400;
      let stamped = 0;
      for (let i = 0; i < toStamp.length; i += BATCH_SIZE) {
        const batch = db.batch();
        toStamp.slice(i, i + BATCH_SIZE).forEach((d) => {
          batch.update(d.ref, { createdAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        await batch.commit();
        stamped += Math.min(BATCH_SIZE, toStamp.length - i);
      }

      return NextResponse.json({ success: true, stamped, message: `Stamped createdAt on ${stamped} proprietari.` });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[diagnostic-proprietari POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
