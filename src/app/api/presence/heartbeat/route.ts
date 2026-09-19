/**
 * /api/presence/heartbeat — latido de presencia.
 *
 * Lo llama cualquier usuario autenticado sobre SU PROPIA presencia: el email
 * sale de la sesion y no del cuerpo, asi que nadie puede aparentar ser otro.
 *
 * Acepta tambien la salida, que llega por navigator.sendBeacon al cerrar la
 * pestana. sendBeacon solo sabe hacer POST y no espera respuesta, de ahi que
 * sea el mismo endpoint con una bandera en vez de un DELETE.
 */
import { NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';
import { latir, salir } from '@/lib/services/presence';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let sesion;
  try {
    sesion = await requireAuth(request.headers.get('cookie'));
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as any));

  if (body?.offline === true) {
    await salir(sesion.email);
    return NextResponse.json({ ok: true });
  }

  await latir({
    email: sesion.email,
    nome: sesion.nome,
    role: sesion.ruolo,
    currentPage: body?.currentPage,
    ip: getClientIp(request),
  });

  return NextResponse.json({ ok: true });
}
