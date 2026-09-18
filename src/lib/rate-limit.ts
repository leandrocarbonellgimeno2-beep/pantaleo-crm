/**
 * Rate limiter distribuido, sobre Firestore.
 *
 * POR QUÉ NO VALÍA EL ANTERIOR
 * Era un Map en memoria de proceso. El comentario original decía que en Vercel
 * «la misma instancia serializa varias peticiones secuenciales, que es
 * exactamente el caso que queremos proteger». Eso es cierto para el tráfico
 * normal y falso justo para el ataque: quien hace fuerza bruta abre peticiones
 * EN PARALELO, Vercel escala a varias instancias y cada una arranca con su
 * propio Map vacío. Los «7 intentos cada 15 minutos» del login eran en realidad
 * 7 por instancia, multiplicables abriendo conexiones a la vez. Un cold start
 * bastaba además para borrar el contador.
 *
 * POR QUÉ FIRESTORE Y NO REDIS
 * firebase-admin ya está en el proyecto y configurado. Upstash o Vercel KV
 * exigirían una dependencia nueva y variables de entorno nuevas que habría que
 * dar de alta en producción. El coste aquí es 1 lectura + 1 escritura por
 * intento de login, despreciable para el volumen de un CRM de equipo pequeño.
 *
 * SOBRE LOS DATOS
 * Usa una colección propia `_rate_limits`, con guion bajo delante para que se
 * distinga de las de negocio. No lee ni escribe en immobili, clienti,
 * proprietari ni appointments. Cada documento lleva `expiresAt`: se puede
 * activar una política TTL de Firestore sobre ese campo para que se limpien
 * solos, sin cron adicional.
 *
 * FALLA ABIERTO. Si Firestore no responde, se permite la petición y se deja un
 * aviso en el log. Dejar al equipo fuera de su propio CRM por un problema de
 * infraestructura es peor que perder temporalmente el límite.
 */
const COLLECTION = '_rate_limits';

export interface RateLimitOptions {
  /** Número máximo de peticiones permitidas en la ventana. */
  max: number;
  /** Duración de la ventana en milisegundos. */
  windowMs: number;
  /** Identificador, p. ej. "login:1.2.3.4" o "backup:usuario@x.com". */
  key: string;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Intentos que quedan en la ventana actual. */
  remaining: number;
  /** Segundos hasta que se reinicia el contador. */
  retryAfterSec: number;
}

/**
 * Convierte una clave arbitraria en un id de documento válido.
 * Firestore no admite `/` en los ids, y limita su longitud a 1500 bytes.
 * Se exporta para poder cubrirlo con tests.
 */
export function toDocId(key: string): string {
  return key.replace(/[/\\]/g, '_').slice(0, 300) || 'unknown';
}

export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  // Import perezoso a propósito: firebase-admin lanza al cargarse si faltan las
  // credenciales, así que un import estático obligaría a inicializar Firebase
  // solo por importar este módulo — por ejemplo desde un test de toDocId.
  const { db } = await import('@/lib/firebase-admin');

  const now = Date.now();
  const ref = db.collection(COLLECTION).doc(toDocId(opts.key));

  try {
    return await db.runTransaction<RateLimitResult>(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() as { count: number; resetAt: number }) : null;

      // Ventana nueva: o no existía el documento, o el anterior ya caducó.
      if (!data || data.resetAt < now) {
        const resetAt = now + opts.windowMs;
        tx.set(ref, {
          count: 1,
          resetAt,
          // Para la política TTL de Firestore. Se deja el doble de la ventana
          // de margen para que el borrado nunca adelante a un contador vivo.
          expiresAt: new Date(now + opts.windowMs * 2),
        });
        return { allowed: true, remaining: opts.max - 1, retryAfterSec: 0 };
      }

      const count = data.count + 1;
      const retryAfterSec = Math.ceil((data.resetAt - now) / 1000);

      // Se incrementa también cuando ya está bloqueado: así insistir no
      // adelanta el desbloqueo, y el contador refleja la presión real.
      tx.update(ref, { count });

      if (count > opts.max) {
        return { allowed: false, remaining: 0, retryAfterSec };
      }
      return { allowed: true, remaining: opts.max - count, retryAfterSec };
    });
  } catch (error: any) {
    console.error(
      `[rate-limit] Firestore no respondió para "${opts.key}", se permite la petición:`,
      error?.message || error,
    );
    return { allowed: true, remaining: opts.max - 1, retryAfterSec: 0 };
  }
}

/** Extrae la IP del cliente. En Vercel, x-forwarded-for empieza por la real. */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}
