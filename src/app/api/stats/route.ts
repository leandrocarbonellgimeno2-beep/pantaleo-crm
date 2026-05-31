import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Conteos derivados por resta para que un `Sospeso` ausente jamás oculte un
    // inmueble: attivi = total − sospesi (campo ausente ⇒ cuenta como activo).
    // Igual para vendita/affitto: (marcados) − (marcados & suspendidos).
    const imm = db.collection('immobili');
    const [
      immobiliTotaliSnap,
      immobiliSospesiSnap,
      venditaTotSnap,
      venditaSospSnap,
      affittoTotSnap,
      affittoSospSnap,
      clientiTotaliSnap,
      proprietariTotaliSnap,
    ] = await Promise.all([
      imm.count().get(),
      imm.where('GestioneCommerciale.Sospeso', '==', true).count().get(),
      imm.where('GestioneCommerciale.InVendita', '==', true).count().get(),
      imm.where('GestioneCommerciale.InVendita', '==', true)
         .where('GestioneCommerciale.Sospeso', '==', true).count().get(),
      imm.where('GestioneCommerciale.InAffitto', '==', true).count().get(),
      imm.where('GestioneCommerciale.InAffitto', '==', true)
         .where('GestioneCommerciale.Sospeso', '==', true).count().get(),
      db.collection('clienti').count().get(),
      db.collection('proprietari').count().get(),
    ]);

    const immobiliTotali  = immobiliTotaliSnap.data().count;
    const immobiliSospesi = immobiliSospesiSnap.data().count;

    return NextResponse.json(
      {
        immobiliAttivi:    immobiliTotali - immobiliSospesi,
        immobiliSospesi:   immobiliSospesi,
        immobiliVendita:   venditaTotSnap.data().count - venditaSospSnap.data().count,
        immobiliAffitto:   affittoTotSnap.data().count - affittoSospSnap.data().count,
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
