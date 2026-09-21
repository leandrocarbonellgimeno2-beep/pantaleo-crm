import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { db } from '@/lib/firebase-admin';

// Dinamica, no cacheada en el edge. Antes era `revalidate = 300`, pero una
// respuesta que depende de quien la pide no se puede servir desde una cache
// compartida: le daria a cualquiera lo que se genero para otro.
//
// NOTA: esta ruta no tiene NINGUN consumidor en el repositorio. Vuelca los 870
// codigos del catalogo con su distribucion de tipos, o sea que es diagnostico
// que se quedo. Candidata a borrarse; mientras siga existiendo, al menos exige
// sesion.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Lectura, pero con guard: sin el, bloquear a alguien no le cortaba el
  // acceso a los datos. Un ex-empleado con la pestaña abierta seguia listando
  // clientes y descargando documentos durante las ocho horas que le quedaran
  // de sesion, porque ningun GET de negocio pasaba por aqui. «agente» es el
  // nivel mas bajo, asi que ningun rol pierde acceso: lo que se gana es que el
  // bloqueo y la degradacion surtan efecto de verdad.
  const denegado = await guard(request, 'agente');
  if (denegado) return denegado;
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
