import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Que bloquear y degradar a alguien surta efecto DE VERDAD.
 *
 * El fallo que estos tests fijan: `tokenVersion` se escribía en cada cambio
 * pero no se comparaba en ningún sitio —ni siquiera viajaba dentro de la
 * cookie— así que degradar a una persona de propietario a agente no le quitaba
 * un solo permiso hasta que caducaba su sesión, hasta ocho horas después. Y
 * bloquear solo cortaba las escrituras: ningún GET de negocio pasaba por el
 * guard, de modo que un ex-empleado seguía listando clientes y descargando
 * documentos toda la jornada.
 *
 * Como en los otros tests de permisos, la autenticación NO se simula: se firma
 * un token real con `signSession` y se manda en la cookie. Lo único que se
 * sustituye es Firestore, que es donde vive el estado que el guard consulta.
 */

process.env.SESSION_SECRET = 'secreto-de-pruebas-suficientemente-largo-123456';

const { obtenerUsuario, listarUsuarios } = vi.hoisted(() => ({
  obtenerUsuario: vi.fn(async (_email: string) => null as any),
  listarUsuarios: vi.fn(async () => [] as any[]),
}));

vi.mock('@/lib/services/users', () => ({
  obtenerUsuario,
  listarUsuarios,
  crearUsuario: vi.fn(),
  actualizarUsuario: vi.fn(),
  validarNuevoUsuario: vi.fn(),
  validarPassword: vi.fn(),
  contarPropietariosActivos: vi.fn(async () => 2),
  PASSWORD_MIN: 10,
}));

vi.mock('@/lib/services/audit', () => ({ audit: vi.fn() }));

const { consulta } = vi.hoisted(() => {
  const c: any = {};
  Object.assign(c, {
    where: () => c,
    orderBy: () => c,
    select: () => c,
    startAfter: () => c,
    limit: () => c,
    get: async () => ({ docs: [], empty: true, size: 0 }),
    doc: () => ({ get: async () => ({ exists: false }) }),
  });
  return { consulta: c };
});

vi.mock('@/lib/firebase-admin', () => ({
  db: { collection: () => consulta },
  admin: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
}));

import { signSession } from '@/lib/auth';
import { invalidarEstado } from '@/lib/api-guard';
import { GET as leerInmuebles } from '@/app/api/immobili/route';
import { GET as leerClientes } from '@/app/api/clienti/route';
import { GET as leerFichero } from '@/app/api/files/route';
import { GET as leerUsuarios } from '@/app/api/admin/users/route';
import { PATCH as editarInmueble } from '@/app/api/immobili/route';

/** Cómo está el usuario en `_users` ahora mismo. */
const enLaBase = (role: string, status: 'attivo' | 'bloccato' = 'attivo') =>
  obtenerUsuario.mockImplementation(async () => ({
    id: 'x', email: 'x@pantaleo.it', nome: 'X', role, status,
    mustResetPassword: false, tokenVersion: 1, createdAt: 0, updatedAt: 0,
  }) as any);

/** Sin documento: es quien todavía entra por AUTH_USERS_JSON. */
const sinDocumento = () => obtenerUsuario.mockImplementation(async () => null as any);

/** Una petición con cookie de sesión real para el rol que diga la COOKIE. */
async function con(ruoloEnLaCookie: string, url: string, init: RequestInit = {}) {
  const token = await signSession({
    email: 'x@pantaleo.it', nome: 'X', ruolo: ruoloEnLaCookie,
  } as any);
  return new Request(`http://localhost${url}`, {
    ...init,
    headers: { cookie: `pantaleo_session=${token}`, ...(init.headers || {}) },
  });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // El guard cachea 30 s por email. Sin esto, un caso contaminaría al siguiente.
  invalidarEstado('x@pantaleo.it');
  obtenerUsuario.mockReset();
  sinDocumento();
});

afterEach(() => vi.restoreAllMocks());

describe('bloquear a alguien le corta TAMBIÉN la lectura', () => {
  it('un usuario bloqueado recibe 403 al listar inmuebles', async () => {
    enLaBase('vendedor', 'bloccato');
    const res = await leerInmuebles(await con('vendedor', '/api/immobili'));
    expect(res.status).toBe(403);
  });

  it('y al listar clientes', async () => {
    enLaBase('vendedor', 'bloccato');
    const res = await leerClientes(await con('vendedor', '/api/clienti'));
    expect(res.status).toBe(403);
  });

  it('y al descargar un documento por el proxy de ficheros', async () => {
    // Es el que más importa: ahí viven los folios de visita firmados, los
    // contratos y las planimetrías.
    enLaBase('vendedor', 'bloccato');
    const res = await leerFichero(await con('vendedor', '/api/files?path=documenti/x.pdf'));
    expect(res.status).toBe(403);
  });

  it('y al escribir, que es lo único que ya funcionaba', async () => {
    enLaBase('vendedor', 'bloccato');
    const res = await editarInmueble(await con('vendedor', '/api/immobili', {
      method: 'PATCH',
      body: JSON.stringify({ id: 'abc', note: 'hola' }),
    }));
    expect(res.status).toBe(403);
  });

  it('activo, en cambio, pasa', async () => {
    enLaBase('vendedor', 'attivo');
    const res = await leerInmuebles(await con('vendedor', '/api/immobili'));
    expect(res.status).toBe(200);
  });
});

describe('degradar a alguien surte efecto sin esperar a que caduque la cookie', () => {
  it('cookie de propietario y base de vendedor: 403 en la gestión de usuarios', async () => {
    // ESTE ES EL FALLO. La cookie sigue diciendo «propietario» porque se firmó
    // antes de la degradación y vale ocho horas. Antes, eso bastaba.
    enLaBase('vendedor');
    const res = await leerUsuarios(await con('propietario', '/api/admin/users'));
    expect(res.status).toBe(403);
  });

  it('cookie de propietario y base de propietario: 200', async () => {
    enLaBase('propietario');
    const res = await leerUsuarios(await con('propietario', '/api/admin/users'));
    expect(res.status).toBe(200);
  });

  it('el degradado conserva lo que su rol NUEVO sí permite', async () => {
    // Degradar no es expulsar: sigue pudiendo hacer su trabajo.
    enLaBase('vendedor');
    const res = await leerInmuebles(await con('propietario', '/api/immobili'));
    expect(res.status).toBe(200);
  });

  it('ascender también surte efecto: cookie de vendedor y base de propietario', async () => {
    // La base manda en las dos direcciones. Si el dueño acaba de promover a
    // alguien, no tiene sentido obligarle a volver a entrar.
    enLaBase('propietario');
    const res = await leerUsuarios(await con('vendedor', '/api/admin/users'));
    expect(res.status).toBe(200);
  });
});

describe('quien no está en _users sigue entrando con el rol de la cookie', () => {
  it('sin documento, el rol de la cookie decide', async () => {
    // Es el camino heredado de AUTH_USERS_JSON, que sigue vivo a propósito.
    // Si esto se rompiera, la agencia entera se quedaría fuera del CRM.
    sinDocumento();
    expect((await leerUsuarios(await con('propietario', '/api/admin/users'))).status).toBe(200);
    invalidarEstado('x@pantaleo.it');
    expect((await leerUsuarios(await con('vendedor', '/api/admin/users'))).status).toBe(403);
  });
});

describe('si Firestore no responde, la agencia sigue trabajando', () => {
  it('un error de lectura deja pasar con el rol de la cookie', async () => {
    // Falla ABIERTO a propósito: bloquear a todo el mundo por un problema de
    // infraestructura sería peor que la ventana que se acepta a cambio.
    obtenerUsuario.mockImplementation(async () => { throw new Error('firestore caido'); });
    const res = await leerInmuebles(await con('vendedor', '/api/immobili'));
    expect(res.status).toBe(200);
  });

  it('y el fallo NO se cachea: al volver Firestore, el bloqueo surte efecto ya', async () => {
    obtenerUsuario.mockImplementation(async () => { throw new Error('firestore caido'); });
    expect((await leerInmuebles(await con('vendedor', '/api/immobili'))).status).toBe(200);

    // Sin invalidar nada: si el error se hubiera cacheado, este seguiría en 200
    // durante treinta segundos.
    enLaBase('vendedor', 'bloccato');
    expect((await leerInmuebles(await con('vendedor', '/api/immobili'))).status).toBe(403);
  });
});

describe('la caché no miente durante más de lo que dice', () => {
  it('invalidarEstado hace que el cambio se vea al instante', async () => {
    enLaBase('propietario');
    expect((await leerUsuarios(await con('propietario', '/api/admin/users'))).status).toBe(200);

    // Sin invalidar, la caché de 30 s todavía diría «propietario».
    enLaBase('vendedor');
    expect((await leerUsuarios(await con('propietario', '/api/admin/users'))).status).toBe(200);

    // Es lo que llama la ruta de administración al guardar el cambio.
    invalidarEstado('x@pantaleo.it');
    expect((await leerUsuarios(await con('propietario', '/api/admin/users'))).status).toBe(403);
  });
});

describe('sin sesión no se entra a ninguna parte', () => {
  it('401 en lectura y en escritura, y no 403', async () => {
    const sinCookie = (url: string, init: RequestInit = {}) => new Request(`http://localhost${url}`, init);
    expect((await leerInmuebles(sinCookie('/api/immobili'))).status).toBe(401);
    expect((await leerClientes(sinCookie('/api/clienti'))).status).toBe(401);
    expect((await leerFichero(sinCookie('/api/files?path=x'))).status).toBe(401);
  });
});
