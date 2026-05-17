import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      immobiliAttiviSnap,
      immobiliSospesiSnap,
      immobiliVenditaSnap,
      immobiliAffittoSnap,
      clientiTotaliSnap,
      proprietariTotaliSnap,
    ] = await Promise.all([
      // Active = not suspended
      db.collection('immobili').where('GestioneCommerciale.Sospeso', '==', false).count().get(),
      // Suspended
      db.collection('immobili').where('GestioneCommerciale.Sospeso', '==', true).count().get(),
      // For sale (active)
      db.collection('immobili')
        .where('GestioneCommerciale.Sospeso', '==', false)
        .where('GestioneCommerciale.InVendita', '==', true)
        .count()
        .get(),
      // For rent (active)
      db.collection('immobili')
        .where('GestioneCommerciale.Sospeso', '==', false)
        .where('GestioneCommerciale.InAffitto', '==', true)
        .count()
        .get(),
      db.collection('clienti').count().get(),
      db.collection('proprietari').count().get(),
    ]);

    return NextResponse.json(
      {
        immobiliAttivi:    immobiliAttiviSnap.data().count,
        immobiliSospesi:   immobiliSospesiSnap.data().count,
        immobiliVendita:   immobiliVenditaSnap.data().count,
        immobiliAffitto:   immobiliAffittoSnap.data().count,
        clientiTotali:     clientiTotaliSnap.data().count,
        proprietariTotali: proprietariTotaliSnap.data().count,
      },
      {
        headers: {
          // CDN serves cached stats for 60 s; revalidates in the background for up to 5 min.
          // Stats change only on create/delete — staleness of 1 min is imperceptible.
          'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error: any) {
    console.error('[stats GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
