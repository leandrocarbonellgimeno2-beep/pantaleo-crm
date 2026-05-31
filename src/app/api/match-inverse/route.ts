import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { calculateMatch, generateMatchSummary } from '@/lib/smart-matching';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 15;
const MIN_SCORE = 40; // Filtro minimo: non mostrare match < 40%
const RECENCY_DAYS = 30; // Clienti degli ultimi 30 giorni = "Nuovi"
const RECENCY_BOOST = 3; // Bonus di +3 punti per clienti recenti

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { immobile, page = 0 } = body;

    if (!immobile) {
      return NextResponse.json({ error: 'Missing immobile data' }, { status: 400 });
    }

    // 1. Fetch clients. Los soft-deleted se filtran en JS más abajo, NO a nivel
    //    Firestore: `where('_status','!=',...)` EXCLUYE todo doc que carezca del
    //    campo `_status`, y los clientes activos creados antes del soft-delete no
    //    lo tienen → quedarían invisibles al match inverso. Campo ausente = activo.
    // Hard cap: ~470 clienti oggi, 2000 lascia margine 4x prima di toccare
    // questo limite. Se viene superato significa che bisogna migrare a una query
    // pre-filtrata (es. solo clienti con Richiesta non vuota).
    const snapshot = await db
      .collection('clienti')
      .limit(2000)
      .get();
    const allClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    const now = Date.now();
    const recencyThreshold = now - (RECENCY_DAYS * 24 * 60 * 60 * 1000);

    // 2. Score each client against this property
    const scoredClients: any[] = [];

    for (const cliente of allClients) {
      if (!cliente.Richiesta) continue; // Skip clients without search preferences
      if (cliente._status === 'pendente_cancellazione') continue;
      if (cliente.status === 'Sospeso' || cliente.status === 'Concluso') continue;

      const result = calculateMatch(cliente.Richiesta, immobile);
      if (!result || result.matchPercentage < MIN_SCORE) continue;

      // Parse creation date
      let createdAt: number = 0;
      const dateField = cliente.dataCreazione || cliente.createdAt || cliente.DataCreazione;
      if (dateField) {
        if (typeof dateField === 'object' && dateField._seconds) {
          createdAt = dateField._seconds * 1000; // Firestore Timestamp
        } else if (typeof dateField === 'string') {
          createdAt = new Date(dateField).getTime();
        } else if (typeof dateField === 'number') {
          createdAt = dateField;
        }
      }

      const isRecent = createdAt > recencyThreshold;

      // Recency boost + urgency boost (Alta = +5)
      const urgenzaBoost = cliente.Richiesta?.Urgenza === 'Alta' ? 5 : 0;
      const boostedScore = Math.min(100, result.matchPercentage + (isRecent ? RECENCY_BOOST : 0) + urgenzaBoost);

      scoredClients.push({
        clienteId: cliente.id,
        nome: cliente.DatiPersonali?.Nome || 'Sconosciuto',
        cognome: cliente.DatiPersonali?.Cognome || '',
        telefono: cliente.DatiPersonali?.Telefono || '',
        email: cliente.DatiPersonali?.Email || '',
        dataCreazione: createdAt || null,
        isRecent,
        matchPercentage: result.matchPercentage,
        boostedScore,
        breakdown: result.breakdown,
        summary: generateMatchSummary(result.breakdown),
        richiestaSummary: {
          operazione: cliente.Richiesta.Operazione?.Vendita ? 'Vendita' : cliente.Richiesta.Operazione?.Affitto ? 'Affitto' : 'Non spec.',
          tipologie: cliente.Richiesta.Tipologie || [],
          zone: cliente.Richiesta.Zone || [],
          budgetMax: cliente.Richiesta.Operazione?.Vendita
            ? cliente.Richiesta.BudgetAcquistoMax
            : cliente.Richiesta.BudgetAffittoMax,
        },
      });
    }

    // 3. Sort: by boostedScore DESC, then by date DESC (most recent first) for ties
    scoredClients.sort((a, b) => {
      const scoreDiff = b.boostedScore - a.boostedScore;
      // If scores are within 2 points of each other, sort by recency
      if (Math.abs(scoreDiff) <= 2) {
        return (b.dataCreazione || 0) - (a.dataCreazione || 0);
      }
      return scoreDiff;
    });

    // 4. Paginate (15 per page)
    const total = scoredClients.length;
    const start = page * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageResults = scoredClients.slice(start, end);
    const hasMore = end < total;

    return NextResponse.json({
      matches: pageResults,
      total,
      page,
      pageSize: PAGE_SIZE,
      hasMore,
    });

  } catch (error: any) {
    console.error('Match Inverse Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
