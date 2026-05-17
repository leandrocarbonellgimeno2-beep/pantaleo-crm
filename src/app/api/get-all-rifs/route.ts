import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const revalidate = 300; // Cache at Vercel edge for 5 minutes

export async function GET() {
  try {
    // Only fetch the Codice field — 95% less data than full documents
    const snapshot = await db.collection('immobili').select('DatiBase.Codice').get();

    const entries = snapshot.docs.map(doc => {
      const data = doc.data();
      const codice = data.DatiBase?.Codice;
      return {
        firestoreId: doc.id,
        codice: codice ?? null,
        tipoDeDato: typeof codice,
      };
    });

    // Group by type to see distribution
    const typeDistribution: Record<string, number> = {};
    entries.forEach(e => {
      typeDistribution[e.tipoDeDato] = (typeDistribution[e.tipoDeDato] || 0) + 1;
    });

    const codigos = entries
      .map(e => String(e.codice))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return NextResponse.json({
      total: entries.length,
      typeDistribution,
      sampleRaw: entries.slice(0, 5),
      codigos,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
