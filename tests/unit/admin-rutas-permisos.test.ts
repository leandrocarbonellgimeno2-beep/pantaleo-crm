import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * La frontera de permisos de las dos rutas de administración, probada de
 * extremo a extremo.
 *
 * NO se simula la autenticación: se firma un token de sesión DE VERDAD con
 * `signSession` y se manda en la cookie, igual que hace un navegador. Así el
 * test recorre el camino entero —HMAC, verificación de firma, caducidad,
 * normalización del rol, comparación por nivel y el guard— en vez de dar por
 * bueno un mock que podría estar mintiendo. Si alguien baja el nivel exigido en
 * una ruta, o rompe la tabla de niveles, o se deja el guard fuera del handler,
 * aquí se entera.
 *
 * Lo único que se sustituye es Firestore, que no tiene nada que ver con los
 * permisos y no está disponible en los tests.
 */

process.env.SESSION_SECRET = 'secreto-de-pruebas-suficientemente-largo-123456';

// vi.mock se iza por encima de todo, asi que sus dependencias tienen que
// crearse con vi.hoisted o no existen todavia cuando la fabrica corre.
const { listarUsuarios, obtenerUsuario } = vi.hoisted(() => ({
  listarUsuarios: vi.fn(async () => [] as any[]),
  obtenerUsuario: vi.fn(async () => null as any),
}));

vi.mock('@/lib/services/users', () => ({
  listarUsuarios,
  // Lo usa la comprobación de bloqueo dentro del guard. `null` = sin documento
  // en _users, o sea nada que revocar.
  obtenerUsuario,
  crearUsuario: vi.fn(),
  actualizarUsuario: vi.fn(),
  validarNuevoUsuario: vi.fn(),
  validarPassword: vi.fn(),
  contarPropietariosActivos: vi.fn(async () => 2),
  PASSWORD_MIN: 10,
}));

vi.mock('@/lib/services/audit', () => ({ audit: vi.fn() }));

const { consultaVacia } = vi.hoisted(() => {
  const c: any = {};
  Object.assign(c, {
    where: () => c,
    orderBy: () => c,
    startAfter: () => c,
    limit: () => c,
    get: async () => ({ docs: [] }),
    doc: () => ({ get: async () => ({ exists: false }) }),
  });
  return { consultaVacia: c };
});

vi.mock('@/lib/firebase-admin', () => ({
  db: { collection: () => consultaVacia },
  admin: {},
}));

import { signSession } from '@/lib/auth';
import { GET as usuariosGET } from '@/app/api/admin/users/route';
import { GET as movimientosGET } from '@/app/api/admin/audit/route';

/** Una petición con una cookie de sesión real para el rol indicado. */
async function comoRol(ruolo: string, ruta: string): Promise<Request> {
  const token = await signSession({
    // Email distinto por rol: el guard cachea el estado de bloqueo por email
    // durante 30 s y no conviene que un caso contamine al siguiente.
    email: `${ruolo}@pantaleo.it`,
    nome: `Prueba ${ruolo}`,
    ruolo,
  } as any);
  return new Request(`http://localhost${ruta}`, {
    headers: { cookie: `pantaleo_session=${token}` },
  });
}

const RUTA_USUARIOS = '/api/admin/users';
const RUTA_MOVIMIENTOS = '/api/admin/audit';

/** Todos los que NO deben pasar. La secretaria es la que acaba de perder el acceso. */
const DENEGADOS = ['secretaria', 'vendedor', 'agente'] as const;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  listarUsuarios.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe('/api/admin/users — solo propietario', () => {
  it('el propietario entra: 200', async () => {
    const res = await usuariosGET(await comoRol('propietario', RUTA_USUARIOS));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  it('la secretaria y los roles menores reciben 403', async () => {
    for (const ruolo of DENEGADOS) {
      const res = await usuariosGET(await comoRol(ruolo, RUTA_USUARIOS));
      expect(res.status, `rol ${ruolo}`).toBe(403);
    }
  });

  it('un rol denegado no llega siquiera a consultar la colección', async () => {
    // Importa: el 403 tiene que salir ANTES de tocar Firestore. Si no, un rol
    // sin permiso seguiría costando lecturas.
    listarUsuarios.mockClear();
    await usuariosGET(await comoRol('secretaria', RUTA_USUARIOS));
    expect(listarUsuarios).not.toHaveBeenCalled();
  });

  it('sin cookie de sesión, 401 y no 403', async () => {
    // La distinción no es cosmética: 401 es «no sé quién eres» y 403 es «sé
    // quién eres y no te alcanza». Confundirlas hace imposible diagnosticar.
    const res = await usuariosGET(new Request(`http://localhost${RUTA_USUARIOS}`));
    expect(res.status).toBe(401);
  });

  it('una cookie manipulada no sirve de nada', async () => {
    // El rol viaja dentro del token, así que lo que protege de que alguien se
    // ascienda editando la cookie es la firma, no el guard.
    const token = await signSession({ email: 'x@pantaleo.it', nome: 'X', ruolo: 'vendedor' } as any);
    const [base] = token.split('.');
    const falso = `${base}.firmaInventada`;
    const res = await usuariosGET(
      new Request(`http://localhost${RUTA_USUARIOS}`, {
        headers: { cookie: `pantaleo_session=${falso}` },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('/api/admin/audit — solo propietario', () => {
  it('el propietario entra: 200', async () => {
    const res = await movimientosGET(await comoRol('propietario', RUTA_MOVIMIENTOS));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  it('la secretaria y los roles menores reciben 403', async () => {
    for (const ruolo of DENEGADOS) {
      const res = await movimientosGET(await comoRol(ruolo, RUTA_MOVIMIENTOS));
      expect(res.status, `rol ${ruolo}`).toBe(403);
    }
  });

  it('sin cookie de sesión, 401', async () => {
    const res = await movimientosGET(new Request(`http://localhost${RUTA_MOVIMIENTOS}`));
    expect(res.status).toBe(401);
  });
});

describe('los alias heredados siguen resolviéndose', () => {
  it('una cookie antigua firmada con «master» equivale a propietario', async () => {
    // normalizeRole traduce master -> propietario. Una sesión emitida antes del
    // cambio de nomenclatura no debe quedarse fuera de su propio panel.
    const res = await usuariosGET(await comoRol('master', RUTA_USUARIOS));
    expect(res.status).toBe(200);
  });

  it('«admin» es secretaria, y por tanto ya NO entra', async () => {
    const res = await usuariosGET(await comoRol('admin', RUTA_USUARIOS));
    expect(res.status).toBe(403);
  });
});
