import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

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
 */

export async function GET() {
  try {
    const [proprietariSnap, immobiliSnap] = await Promise.all([
      // proprietari: full doc — il diagnostico elenca `Object.keys(p)` per
      // rilevare incoerenze di schema, quindi NON si può proiettare.
      db.collection('proprietari').get(),
      // immobili: proiezione ai soli campi usati qui sotto. Evita di scaricare
      // ~800 documenti completi (con immagini) quando servono solo 4 campi.
      db.collection('immobili')
        .select('proprietarioId', 'DatiBase.Codice', 'DatiBase.Indirizzo', 'DatiBase.NomeProprietario', 'NomeProprietario')
        .get(),
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
