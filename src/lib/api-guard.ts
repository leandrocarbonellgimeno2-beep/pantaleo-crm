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
 * POR QUE LA REVOCACION SE COMPRUEBA AQUI Y NO EN lib/auth.ts. auth.ts lo
 * importa el middleware, que corre en Edge, donde firebase-admin no funciona.
 * Este modulo solo lo importan rutas de API, que corren en Node.
 *
 * Esta funcion NUNCA lanza: ante un error de permisos deniega, y ante un fallo
 * de infraestructura deja pasar (ver la nota de abajo).
 */
import { NextResponse } from 'next/server';
import { requireRole, AuthError } from '@/lib/auth';
import type { Role } from '@/lib/roles';

/**
 * Cache en memoria del estado de cada usuario.
 *
 * La comprobacion de bloqueo cuesta una lectura de Firestore, y sin cache seria
 * una por cada escritura del CRM. Treinta segundos es el retardo maximo con el
 * que un bloqueo surte efecto, y a cambio la inmensa mayoria de las peticiones
 * no pagan nada. Cada instancia serverless tiene la suya y se pierde al
 * reciclarse, que es justo lo que se quiere de una cache asi.
 */
const CACHE_MS = 30_000;
const cacheEstado = new Map<string, { bloqueado: boolean; hasta: number }>();

async function estaBloqueado(email: string): Promise<boolean> {
  const clave = email.trim().toLowerCase();
  const enCache = cacheEstado.get(clave);
  if (enCache && enCache.hasta > Date.now()) return enCache.bloqueado;

  try {
    const { obtenerUsuario } = await import('@/lib/services/users');
    const u = await obtenerUsuario(clave);
    // Sin documento en _users no hay nada que revocar: es un usuario que
    // todavia entra por AUTH_USERS_JSON.
    const bloqueado = u?.status === 'bloccato';
    cacheEstado.set(clave, { bloqueado, hasta: Date.now() + CACHE_MS });
    return bloqueado;
  } catch (e: any) {
    // FALLA ABIERTO, y es una decision consciente. Si Firestore no responde,
    // bloquear a todo el mundo dejaria a la agencia sin poder trabajar por un
    // problema de infraestructura. El riesgo que se acepta a cambio es que un
    // usuario recien bloqueado siga escribiendo durante ese rato; su sesion
    // caduca en ocho horas de todas formas.
    console.error('[guard] no se pudo comprobar el bloqueo, se deja pasar:', e?.message);
    return false;
  }
}

export async function guard(request: Request, minimo: Role): Promise<NextResponse | null> {
  try {
    const sesion = await requireRole(request, minimo);

    if (await estaBloqueado(sesion.email)) {
      console.warn('[guard] escritura rechazada, usuario bloqueado:', sesion.email);
      return NextResponse.json(
        { error: 'Account disattivato. Contattare l\'amministratore.' },
        { status: 403 },
      );
    }

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
