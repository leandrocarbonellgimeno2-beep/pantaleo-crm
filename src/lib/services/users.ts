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
 *
 * ESTE MODULO NO HASHEA. El hashing vive en lib/password.ts, que usa
 * node:crypto, y aqui se recibe el hash ya hecho. Asi este fichero se puede
 * importar desde cualquier sitio sin arrastrar dependencias de Node.
 */
import { normalizeRole, ROLES, type Role } from '@/lib/roles';
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

/** Lo que sale hacia el cliente. Sin passwordHash, nunca. */
export type UserPublic = Omit<UserDoc, 'passwordHash'> & { id: string };

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

function aPublico(id: string, d: any): UserPublic {
  return {
    id,
    email: d.email ?? id,
    nome: d.nome ?? '',
    role: normalizeRole(d.role),
    status: d.status === 'bloccato' ? 'bloccato' : 'attivo',
    mustResetPassword: d.mustResetPassword === true,
    tokenVersion: typeof d.tokenVersion === 'number' ? d.tokenVersion : 1,
    createdAt: d.createdAt ?? 0,
    updatedAt: d.updatedAt ?? 0,
    createdBy: d.createdBy ?? '',
  };
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
      usuario: { ...aPublico(snap.id, d), passwordHash: d.passwordHash } as UserDoc,
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

// ── Panel de administracion ──────────────────────────────────────────────────

export type ValidacionNuevoUsuario =
  | { ok: true; datos: { email: string; nome: string; password: string; role: Role } }
  | { ok: false; error: string };

// Comprobacion deliberadamente sencilla. Validar direcciones de correo con una
// expresion regular exhaustiva es un clasico que acaba rechazando direcciones
// legitimas; lo unico que hace falta aqui es descartar lo que no puede ser un
// correo ni un id de documento valido.
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

/** Longitud minima de contrasena para un alta desde el panel. */
export const PASSWORD_MIN = 10;

/**
 * Valida la entrada del formulario de alta.
 *
 * Funcion pura y exportada para poder cubrirla con tests: es la unica barrera
 * entre lo que escribe un navegador y lo que acaba en la base de datos.
 */
export function validarNuevoUsuario(input: {
  email?: unknown;
  nome?: unknown;
  password?: unknown;
  role?: unknown;
}): ValidacionNuevoUsuario {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const nome = typeof input.nome === 'string' ? input.nome.trim() : '';
  // La contrasena NO se recorta: un espacio al final forma parte de ella, y
  // recortarla aqui haria que el alta y el login no coincidieran.
  const password = typeof input.password === 'string' ? input.password : '';
  const role = typeof input.role === 'string' ? input.role.trim().toLowerCase() : '';

  if (!email) return { ok: false, error: 'Email obbligatoria' };
  if (email.length > 200) return { ok: false, error: 'Email troppo lunga' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Email non valida' };

  if (!nome) return { ok: false, error: 'Nome obbligatorio' };
  if (nome.length > 120) return { ok: false, error: 'Nome troppo lungo' };

  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `La password deve avere almeno ${PASSWORD_MIN} caratteri` };
  }
  if (password.length > 200) return { ok: false, error: 'Password troppo lunga' };

  // El rol se comprueba contra la lista EXACTA, sin pasar por normalizeRole: en
  // un alta manual, un rol mal escrito tiene que ser un error visible y no
  // degradarse en silencio a otro nivel.
  if (!(ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: `Ruolo non valido. Valori ammessi: ${ROLES.join(', ')}` };
  }

  return { ok: true, datos: { email, nome, password, role: role as Role } };
}

/** Listado para el panel. Nunca devuelve el hash. */
export async function listarUsuarios(): Promise<UserPublic[]> {
  const { db } = await import('@/lib/firebase-admin');
  const snap = await db.collection(COLLECTION).limit(500).get();
  return snap.docs
    .map((d: any) => aPublico(d.id, d.data()))
    .sort((a: UserPublic, b: UserPublic) => a.email.localeCompare(b.email));
}

export type ResultadoAlta =
  | { ok: true; usuario: UserPublic }
  | { ok: false; motivo: 'duplicado' };

/**
 * Alta desde el panel.
 *
 * Recibe el hash ya calculado: este modulo no hashea (ver la cabecera).
 *
 * Usa create() y no set() a proposito. Con set(), dar de alta un email que ya
 * existe PISARIA al usuario existente, cambiandole la contrasena y el rol sin
 * avisar. Con create() choca, y eso se traduce en un 409 que el panel muestra.
 */
export async function crearUsuario(params: {
  email: string;
  nome: string;
  role: Role;
  passwordHash: string;
  createdBy: string;
}): Promise<ResultadoAlta> {
  const { db } = await import('@/lib/firebase-admin');
  const ahora = Date.now();

  const doc: UserDoc = {
    email: params.email.trim().toLowerCase(),
    nome: params.nome,
    role: params.role,
    passwordHash: params.passwordHash,
    status: 'attivo',
    mustResetPassword: false,
    tokenVersion: 1,
    createdAt: ahora,
    updatedAt: ahora,
    createdBy: params.createdBy,
  };

  try {
    await db.collection(COLLECTION).doc(userDocId(params.email)).create(doc);
  } catch (e: any) {
    if (e?.code === 6 || /already exists/i.test(e?.message ?? '')) {
      return { ok: false, motivo: 'duplicado' };
    }
    throw e;
  }

  const { passwordHash: _omitido, ...publico } = doc;
  return { ok: true, usuario: { id: userDocId(params.email), ...publico } };
}
