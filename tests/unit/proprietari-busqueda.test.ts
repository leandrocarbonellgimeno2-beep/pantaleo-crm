import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Que `/api/proprietari?q=` filtre de verdad.
 *
 * El fallo: `q` y `limit` se recibian y se IGNORABAN. El buscador de personas
 * de la agenda pedia `?q=rossi&limit=5` y se llevaba los 726 propietarios
 * enteros, asi que el desplegable enseñaba los cinco primeros del padron
 * —siempre los mismos, escribieras lo que escribieras— y cada pulsacion
 * costaba ~1.596 lecturas de Firestore para tirar el resultado.
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

vi.mock('@/lib/services/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/services/soft-delete', () => ({ markForSoftDelete: vi.fn() }));

const PADRON = [
  { id: 'p1', nome: 'Francesco', cognome: 'Pantaleo', cell1: '3281112233', _status: 'attivo' },
  { id: 'p2', nome: 'Mario', cognome: 'Rossi', cell1: '3334445566', _status: 'attivo' },
  { id: 'p3', nome: 'Anna', cognome: 'Rossini', cell1: '3479998877', _status: 'attivo' },
  { id: 'p4', nome: 'Giuseppe', cognome: 'Bianchi', cell1: '3201234567', _status: 'attivo' },
  { id: 'p5', nome: 'Nicolò', cognome: 'Parrinello', cell1: '3385554433', _status: 'attivo' },
  { id: 'p6', nome: 'Rosaria', cognome: 'Borghi', _status: 'pendente_cancellazione' },
];

const { colecciones } = vi.hoisted(() => ({ colecciones: [] as string[] }));

vi.mock('@/lib/firebase-admin', () => {
  const hacerConsulta = (nombre: string) => {
    const c: any = {
      where: () => c,
      orderBy: () => c,
      select: () => c,
      startAfter: () => c,
      limit: () => c,
      doc: () => ({ get: async () => ({ exists: false }) }),
      get: async () => {
        colecciones.push(nombre);
        const filas = nombre === 'proprietari' ? PADRON : [];
        return {
          docs: filas.map((d) => ({ id: d.id, data: () => d })),
          empty: filas.length === 0,
          size: filas.length,
        };
      },
    };
    return c;
  };
  return {
    db: { collection: (nombre: string) => hacerConsulta(nombre) },
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'ts', increment: () => 1 } } },
  };
});

import { signSession } from '@/lib/auth';
import { GET as leerPropietarios } from '@/app/api/proprietari/route';

async function pedir(url: string) {
  const token = await signSession({ email: 'x@pantaleo.it', nome: 'X', ruolo: 'agente' } as any);
  const res = await leerPropietarios(
    new Request(`http://localhost${url}`, { headers: { cookie: `pantaleo_session=${token}` } }),
  );
  return { status: res.status, cuerpo: await res.json() };
}

beforeEach(() => {
  colecciones.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('la busqueda filtra de verdad', () => {
  it('«rossi» devuelve los dos Rossi y NINGUNO mas', async () => {
    const { cuerpo } = await pedir('/api/proprietari?q=rossi&limit=5');
    expect(cuerpo.map((p: any) => p.id).sort()).toEqual(['p2', 'p3']);
  });

  it('si esto devolviera el padron entero, el desplegable volveria a mentir', async () => {
    const { cuerpo } = await pedir('/api/proprietari?q=rossi&limit=5');
    expect(cuerpo.length).toBeLessThan(PADRON.length);
  });

  it('respeta el limite', async () => {
    // «o» aparece en casi todos; con limit=2 solo pueden volver dos.
    const { cuerpo } = await pedir('/api/proprietari?q=o&limit=2');
    expect(cuerpo).toHaveLength(2);
  });

  it('ignora acentos y mayusculas, como el resto de buscadores', async () => {
    const { cuerpo } = await pedir('/api/proprietari?q=NICOLO&limit=5');
    expect(cuerpo.map((p: any) => p.id)).toEqual(['p5']);
  });

  it('busca tambien por telefono', async () => {
    const { cuerpo } = await pedir('/api/proprietari?q=3479998877&limit=5');
    expect(cuerpo.map((p: any) => p.id)).toEqual(['p3']);
  });

  it('no devuelve borrados', async () => {
    const { cuerpo } = await pedir('/api/proprietari?q=borghi&limit=5');
    expect(cuerpo).toEqual([]);
  });

  it('sin coincidencias, lista vacia y no el padron', async () => {
    const { cuerpo } = await pedir('/api/proprietari?q=zzzzz&limit=5');
    expect(cuerpo).toEqual([]);
  });
});

describe('el typeahead no paga el recuento de inmuebles', () => {
  it('con q NO se lee la coleccion immobili: son 870 lecturas por tecla', async () => {
    await pedir('/api/proprietari?q=rossi&limit=5');
    expect(colecciones).toEqual(['proprietari']);
    expect(colecciones).not.toContain('immobili');
  });

  it('sin q, el listado completo si la lee, que es donde hace falta el contador', async () => {
    await pedir('/api/proprietari');
    expect(colecciones).toContain('immobili');
  });
});

describe('sigue detras del guard', () => {
  it('sin sesion, 401', async () => {
    const res = await leerPropietarios(new Request('http://localhost/api/proprietari?q=rossi'));
    expect(res.status).toBe(401);
    expect(colecciones).toHaveLength(0);
  });
});
