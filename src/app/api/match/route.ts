import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { calculateMatch, type MatchResult } from '@/lib/smart-matching';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { richiesta, page = 0, pageSize = 10, listaNera = [], propostiIds = [] } = body;

    if (!richiesta) {
      return NextResponse.json({ error: 'Missing richiesta object' }, { status: 400 });
    }

    // 1. Fetch ONLY active properties from Firestore (Sospeso === false).
    //    This query runs server-side: Firestore never sends suspended/deleted docs.
    //    If a property is suspended or deleted it is excluded immediately — no stale data.
    const snapshot = await db
      .collection('immobili')
      .where('GestioneCommerciale.Sospeso', '==', false)
      .get();

    const docsScanned = snapshot.size;

    // 2. Blacklist & already proposed filter
    const excludeIds = new Set([...(listaNera || []), ...(propostiIds || [])]);

    // 3. Score each property
    const allMatches: MatchResult[] = [];

    for (const doc of snapshot.docs) {
      const immobile = { id: doc.id, ...doc.data() };

      // Skip blacklisted/proposed
      if (excludeIds.has(doc.id)) continue;

      const result = calculateMatch(richiesta, immobile);

      // Only include results at or above the minimum quality threshold.
      // 65% ensures only genuinely relevant properties reach the agent.
      if (result && result.matchPercentage >= 65) {
        allMatches.push(result);
      }
    }

    // 4. Sort by matchPercentage descending
    allMatches.sort((a, b) => b.matchPercentage - a.matchPercentage);

    // 5. Paginate
    const startIndex = page * pageSize;
    const pageResults = allMatches.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < allMatches.length;

    return NextResponse.json({
      matches: pageResults,
      total: allMatches.length,
      page,
      pageSize,
      hasMore,
      docsScanned, // active properties evaluated (Sospeso === false)
    });

  } catch (error: any) {
    console.error('Smart Matching Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
