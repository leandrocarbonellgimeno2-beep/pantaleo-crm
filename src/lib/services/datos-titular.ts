/**
 * Lee y escribe los datos de la agencia en Firestore.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DÓNDE VIVEN Y POR QUÉ AHÍ
 *
 * En `_config/datos_titular`. El guion bajo es la convención que el proyecto
 * ya usa para lo que es infraestructura y no negocio: `_users`, `_audit_logs`,
 * `_rate_limits`, `_presence`. Un documento de configuración no es una ficha
 * de cliente y no tiene por qué mezclarse con ellas.
 *
 * Es una colección NUEVA. No se toca, ni se lee, ni se migra nada de lo que ya
 * existe.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA LECTURA NO PUEDE FALLAR NUNCA
 *
 * De esto dependen `/privacy` y `/terms`, que son públicas y que Google visita
 * para publicar la aplicación OAuth. Si una caída de Firestore tumbara esas
 * dos páginas, Google vería un error donde espera una política y rechazaría la
 * publicación — y el token del calendario seguiría caducando cada siete días.
 *
 * Por eso `leerDatosTitular` devuelve los campos vacíos ante cualquier
 * problema en lugar de lanzar: la página se pinta igual, con los marcadores de
 * «da completare», que es exactamente lo que se ve antes de rellenarlos.
 *
 * Y por eso `firebase-admin` se importa PEREZOSAMENTE, dentro del `try`.
 * `lib/firebase-admin.ts` lanza en la EVALUACIÓN DEL MÓDULO si falta alguna
 * variable de entorno de la service account. Con un import estático ese throw
 * ocurriría antes de que existiera el `try`, así que una credencial mal puesta
 * en Vercel tumbaría `/privacy` y `/terms` con un 500 — justo lo que esta
 * función promete que no puede pasar. Es el mismo patrón que ya usa
 * `services/audit.ts`.
 */
import { audit } from '@/lib/services/audit';
import {
  DATOS_VACIOS,
  normalizarDatos,
  validarDatos,
  camposQueFaltan,
  type ClaveTitular,
  type DatosTitular,
} from '@/lib/datos-titular';

const COLECCION = '_config';
const DOCUMENTO = 'datos_titular';

export interface DatosTitularGuardados {
  datos: DatosTitular;
  /** false si el documento todavía no existe: nadie los ha rellenado aún. */
  existe: boolean;
  /** Cuándo se guardaron por última vez, en ms. null si nunca. */
  actualizadoAt: number | null;
  /** Quién los guardó la última vez. */
  actualizadoPor: string | null;
  /** true si la lectura falló y lo que se devuelve son los campos vacíos. */
  errorDeLectura: boolean;
}

/** El documento, con el SDK cargado en el momento y no al importar. */
async function ref() {
  const { db } = await import('@/lib/firebase-admin');
  return db.collection(COLECCION).doc(DOCUMENTO);
}

export async function leerDatosTitular(): Promise<DatosTitularGuardados> {
  try {
    const doc = await (await ref()).get();

    if (!doc.exists) {
      return {
        datos: DATOS_VACIOS,
        existe: false,
        actualizadoAt: null,
        actualizadoPor: null,
        errorDeLectura: false,
      };
    }

    const d = doc.data() || {};
    return {
      datos: normalizarDatos(d),
      existe: true,
      actualizadoAt: typeof d.actualizadoAt === 'number' ? d.actualizadoAt : null,
      actualizadoPor: typeof d.actualizadoPor === 'string' ? d.actualizadoPor : null,
      errorDeLectura: false,
    };
  } catch (e: any) {
    // Se avisa por consola y se sigue: ver la nota de la cabecera.
    console.error('[datos-titular] no se pudieron leer:', e?.message);
    return {
      datos: DATOS_VACIOS,
      existe: false,
      actualizadoAt: null,
      actualizadoPor: null,
      errorDeLectura: true,
    };
  }
}

export interface ActorGuardado {
  email: string;
  role: string;
  ip?: string;
}

export type ResultadoGuardado =
  | { ok: true; datos: DatosTitular; faltan: ClaveTitular[] }
  | { ok: false; errores: Partial<Record<ClaveTitular, string>> };

/**
 * Guarda los datos, tras validarlos.
 *
 * Escribe SOLO las claves conocidas —`normalizarDatos` descarta cualquier otra
 * cosa que venga en el cuerpo— más quién y cuándo. Un `set` con merge, no un
 * reemplazo: si algún día el documento lleva algo más, no se lo lleva por
 * delante.
 */
export async function guardarDatosTitular(
  crudo: unknown,
  actor: ActorGuardado,
): Promise<ResultadoGuardado> {
  const datos = normalizarDatos(crudo);

  const errores = validarDatos(datos);
  if (Object.keys(errores).length > 0) {
    return { ok: false, errores };
  }

  const anterior = await leerDatosTitular();
  const cambiados = (Object.keys(datos) as ClaveTitular[]).filter(
    (k) => datos[k] !== anterior.datos[k],
  );

  const { admin } = await import('@/lib/firebase-admin');
  await (await ref()).set(
    {
      ...datos,
      actualizadoAt: Date.now(),
      actualizadoPor: actor.email,
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Los datos del titular acaban publicados en dos páginas accesibles sin
  // sesión: merece constancia de quién los cambió. Se registran los NOMBRES de
  // los campos, nunca los valores, como en el resto del registro.
  audit({
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'config.datos_titular.update',
    target: { collection: COLECCION, id: DOCUMENTO, label: 'Dati aziendali' },
    changedFields: cambiados,
    ip: actor.ip,
  });

  return { ok: true, datos, faltan: camposQueFaltan(datos) };
}
