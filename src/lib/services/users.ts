/**
 * Coleccion _users: la fuente de verdad de las credenciales, en migracion.
 *
 * El guion bajo marca que es infraestructura y no negocio, igual que
 * _rate_limits. De ahi se copian tambien las dos convenciones que importan:
 * import PEREZOSO de firebase-admin (lanza al cargarse si faltan credenciales)
 * y no tumbar nunca al usuario por un problema de infraestructura.
 *
 * LA DISTINCION QUE SOSTIENE TODA LA MIGRACION. Una busqueda puede acabar de
 * tres maneras, no de dos:
 *   encontrado  -> este documento manda; ni se mira el JSON
 *   no-existe   -> el usuario aun no esta migrado; toca el JSON, y si valida
 *                  se escribe aqui
 *   error       -> NO SE SABE si existe. Firestore no contesto.
 *
 * Confundir "no existe" con "no he podido mirar" es lo que dejaria a la agencia
 * entera fuera el dia que Firestore tenga un mal minuto. Por eso son estados
 * distintos y el que llama esta obligado a decidir sobre los tres.
 */
import { normalizeRole, type Role } from '@/lib/roles';
import { sanitizeFirestoreId } from '@/lib/sanitize';

const COLLECTION = '_users';

export interface UserDoc {
  email: string;
  nome: string;
  role: Role;
  passwordHash: string;
  status: 'attivo' | 'bloccato';
  mustResetPassword: boolean;
  /** Reservado para la revocacion de sesiones; todavia no se compara. */
  tokenVersion: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export type BusquedaUsuario =
  | { estado: 'encontrado'; usuario: UserDoc }
  | { estado: 'no-existe' }
  | { estado: 'error' };

/**
 * Id del documento.
 *
 * El email en minusculas, y esto NO es cosmetico: la busqueda en el JSON es
 * insensible a mayusculas (el login compara con toLowerCase), pero Firestore
 * distingue. Sin normalizar, entrar como Mario@x.it y como mario@x.it crearia
 * dos documentos para la misma persona.
 */
export function userDocId(email: string): string {
  return sanitizeFirestoreId(String(email).trim().toLowerCase());
}

export async function buscarUsuario(email: string): Promise<BusquedaUsuario> {
  try {
    const { db } = await import('@/lib/firebase-admin');
    const snap = await db.collection(COLLECTION).doc(userDocId(email)).get();

    if (!snap.exists) return { estado: 'no-existe' };

    const d = snap.data() as any;
    // Un documento sin hash no sirve para autenticar. Se trata como si no
    // existiera para que el JSON pueda rescatar el login en vez de bloquearlo.
    if (!d?.passwordHash || typeof d.passwordHash !== 'string') {
      console.warn('[_users] documento sin passwordHash, se ignora:', userDocId(email));
      return { estado: 'no-existe' };
    }

    return {
      estado: 'encontrado',
      usuario: {
        email: d.email ?? email,
        nome: d.nome ?? '',
        role: normalizeRole(d.role),
        passwordHash: d.passwordHash,
        status: d.status === 'bloccato' ? 'bloccato' : 'attivo',
        mustResetPassword: d.mustResetPassword === true,
        tokenVersion: typeof d.tokenVersion === 'number' ? d.tokenVersion : 1,
        createdAt: d.createdAt ?? 0,
        updatedAt: d.updatedAt ?? 0,
        createdBy: d.createdBy ?? '',
      },
    };
  } catch (e: any) {
    // NO se traduce a "no existe". Quien llama tiene que poder distinguirlo.
    console.error('[_users] lookup fallido, se degrada al JSON:', e?.message);
    return { estado: 'error' };
  }
}

/**
 * Crea el documento a partir de un login validado contra el JSON.
 *
 * NUNCA lanza. Si esto falla, el usuario ya ha demostrado quien es y tiene que
 * entrar igual: se reintentara sola en el siguiente login. Hacer depender la
 * entrada de una escritura seria cambiar un problema de seguridad por uno de
 * disponibilidad.
 *
 * Usa create() y no set(): si dos pestanas entran a la vez, la segunda choca
 * con ALREADY_EXISTS y se ignora, en vez de pisar el documento.
 */
export async function migrarUsuarioDesdeLegacy(params: {
  email: string;
  nome: string;
  ruolo: unknown;
  passwordHash: string;
}): Promise<void> {
  try {
    const { db } = await import('@/lib/firebase-admin');
    const ahora = Date.now();

    const doc: UserDoc = {
      email: params.email.trim().toLowerCase(),
      nome: params.nome ?? '',
      role: normalizeRole(params.ruolo),
      passwordHash: params.passwordHash,
      status: 'attivo',
      mustResetPassword: false,
      tokenVersion: 1,
      createdAt: ahora,
      updatedAt: ahora,
      createdBy: 'migrazione-automatica',
    };

    await db.collection(COLLECTION).doc(userDocId(params.email)).create(doc);
    console.log('[_users] usuario migrado desde AUTH_USERS_JSON:', doc.email);
  } catch (e: any) {
    // ALREADY_EXISTS es el caso normal de dos pestanas a la vez: no es un error.
    if (e?.code === 6 || /already exists/i.test(e?.message ?? '')) return;
    console.error('[_users] no se pudo migrar el usuario (entra igual):', e?.message);
  }
}
