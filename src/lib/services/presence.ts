/**
 * Presencia — coleccion _presence.
 *
 * Quien esta conectado ahora mismo, en que pantalla y desde cuando.
 *
 * POR QUE UN LATIDO CONTRA LA API PROPIA Y NO EL SDK DE FIREBASE EN EL CLIENTE.
 * El proyecto no tiene SDK cliente de Firebase, y las reglas de Storage y
 * Firestore estan en deny-all precisamente para que el navegador no hable
 * nunca con la base de datos. Meter el SDK aqui para "tiempo real" abriria esa
 * puerta entera a cambio de una funcion accesoria. El latido cuesta una
 * escritura cada 45 segundos y no cambia el modelo de seguridad.
 *
 * EL COSTE, CON NUMEROS. Cuatro agentes por ocho horas, dividido entre 45
 * segundos, son unas 2.500 escrituras al dia: la mayor fuente de escrituras de
 * todo el plan, y aun asi dentro del plan gratuito de 20.000. Se reduce a la
 * mitad subiendo el latido a 90 segundos si alguna vez molesta.
 *
 * DOS COSAS QUE ABARATAN ESTO MAS DE LO QUE PARECE:
 *   - Solo se late con la pestana VISIBLE. Una pestana de fondo no escribe
 *     nada, y en la practica la mitad del tiempo lo estan.
 *   - Al cerrar, sendBeacon marca la salida al instante. Sin eso habria que
 *     esperar a que caducara el latido para ver a alguien desconectado.
 */
import { sanitizeFirestoreId } from '@/lib/sanitize';

const COLLECTION = '_presence';

/** Se considera conectado si su ultimo latido es de hace menos de esto. */
export const VENTANA_ONLINE_MS = 90_000;

/** Caducidad del documento. Firestore lo borra solo con su politica TTL. */
const TTL_MS = 60 * 60 * 1000;

export interface PresenciaPublica {
  email: string;
  nome: string;
  role: string;
  currentPage: string;
  lastSeenAt: number;
  online: boolean;
}

function docId(email: string): string {
  return sanitizeFirestoreId(String(email).trim().toLowerCase());
}

/** Recorta un texto que viene del navegador antes de guardarlo. */
function limpiar(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Registra un latido. NUNCA lanza: la presencia es accesoria y no puede
 * estropear una sesion de trabajo.
 */
export async function latir(params: {
  email: string;
  nome: string;
  role: string;
  currentPage: unknown;
  ip?: string;
}): Promise<void> {
  try {
    const { db, admin } = await import('@/lib/firebase-admin');
    const ahora = Date.now();

    await db.collection(COLLECTION).doc(docId(params.email)).set(
      {
        email: params.email.trim().toLowerCase(),
        nome: params.nome ?? '',
        role: params.role ?? '',
        currentPage: limpiar(params.currentPage, 120),
        ip: params.ip ?? '',
        lastSeenAt: admin.firestore.Timestamp.fromMillis(ahora),
        expiresAt: admin.firestore.Timestamp.fromMillis(ahora + TTL_MS),
      },
      { merge: true },
    );
  } catch (e: any) {
    console.error('[presence] latido fallido:', e?.message);
  }
}

/**
 * Marca la salida.
 *
 * Se retrasa lastSeenAt mas alla de la ventana en vez de borrar el documento:
 * asi el panel puede seguir mostrando "visto por ultima vez a las..." en lugar
 * de que la persona desaparezca sin dejar rastro.
 */
export async function salir(email: string): Promise<void> {
  try {
    const { db, admin } = await import('@/lib/firebase-admin');
    await db.collection(COLLECTION).doc(docId(email)).set(
      {
        lastSeenAt: admin.firestore.Timestamp.fromMillis(Date.now() - VENTANA_ONLINE_MS - 1000),
      },
      { merge: true },
    );
  } catch (e: any) {
    console.error('[presence] salida fallida:', e?.message);
  }
}

/** Decide si un latido cuenta como conectado. Pura, para poder cubrirla. */
export function estaOnline(lastSeenAt: number, ahora = Date.now()): boolean {
  return Number.isFinite(lastSeenAt) && lastSeenAt > 0 && ahora - lastSeenAt < VENTANA_ONLINE_MS;
}

export async function listarPresencia(): Promise<PresenciaPublica[]> {
  const { db } = await import('@/lib/firebase-admin');
  // El equipo es de unas pocas personas: no hace falta paginar ni filtrar en
  // la consulta. El tope es una red de seguridad, no una funcionalidad.
  const snap = await db.collection(COLLECTION).limit(100).get();
  const ahora = Date.now();

  return snap.docs
    .map((d: any) => {
      const x = d.data();
      const lastSeenAt = x.lastSeenAt?.toMillis?.() ?? 0;
      return {
        email: x.email ?? d.id,
        nome: x.nome ?? '',
        role: x.role ?? '',
        currentPage: x.currentPage ?? '',
        lastSeenAt,
        online: estaOnline(lastSeenAt, ahora),
      };
    })
    .sort((a: PresenciaPublica, b: PresenciaPublica) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return b.lastSeenAt - a.lastSeenAt;
    });
}
