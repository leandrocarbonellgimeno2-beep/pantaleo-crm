/**
 * Los cuatro roles del CRM y su jerarquia.
 *
 * Modulo PURO a proposito: lo importa src/lib/auth.ts, que a su vez lo importa
 * el middleware, y el middleware corre en Edge. Nada de Node aqui dentro.
 *
 * ┌──────────────┬───────┬────────────────────────────────────────────────────┐
 * │ propietario  │ nivel 4 │ control total                                    │
 * │ secretaria   │ nivel 3 │ gestion de la agencia                            │
 * │ vendedor     │ nivel 2 │ uso diario: crear inmuebles, clientes, citas     │
 * │ agente       │ nivel 1 │ SOLO LECTURA                                     │
 * └──────────────┴───────┴────────────────────────────────────────────────────┘
 *
 * ATENCION AL NOMBRE "agente". Aqui es el nivel MAS BAJO, el de solo lectura.
 * Es contraintuitivo, porque en una inmobiliaria un agente es quien vende, y
 * porque en la version anterior de este fichero "agente" era el nivel
 * intermedio. Quien lea esto dentro de seis meses y asuma lo contrario le
 * quitara permisos a alguien sin darse cuenta. El que vende es "vendedor".
 */

export const ROLES = ['propietario', 'secretaria', 'vendedor', 'agente'] as const;
export type Role = (typeof ROLES)[number];

/** Mayor numero, mas permisos. Comparar niveles evita listas de roles por ruta. */
const NIVEL: Record<Role, number> = {
  propietario: 4,
  secretaria: 3,
  vendedor: 2,
  agente: 1,
};

/**
 * Rol de partida cuando el valor recibido no se reconoce.
 *
 * Es 'vendedor': puede trabajar, no puede administrar. Degradar a 'agente'
 * dejaria a esa persona sin poder hacer nada en cuanto las rutas comprueban el
 * rol, y subirla a 'secretaria' seria regalar permisos que nadie concedio.
 *
 * Cada valor no reconocido deja un aviso con el valor concreto, de modo que los
 * logs acaban diciendo que roles hay de verdad. Hace falta porque Vercel marca
 * AUTH_USERS_JSON como Sensitive y su contenido no se puede leer desde aqui.
 */
export const ROL_POR_DEFECTO: Role = 'vendedor';

const ALIAS: Record<string, Role> = {
  // ── nivel 4 ──────────────────────────────────────────────────────────────
  propietario: 'propietario',
  proprietario: 'propietario',
  titular: 'propietario',
  titolare: 'propietario',
  master: 'propietario',
  superadmin: 'propietario',
  'super-admin': 'propietario',
  owner: 'propietario',

  // ── nivel 3 ──────────────────────────────────────────────────────────────
  secretaria: 'secretaria',
  secretario: 'secretaria',
  segretaria: 'secretaria',
  admin: 'secretaria',
  administrador: 'secretaria',
  administrator: 'secretaria',
  amministratore: 'secretaria',

  // ── nivel 2 ──────────────────────────────────────────────────────────────
  vendedor: 'vendedor',
  vendedora: 'vendedor',
  venditore: 'vendedor',
  comercial: 'vendedor',
  commerciale: 'vendedor',
  'agente-comercial': 'vendedor',
  user: 'vendedor',
  usuario: 'vendedor',
  utente: 'vendedor',

  // ── nivel 1, solo lectura ────────────────────────────────────────────────
  agente: 'agente',
  agent: 'agente',
  lectura: 'agente',
  lector: 'agente',
  readonly: 'agente',
  'read-only': 'agente',
  viewer: 'agente',
  lettura: 'agente',
  'sola-lettura': 'agente',
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

  console.warn(`[roles] valor de rol no reconocido: "${raw}" → se trata como ${ROL_POR_DEFECTO}`);
  return ROL_POR_DEFECTO;
}

/** true si `rol` alcanza al menos el nivel de `minimo`. */
export function hasAtLeast(rol: unknown, minimo: Role): boolean {
  return NIVEL[normalizeRole(rol)] >= NIVEL[minimo];
}
