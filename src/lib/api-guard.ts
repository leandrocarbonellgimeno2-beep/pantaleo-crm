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
import { requireAuth, AuthError, type SessionPayload } from '@/lib/auth';
import { hasAtLeast, normalizeRole, type Role } from '@/lib/roles';

/**
 * La sesion de quien hace la peticion, para las rutas que ademas de
 * permitir o denegar necesitan saber QUIEN actua: el registro de auditoria
 * lo necesita para dejar constancia.
 *
 * Devuelve null en vez de lanzar. Se llama despues de que guard() haya
 * pasado, asi que en la practica nunca es null; devolverlo evita que un
 * caso imposible tumbe una ruta.
 */
export async function sesionActual(request: Request): Promise<SessionPayload | null> {
  try {
    return await requireAuth(request.headers.get('cookie'));
  } catch {
    return null;
  }
}

/**
 * Estado VIVO de un usuario: lo que dice `_users` AHORA, no lo que decía la
 * cookie cuando se emitió.
 *
 * POR QUÉ ESTO EXISTE, Y ES LA CORRECCIÓN DE UN FALLO SERIO
 * `tokenVersion` se escribe en cada cambio de rol, de estado y de contraseña,
 * pero NO se comparaba en ningún sitio, y ni siquiera viaja dentro de la
 * cookie, así que la comparación era imposible sin cambiar el formato del
 * token. Consecuencia: **degradar a alguien de propietario a agente no le
 * quitaba un solo permiso hasta que caducaba su sesión**, hasta ocho horas
 * después. Varios comentarios del propio código afirmaban lo contrario.
 *
 * La solución no necesita tocar la cookie. La lectura de `_users` ya se hacía
 * para comprobar el bloqueo, y ya estaba cacheada: ahora esa misma lectura
 * devuelve también el rol, y el guard compara contra ese. **Cero lecturas de
 * más.**
 *
 * EL ROL DE LA BASE MANDA, PERO SOLO SI HAY DOCUMENTO. Quien todavía entra por
 * AUTH_USERS_JSON no tiene registro en `_users`, y ahí se sigue usando el rol
 * de la cookie: cambiar eso dejaría a la agencia fuera del CRM.
 *
 * CUÁNTO TARDA EN SURTIR EFECTO. Hasta 30 segundos, no ocho horas. En la
 * instancia que hizo el cambio, al instante, porque la ruta de administración
 * invalida la entrada. En las demás, lo que quede de caché. Bajarlo a cero
 * exigiría una lectura de Firestore por petición, que es justo lo que esta
 * caché existe para evitar.
 */
const CACHE_MS = 30_000;

interface EstadoVivo {
  bloqueado: boolean;
  /** null = no hay documento en `_users`, así que manda el rol de la cookie. */
  rol: Role | null;
}

const cacheEstado = new Map<string, { estado: EstadoVivo; hasta: number }>();

/**
 * Tira la entrada cacheada de un usuario. La llaman las rutas que cambian su
 * rol o su estado, para que el cambio surta efecto ya en esta instancia en vez
 * de esperar a que expiren los treinta segundos.
 */
export function invalidarEstado(email: string): void {
  cacheEstado.delete(String(email || '').trim().toLowerCase());
}

async function estadoVivo(email: string): Promise<EstadoVivo> {
  const clave = email.trim().toLowerCase();
  const enCache = cacheEstado.get(clave);
  if (enCache && enCache.hasta > Date.now()) return enCache.estado;

  try {
    const { obtenerUsuario } = await import('@/lib/services/users');
    const u = await obtenerUsuario(clave);
    const estado: EstadoVivo = {
      bloqueado: u?.status === 'bloccato',
      rol: u ? normalizeRole(u.role) : null,
    };
    cacheEstado.set(clave, { estado, hasta: Date.now() + CACHE_MS });
    return estado;
  } catch (e: any) {
    // FALLA ABIERTO, y es una decisión consciente. Si Firestore no responde,
    // bloquear a todo el mundo dejaría a la agencia sin poder trabajar por un
    // problema de infraestructura. Sin rol de la base se cae al de la cookie,
    // que es lo que había antes de este cambio.
    //
    // El fallo NO se cachea: cachearlo alargaría a treinta segundos, por cada
    // error de red, la ventana en la que un bloqueo no surte efecto.
    console.error('[guard] no se pudo leer el estado, se deja pasar:', e?.message);
    return { bloqueado: false, rol: null };
  }
}

export async function guard(request: Request, minimo: Role): Promise<NextResponse | null> {
  try {
    // requireAuth y no requireRole: el nivel se comprueba mas abajo contra el
    // rol VIVO, no contra el que lleva la cookie.
    const sesion = await requireAuth(request.headers.get('cookie'));
    const estado = await estadoVivo(sesion.email);

    if (estado.bloqueado) {
      console.warn('[guard] peticion rechazada, usuario bloqueado:', sesion.email);
      return NextResponse.json(
        { error: 'Account disattivato. Contattare l\'amministratore.' },
        { status: 403 },
      );
    }

    // El rol de _users gana al de la cookie. Sin documento —quien todavia entra
    // por AUTH_USERS_JSON— se usa el de la cookie, como siempre.
    const rolEfectivo = estado.rol ?? sesion.ruolo;

    if (!hasAtLeast(rolEfectivo, minimo)) {
      if (estado.rol && hasAtLeast(sesion.ruolo, minimo)) {
        // La cookie alcanzaba y la base no: es exactamente el caso que antes se
        // colaba durante ocho horas.
        console.warn('[guard] rol degradado en base, cookie obsoleta:', sesion.email);
      }
      return NextResponse.json({ error: 'Permessi insufficienti' }, { status: 403 });
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
