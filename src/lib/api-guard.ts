/**
 * Guardia de rol para rutas de API.
 *
 * Devuelve una respuesta si hay que denegar, o null si se puede seguir. Se usa
 * asi, como primera linea del handler:
 *
 *     const denegado = await guard(request, 'vendedor');
 *     if (denegado) return denegado;
 *
 * POR QUE DEVUELVE UNA RESPUESTA EN VEZ DE LANZAR. Casi todos los handlers del
 * proyecto envuelven su cuerpo en un try/catch que termina en un 500 generico.
 * Si la comprobacion lanzara, ese catch convertiria un "no tienes permiso" en
 * un "error del servidor": el usuario veria un fallo en vez de entender que le
 * falta un permiso, y en los logs parecerian caidas donde no las hay. Al
 * devolver la respuesta, da igual donde se coloque la llamada.
 *
 * Esta funcion NUNCA lanza, ni siquiera ante un error inesperado: ante la duda
 * deniega.
 */
import { NextResponse } from 'next/server';
import { requireRole, AuthError } from '@/lib/auth';
import type { Role } from '@/lib/roles';

export async function guard(request: Request, minimo: Role): Promise<NextResponse | null> {
  try {
    await requireRole(request, minimo);
    return null;
  } catch (e: any) {
    if (e instanceof AuthError) {
      // 401 si no hay sesion valida, 403 si la hay pero no alcanza el nivel.
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('[guard] error inesperado al comprobar el rol:', e?.message);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
