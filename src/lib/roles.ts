/**
 * Los cuatro roles del CRM y su jerarquia.
 *
 * Modulo PURO a proposito: lo importa src/lib/auth.ts, que a su vez lo importa
 * el middleware, y el middleware corre en Edge. Nada de Node aqui dentro.
 *
 * Hoy el rol viaja de AUTH_USERS_JSON a la cookie y de la cookie a React, y ahi
 * muere: no hay ni una sola comparacion de rol en todo el proyecto. Esto es la
 * base para que empiece a haberlas.
 */

export const ROLES = ['master', 'admin', 'agente', 'lectura'] as const;
export type Role = (typeof ROLES)[number];

/** Mayor numero, mas permisos. Comparar niveles evita listas de roles por ruta. */
const NIVEL: Record<Role, number> = {
  master: 4,
  admin: 3,
  agente: 2,
  lectura: 1,
};

/**
 * Rol de partida cuando el valor recibido no se reconoce.
 *
 * ES 'agente' Y NO 'lectura', y conviene entender por que. No puedo leer los
 * valores reales de AUTH_USERS_JSON: Vercel marca esa variable como Sensitive y
 * en local solo llega el texto [SENSITIVE]. Asi que la lista de alias de abajo
 * es lo mejor que puedo cubrir a ciegas.
 *
 * Si un valor no encaja, degradar a 'lectura' dejaria a esa persona sin poder
 * trabajar en cuanto las rutas empiecen a comprobar el rol. Degradar a 'agente'
 * le deja hacer su trabajo diario y le niega la administracion. Y no afloja
 * nada respecto a hoy: ahora mismo CUALQUIER usuario autenticado puede hacerlo
 * absolutamente todo, asi que esto solo quita permisos, nunca los anade.
 *
 * Cada vez que aparece un valor no reconocido se registra un aviso con el valor
 * concreto, de modo que los logs de produccion acaban diciendo exactamente que
 * roles hay sin necesidad de leer el secreto.
 */
export const ROL_POR_DEFECTO: Role = 'agente';

const ALIAS: Record<string, Role> = {
  // master
  master: 'master',
  superadmin: 'master',
  'super-admin': 'master',
  owner: 'master',
  propietario: 'master',
  titolare: 'master',
  // admin
  admin: 'admin',
  administrador: 'admin',
  administrator: 'admin',
  amministratore: 'admin',
  // agente
  agente: 'agente',
  agent: 'agente',
  user: 'agente',
  usuario: 'agente',
  utente: 'agente',
  commerciale: 'agente',
  // lectura
  lectura: 'lectura',
  lector: 'lectura',
  readonly: 'lectura',
  'read-only': 'lectura',
  viewer: 'lectura',
  lettura: 'lectura',
  'sola-lettura': 'lectura',
};

/**
 * Lleva cualquier valor a uno de los cuatro roles.
 *
 * Nunca lanza: un rol raro en una cookie no debe romper una peticion, tiene que
 * degradar a algo previsible.
 */
export function normalizeRole(raw: unknown): Role {
  if (typeof raw !== 'string') return ROL_POR_DEFECTO;

  const limpio = raw.trim().toLowerCase().replace(/[_\s]+/g, '-');
  const conocido = ALIAS[limpio];
  if (conocido) return conocido;

  // El aviso es la forma de descubrir que valores hay de verdad en produccion
  // sin tener acceso a la variable de entorno.
  console.warn(`[roles] valor de rol no reconocido: "${raw}" → se trata como ${ROL_POR_DEFECTO}`);
  return ROL_POR_DEFECTO;
}

/** true si `rol` alcanza al menos el nivel de `minimo`. */
export function hasAtLeast(rol: unknown, minimo: Role): boolean {
  return NIVEL[normalizeRole(rol)] >= NIVEL[minimo];
}
