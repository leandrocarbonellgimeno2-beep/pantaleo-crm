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

    // 1. Fetch properties. Los suspendidos se filtran en JS (no a nivel Firestore):
    //    `where('Sospeso','==',false)` EXCLUYE todo doc sin el campo, ocultando
    //    inmuebles activos creados sin él. Ausente/false = activo. Los soft-deleted
    //    también se descartan en el loop.
    // Traia los 806 documentos COMPLETOS, con los cuatro arrays de fotos
    // legacy incluidos, para leer una veintena de campos. El ahorro es de
    // Firestore a la lambda: el documento entero nunca salia al navegador.
    //
    // DOS COSAS QUE ES FACIL DEJARSE Y ROMPEN LA PANTALLA EN SILENCIO:
    //  - `images` es de primer nivel y en la salida se llama mainImage. Sin el,
    //    todas las tarjetas de matching pierden la foto.
    //  - `Caratteristiche` va ENTERO, nunca por subcampos: smart-matching lo
    //    recorre con car[clave] y la clave la elige el cliente en su peticion.
    //    Proyectar subcampos sueltos haria desaparecer inmuebles de cualquier
    //    busqueda que pidiera una caracteristica no proyectada.
    const snapshot = await db
      .collection('immobili')
      .select(
        'DatiBase.Codice', 'DatiBase.Zona', 'DatiBase.Tipologia',
        'DatiBase.Citta', 'DatiBase.Indirizzo',
        'GestioneCommerciale.InVendita', 'GestioneCommerciale.InAffitto',
        'GestioneCommerciale.PrezzoVendita', 'GestioneCommerciale.PrezzoAffitto',
        'GestioneCommerciale.Sospeso',
        'DettagliFisici.MetriCommerciali', 'DettagliFisici.CamereLetto',
        'DettagliFisici.StatoFiniture', 'DettagliFisici.Bagni',
        'DettagliFisici.Vani', 'DettagliFisici.Piano',
        'Caratteristiche',
        'Textos.Descrizione',
        'images',
        '_status',
      )
      .limit(1000)
      .get();

    // 2. Blacklist & already proposed filter
    const excludeIds = new Set([...(listaNera || []), ...(propostiIds || [])]);

    // 3. Score each property
    const allMatches: MatchResult[] = [];
    let docsScanned = 0; // inmuebles activos (no suspendidos, no borrados) evaluados

    for (const doc of snapshot.docs) {
      const immobile = { id: doc.id, ...doc.data() };

      // Skip blacklisted/proposed
      if (excludeIds.has(doc.id)) continue;

      // Skip soft-deleted properties
      if ((immobile as any)._status === 'pendente_cancellazione') continue;

      // Skip suspendidos — filtrado aquí (no en Firestore) para que los docs sin
      // el campo `Sospeso` se traten como activos y nunca se oculten en silencio.
      if ((immobile as any).GestioneCommerciale?.Sospeso) continue;

      docsScanned++;
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
