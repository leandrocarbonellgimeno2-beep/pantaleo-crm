/**
 * /api/presence — quien esta conectado.
 *
 * Nivel secretaria: saber donde esta cada companero es informacion de gestion,
 * no de uso diario.
 */
import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { listarPresencia } from '@/lib/services/presence';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    const data = await listarPresencia();
    return NextResponse.json({ data, online: data.filter((p) => p.online).length });
  } catch (error: any) {
    console.error('[presence GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
