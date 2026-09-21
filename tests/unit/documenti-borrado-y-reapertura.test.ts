import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A1 — un folio firmado NO se destruye.
 * A2 — reabrir ACTUALIZA, no duplica.
 *
 * Los dos fallos eran de la misma pantalla y del mismo fichero.
 *
 * A1: la papelera hacia `.doc(id).delete()` y el cliente borraba ademas el PDF
 * del bucket justo despues. Dos clics y un verbale con la firma manuscrita del
 * cliente y el importe de la provvigione desaparecia de Firestore y de Storage
 * a la vez. Sin papelera, sin purga diferida y sin constancia de quien lo hizo
 * —y la propia ruta estaba escrita COMO SI el soft-delete existiera, porque
 * los dos GET filtran `pendente_cancellazione` y nadie escribia ese centinela.
 *
 * A2: guardar siempre hacia POST, asi que reabrir un folio para firmarlo
 * dejaba dos documentos. Medido en produccion: 320 documentos para 171
 * visitas, 149 copias sobrantes.
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

const { audit } = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock('@/lib/services/audit', () => ({ audit }));

const FIRMA = 'data:image/png;base64,' + 'A'.repeat(4000);

const { baseDatos, registro } = vi.hoisted(() => ({
  baseDatos: new Map<string, any>(),
  registro: { borradosDuros: [] as string[], updates: [] as any[], creados: [] as any[] },
}));

vi.mock('@/lib/firebase-admin', () => {
  const hacerDoc = (id: string) => ({
    id,
    get: async () => ({
      exists: baseDatos.has(id),
      id,
      data: () => baseDatos.get(id),
    }),
    // Si algo llama a esto, es que se esta borrando en duro.
    delete: async () => { registro.borradosDuros.push(id); baseDatos.delete(id); },
    update: async (campos: any) => {
      registro.updates.push({ id, campos });
      baseDatos.set(id, { ...baseDatos.get(id), ...campos });
    },
    set: async (campos: any) => { registro.creados.push({ id, campos }); baseDatos.set(id, campos); },
  });

  const consulta: any = {
    orderBy: () => consulta,
    select: () => consulta,
    startAfter: () => consulta,
    limit: () => consulta,
    where: () => consulta,
    get: async () => ({ docs: [], empty: true, size: 0 }),
    doc: (id?: string) => hacerDoc(id || 'nuevo-' + (registro.creados.length + 1)),
  };

  return {
    db: { collection: () => consulta },
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
  };
});

import { signSession } from '@/lib/auth';
import {
  DELETE as borrarDocumento,
  PATCH as actualizarDocumento,
  POST as crearDocumento,
  tieneFirma,
} from '@/app/api/documenti-generati/route';

async function cookie(ruolo = 'secretaria') {
  const token = await signSession({ email: 'x@pantaleo.it', nome: 'X', ruolo } as any);
  return `pantaleo_session=${token}`;
}

async function pedir(metodo: string, url: string, cuerpo?: any, ruolo = 'secretaria') {
  const init: RequestInit = { method: metodo, headers: { cookie: await cookie(ruolo) } };
  if (cuerpo !== undefined) {
    init.body = JSON.stringify(cuerpo);
    (init.headers as any)['Content-Type'] = 'application/json';
  }
  const req = new Request(`http://localhost${url}`, init);
  const res = metodo === 'DELETE' ? await borrarDocumento(req)
    : metodo === 'PATCH' ? await actualizarDocumento(req)
    : await crearDocumento(req);
  return { status: res.status, cuerpo: await res.json() };
}

beforeEach(() => {
  baseDatos.clear();
  registro.borradosDuros = [];
  registro.updates = [];
  registro.creados = [];
  audit.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  baseDatos.set('firmado-1', {
    nomeFile: 'Foglio Visita - MARIO ROSSI',
    categoria: 'Foglio di Visita',
    urlDownload: '/api/files?path=documenti_generati%2FFoglio_1.pdf',
    dataCreazione: '2026-05-10T09:00:00.000Z',
    formData: { nome: 'MARIO ROSSI', firmaCliente: FIRMA, firmaAgente: '' },
  });
  baseDatos.set('borrador-1', {
    nomeFile: 'Foglio Visita - ANNA BIANCHI',
    categoria: 'Foglio di Visita',
    urlDownload: '/api/files?path=documenti_generati%2FFoglio_2.pdf',
    dataCreazione: '2026-05-11T09:00:00.000Z',
    formData: { nome: 'ANNA BIANCHI', firmaCliente: '', firmaAgente: '' },
  });
});

describe('tieneFirma reconoce un trazo de verdad', () => {
  it('una firma larga cuenta; una cadena corta o vacia, no', () => {
    expect(tieneFirma({ formData: { firmaCliente: FIRMA } })).toBe(true);
    expect(tieneFirma({ formData: { firmaCliente: '' } })).toBe(false);
    expect(tieneFirma({ formData: { firmaCliente: 'data:,' } })).toBe(false);
    expect(tieneFirma({ formData: {} })).toBe(false);
    expect(tieneFirma({})).toBe(false);
    expect(tieneFirma(null)).toBe(false);
  });

  it('cualquier campo cuyo nombre lleve «firma» vale, no solo firmaCliente', () => {
    // El recuadro del agente existe y hoy nadie lo usa; el dia que se use,
    // ese documento tambien tiene que contar como firmado.
    expect(tieneFirma({ formData: { firmaAgente: FIRMA } })).toBe(true);
    expect(tieneFirma({ formData: { FirmaDigitale: FIRMA } })).toBe(true);
  });
});

describe('A1 · borrar un folio firmado NO lo destruye', () => {
  it('no se llama a delete() en ningun caso: se marca', async () => {
    const r = await pedir('DELETE', '/api/documenti-generati?id=firmado-1');
    expect(r.status).toBe(200);
    expect(registro.borradosDuros).toEqual([]);
    expect(baseDatos.get('firmado-1')._status).toBe('pendente_cancellazione');
  });

  it('el documento sigue existiendo, con su URL al PDF intacta', async () => {
    await pedir('DELETE', '/api/documenti-generati?id=firmado-1');
    const d = baseDatos.get('firmado-1');
    expect(d).toBeTruthy();
    expect(d.urlDownload).toBe('/api/files?path=documenti_generati%2FFoglio_1.pdf');
    expect(d.formData.firmaCliente).toBe(FIRMA);
  });

  it('la respuesta dice que estaba firmado, para que la pantalla no mienta', async () => {
    const r = await pedir('DELETE', '/api/documenti-generati?id=firmado-1');
    expect(r.cuerpo.firmato).toBe(true);
    const r2 = await pedir('DELETE', '/api/documenti-generati?id=borrador-1');
    expect(r2.cuerpo.firmato).toBe(false);
  });

  it('queda constancia de quien lo hizo', async () => {
    await pedir('DELETE', '/api/documenti-generati?id=firmado-1');
    expect(audit).toHaveBeenCalled();
    const llamada = audit.mock.calls[0][0] as any;
    expect(llamada.actorEmail).toBe('x@pantaleo.it');
    expect(llamada.action).toBe('documenti_generati.delete');
  });

  it('un borrador sin firma tampoco se destruye: se archiva igual', async () => {
    // La garantia no depende de acertar si hay firma o no.
    await pedir('DELETE', '/api/documenti-generati?id=borrador-1');
    expect(registro.borradosDuros).toEqual([]);
    expect(baseDatos.get('borrador-1')._status).toBe('pendente_cancellazione');
  });

  it('es idempotente: volver a borrarlo no cambia nada', async () => {
    await pedir('DELETE', '/api/documenti-generati?id=firmado-1');
    const updatesTrasUno = registro.updates.length;
    const r = await pedir('DELETE', '/api/documenti-generati?id=firmado-1');
    expect(r.cuerpo.yaEliminado).toBe(true);
    expect(registro.updates.length).toBe(updatesTrasUno);
  });

  it('un id inexistente da 404 y un id con barras da 400', async () => {
    expect((await pedir('DELETE', '/api/documenti-generati?id=no-existe')).status).toBe(404);
    expect((await pedir('DELETE', '/api/documenti-generati?id=a%2Fb%2Fc')).status).toBe(400);
  });
});

describe('A2 · reabrir ACTUALIZA, no duplica', () => {
  it('el PATCH escribe sobre el mismo documento y no crea otro', async () => {
    const r = await pedir('PATCH', '/api/documenti-generati', {
      id: 'firmado-1',
      nomeFile: 'Foglio Visita - MARIO ROSSI',
      formData: { nome: 'MARIO ROSSI', firmaCliente: FIRMA },
      urlDownload: '/api/files?path=documenti_generati%2FFoglio_1.pdf',
    });
    expect(r.status).toBe(200);
    expect(registro.creados).toEqual([]);
    expect(registro.updates.some((u) => u.id === 'firmado-1')).toBe(true);
  });

  it('NO mueve la fecha de creacion: es la fecha de la visita', async () => {
    // Es ademas la clave por la que se ordena y pagina el archivo: moverla
    // mandaria un folio de mayo al principio de la lista.
    await pedir('PATCH', '/api/documenti-generati', {
      id: 'firmado-1',
      dataCreazione: '2026-09-21T10:00:00.000Z',
      nomeFile: 'x',
    });
    expect(baseDatos.get('firmado-1').dataCreazione).toBe('2026-05-10T09:00:00.000Z');
  });

  it('un documento archivado no se resucita por la puerta de atras', async () => {
    await pedir('DELETE', '/api/documenti-generati?id=firmado-1');
    const r = await pedir('PATCH', '/api/documenti-generati', { id: 'firmado-1', nomeFile: 'x' });
    expect(r.status).toBe(409);
  });

  it('sin id, o con un id con barras, no escribe', async () => {
    expect((await pedir('PATCH', '/api/documenti-generati', { nomeFile: 'x' })).status).toBe(400);
    expect((await pedir('PATCH', '/api/documenti-generati', { id: 'a/b', nomeFile: 'x' })).status).toBe(400);
    expect(registro.updates).toEqual([]);
  });

  it('sigue detras del guard: sin sesion no se actualiza ni se borra', async () => {
    const sinCookie = (m: string, u: string, b?: any) => new Request(`http://localhost${u}`, {
      method: m, ...(b ? { body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' } } : {}),
    });
    expect((await actualizarDocumento(sinCookie('PATCH', '/api/documenti-generati', { id: 'firmado-1' }))).status).toBe(401);
    expect((await borrarDocumento(sinCookie('DELETE', '/api/documenti-generati?id=firmado-1'))).status).toBe(401);
    expect(registro.updates).toEqual([]);
    expect(registro.borradosDuros).toEqual([]);
  });
});
