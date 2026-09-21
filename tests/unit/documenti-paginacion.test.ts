import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Que los 320 folios firmados se puedan alcanzar, no solo los 200 primeros.
 *
 * El fallo: `limit(200)` fijo. No era un tope prudente, era un muro. Los 120
 * documentos mas antiguos —59 de ellos CON la firma del cliente— no se podian
 * listar, ni buscar, ni descargar, ni reabrir desde la aplicacion, porque el
 * buscador filtra en memoria sobre lo ya traido. Para reclamar una provvigione
 * con un folio de mayo habia que entrar en la consola de Firebase.
 */

process.env.SESSION_SECRET = 'secreto-de-pruebas-suficientemente-largo-123456';

const { obtenerUsuario } = vi.hoisted(() => ({
  obtenerUsuario: vi.fn(async () => null as any),
}));

vi.mock('@/lib/services/users', () => ({
  obtenerUsuario,
  listarUsuarios: vi.fn(async () => []),
  crearUsuario: vi.fn(),
  actualizarUsuario: vi.fn(),
  validarNuevoUsuario: vi.fn(),
  validarPassword: vi.fn(),
  contarPropietariosActivos: vi.fn(async () => 2),
  PASSWORD_MIN: 10,
}));

/** Los 320 documentos, del mas nuevo al mas viejo, como los devuelve Firestore. */
const TODOS = Array.from({ length: 320 }, (_, i) => ({
  id: `doc-${i}`,
  dataCreazione: new Date(Date.UTC(2026, 8, 11) - i * 3_600_000).toISOString(),
  nomeFile: `Foglio Visita ${i}`,
  _status: 'attivo',
}));

const { estado } = vi.hoisted(() => ({
  estado: { desde: null as string | null, limite: 0, llamadas: [] as any[] },
}));

vi.mock('@/lib/firebase-admin', () => {
  const consulta: any = {
    orderBy: () => consulta,
    select: () => consulta,
    startAfter: (c: string) => { estado.desde = c; return consulta; },
    limit: (n: number) => { estado.limite = n; return consulta; },
    doc: () => ({ get: async () => ({ exists: false }) }),
    get: async () => {
      // Firestore aplica startAfter sobre el campo del orderBy.
      const inicio = estado.desde
        ? TODOS.findIndex((d) => d.dataCreazione === estado.desde) + 1
        : 0;
      const trozo = TODOS.slice(inicio, inicio + estado.limite);
      estado.llamadas.push({ desde: estado.desde, limite: estado.limite, devueltos: trozo.length });
      return {
        docs: trozo.map((d) => ({ id: d.id, data: () => d })),
        empty: trozo.length === 0,
        size: trozo.length,
      };
    },
  };
  return {
    db: { collection: () => consulta },
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
  };
});

import { signSession } from '@/lib/auth';
import { GET as leerDocumentos } from '@/app/api/documenti-generati/route';

async function pedir(url: string) {
  const token = await signSession({ email: 'x@pantaleo.it', nome: 'X', ruolo: 'propietario' } as any);
  const res = await leerDocumentos(
    new Request(`http://localhost${url}`, { headers: { cookie: `pantaleo_session=${token}` } }),
  );
  return { status: res.status, cuerpo: await res.json() };
}

beforeEach(() => {
  estado.desde = null;
  estado.limite = 0;
  estado.llamadas = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('se llega hasta el ultimo de los 320', () => {
  it('paginando se alcanzan TODOS, sin repetir ni saltarse ninguno', async () => {
    const vistos: string[] = [];
    let cursor: string | null = null;
    let vueltas = 0;

    do {
      const url: string = cursor
        ? `/api/documenti-generati?cursor=${encodeURIComponent(cursor)}`
        : '/api/documenti-generati';
      const { cuerpo } = await pedir(url);
      vistos.push(...cuerpo.data.map((d: any) => d.id));
      cursor = cuerpo.cursor;
      vueltas++;
      if (vueltas > 20) throw new Error('el cursor no avanza: bucle infinito');
    } while (cursor);

    expect(vistos).toHaveLength(320);
    expect(new Set(vistos).size).toBe(320);
    // El que estaba fuera de alcance con el tope de 200.
    expect(vistos).toContain('doc-319');
    expect(vistos[0]).toBe('doc-0');
    expect(vistos[319]).toBe('doc-319');
  });

  it('la primera pagina NO se queda con todo: si volviera a traer 320 de golpe, esto cae', async () => {
    const { cuerpo } = await pedir('/api/documenti-generati');
    expect(cuerpo.data.length).toBeLessThan(320);
    expect(cuerpo.hayMas).toBe(true);
    expect(cuerpo.cursor).toBeTruthy();
  });

  it('pide uno de mas para saber si hay otra pagina, sin una segunda consulta', async () => {
    await pedir('/api/documenti-generati');
    expect(estado.llamadas).toHaveLength(1);
    expect(estado.limite).toBe(estado.llamadas[0].devueltos);
  });
});

describe('el final se reconoce', () => {
  it('la ultima pagina no ofrece cursor', async () => {
    let cursor: string | null = null;
    let ultimo: any = null;
    do {
      const url: string = cursor
        ? `/api/documenti-generati?cursor=${encodeURIComponent(cursor)}`
        : '/api/documenti-generati';
      ultimo = (await pedir(url)).cuerpo;
      cursor = ultimo.cursor;
    } while (cursor);

    expect(ultimo.hayMas).toBe(false);
    expect(ultimo.cursor).toBeNull();
  });
});

describe('sigue detras del guard', () => {
  it('sin sesion, 401 y ni una lectura', async () => {
    const res = await leerDocumentos(new Request('http://localhost/api/documenti-generati'));
    expect(res.status).toBe(401);
    expect(estado.llamadas).toHaveLength(0);
  });
});
