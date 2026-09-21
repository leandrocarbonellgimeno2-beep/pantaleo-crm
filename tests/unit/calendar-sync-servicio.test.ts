import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El motor de sincronizacion: lo que ESCRIBE al bajar cambios de Google.
 *
 * Es la pieza con mas riesgo de todo el bucle, porque escribe en la coleccion
 * de citas a partir de datos externos. Lo que se fija aqui:
 *
 *  - el eco de lo que subimos no crea nada          (si no, rebote infinito)
 *  - un evento ajeno nuevo crea una cita huerfana   (el hueco hay que bloquearlo)
 *  - un cancelado en Google NO borra la cita        (se marca; borrarla seria
 *                                                    destruir un dato)
 *  - el syncToken solo se guarda si la vuelta fue bien
 */

const { estado } = vi.hoisted(() => ({
  estado: {
    eventos: [] as any[],
    proximoSyncToken: 'tok-2' as string | null,
    devolverNull: false,
    citas: [] as any[],
    escrituras: [] as any[],
    tokenGuardado: undefined as any,
    commits: 0,
    turnoLibre: true,
    turnoSoltado: false,
    falloAnotado: undefined as any,
  },
}));

vi.mock('@/lib/google-calendar', async () => {
  const real: any = await vi.importActual('@/lib/google-calendar');
  return {
    ...real,
    traerCambiosDeGoogle: vi.fn(async () =>
      estado.devolverNull
        ? null
        : { eventos: estado.eventos, proximoSyncToken: estado.proximoSyncToken, fueCompleta: false },
    ),
    guardarSyncOk: vi.fn(async (t: string | null) => { estado.tokenGuardado = t; }),
    tomarTurnoDeSync: vi.fn(async () => estado.turnoLibre),
    soltarTurnoDeSync: vi.fn(async () => { estado.turnoSoltado = true; }),
    anotarIntentoDeSync: vi.fn(async () => {}),
    anotarFalloDeSync: vi.fn(async (m: string) => { estado.falloAnotado = m; }),
  };
});

vi.mock('@/lib/firebase-admin', () => {
  const hacerRef = (id: string) => ({ id });
  const batch = () => ({
    update: (ref: any, campos: any) => estado.escrituras.push({ tipo: 'update', id: ref.id, campos }),
    set: (ref: any, campos: any) => estado.escrituras.push({ tipo: 'set', id: ref.id, campos }),
    commit: async () => { estado.commits++; },
  });
  const consulta: any = {
    where: (_c: string, _op: string, valor: any) => {
      // `where('googleEventId','in',[...])`: solo devuelve las citas cuyo id
      // de evento esta en el lote, como haria Firestore.
      const filtrada: any = { ...consulta, get: async () => ({
        docs: estado.citas
          .filter((c) => !Array.isArray(valor) || valor.includes(c.googleEventId))
          .map((c) => ({ id: c.id, ref: hacerRef(c.id), data: () => c })),
      }) };
      filtrada.select = () => filtrada;
      filtrada.where = consulta.where;
      return filtrada;
    },
    select: () => consulta,
    get: async () => ({
      docs: estado.citas.map((c) => ({ id: c.id, ref: hacerRef(c.id), data: () => c })),
    }),
    doc: (id?: string) => hacerRef(id || 'nueva-' + (estado.escrituras.length + 1)),
  };
  return {
    db: {
      collection: () => consulta,
      batch,
      // `getAll` busca las citas importadas por su id derivado del evento.
      getAll: async (...refs: any[]) => refs.map((r) => {
        const cita = estado.citas.find((c) => c.id === r.id);
        return { exists: Boolean(cita), ref: r, data: () => cita };
      }),
    },
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
  };
});

import { sincronizarDesdeGoogle } from '@/lib/services/calendar-sync';
import { ORIGEN_CRM } from '@/lib/google-calendar';

const AHORA = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

const evento = (extra: any = {}) => ({
  id: 'ev-nuevo',
  summary: 'Visita Via Roma',
  location: 'Via Roma 12',
  updated: iso(AHORA),
  start: { dateTime: '2026-09-21T10:00:00+02:00' },
  end: { dateTime: '2026-09-21T11:00:00+02:00' },
  ...extra,
});

beforeEach(() => {
  estado.eventos = [];
  estado.proximoSyncToken = 'tok-2';
  estado.devolverNull = false;
  estado.citas = [];
  estado.escrituras = [];
  estado.tokenGuardado = undefined;
  estado.commits = 0;
  estado.turnoLibre = true;
  estado.turnoSoltado = false;
  estado.falloAnotado = undefined;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('el eco no crea nada: no hay rebote', () => {
  it('un evento nuestro, recien subido, se ignora', async () => {
    estado.citas = [{ id: 'cita-1', googleEventId: 'ev-crm', googleSyncedAt: AHORA }];
    estado.eventos = [evento({
      id: 'ev-crm',
      updated: iso(AHORA + 500),
      extendedProperties: { private: { origin: ORIGEN_CRM, crmAppointmentId: 'cita-1' } },
    })];

    const r = await sincronizarDesdeGoogle();

    expect(r.ok).toBe(true);
    expect(r.ecosIgnorados).toBe(1);
    expect(r.creados).toBe(0);
    expect(r.actualizados).toBe(0);
    expect(estado.escrituras).toEqual([]);
  });

  it('pero si lo editaron en Google despues, la HORA de la cita se actualiza', async () => {
    estado.citas = [{ id: 'cita-1', googleEventId: 'ev-crm', googleSyncedAt: AHORA }];
    estado.eventos = [evento({
      id: 'ev-crm',
      summary: 'Appuntamento CRM: Mario Rossi',
      start: { dateTime: '2026-09-21T12:00:00+02:00' },
      end: { dateTime: '2026-09-21T13:00:00+02:00' },
      updated: iso(AHORA + 7200_000),
      extendedProperties: { private: { origin: ORIGEN_CRM, crmAppointmentId: 'cita-1' } },
    })];

    const r = await sincronizarDesdeGoogle();

    expect(r.actualizados).toBe(1);
    expect(r.creados).toBe(0);
    const w = estado.escrituras[0];
    expect(w.tipo).toBe('update');
    expect(w.id).toBe('cita-1');
    expect(w.campos.time).toBe('12:00');
  });

  it('y el NOMBRE DEL CLIENTE no se toca: es del CRM, no de Google', async () => {
    // Aplicar el titulo del evento sobre `clientName` convertia al cliente en
    // «Appuntamento CRM: Mario Rossi», y a la vuelta siguiente en
    // «Appuntamento CRM: Appuntamento CRM: Mario Rossi». El prefijo se
    // acumulaba en un campo de negocio en cada ida y vuelta.
    estado.citas = [{ id: 'cita-1', googleEventId: 'ev-crm', googleSyncedAt: AHORA }];
    estado.eventos = [evento({
      id: 'ev-crm',
      summary: 'Appuntamento CRM: Mario Rossi',
      updated: iso(AHORA + 7200_000),
      extendedProperties: { private: { origin: ORIGEN_CRM, crmAppointmentId: 'cita-1' } },
    })];

    await sincronizarDesdeGoogle();

    const campos = estado.escrituras[0].campos;
    expect(campos.clientName).toBeUndefined();
    expect(campos.propertyAddress).toBeUndefined();
  });

  it('en cambio una cita NACIDA en Google si recibe su titulo', async () => {
    estado.citas = [{ id: 'gcal_ev-movil', googleEventId: 'ev-movil', googleSyncedAt: AHORA, source: 'google_calendar' }];
    estado.eventos = [evento({ id: 'ev-movil', summary: 'Dentista (spostato)', updated: iso(AHORA + 7200_000) })];

    await sincronizarDesdeGoogle();

    expect(estado.escrituras[0].campos.clientName).toBe('Dentista (spostato)');
  });
});

describe('no se duplica ni se corrompe el nombre', () => {
  it('el id del documento sale del id del evento: dos vueltas no duplican', async () => {
    // Con un id automatico, dos vueltas simultaneas creaban DOS citas para el
    // mismo evento, y solo una volvia a recibir actualizaciones jamas.
    estado.eventos = [evento({ id: 'ev-movil', summary: 'Dentista' })];
    await sincronizarDesdeGoogle();
    expect(estado.escrituras[0].id).toBe('gcal_ev-movil');
  });

  it('un huerfano con el titulo del CRM entra SIN el prefijo', async () => {
    estado.eventos = [evento({ id: 'ev-suelto', summary: 'Appuntamento CRM: Anna' })];
    await sincronizarDesdeGoogle();
    expect(estado.escrituras[0].campos.clientName).toBe('Anna');
  });

  it('lo marcado como privado en Google NO se copia a Firestore', async () => {
    // El calendario de la agencia es el personal de quien lo conecto: ahi hay
    // visitas medicas y asuntos de familia, y en Firestore los leeria
    // cualquier agente.
    estado.eventos = [evento({ id: 'ev-privado', summary: 'Visita medica', visibility: 'private' })];
    const r = await sincronizarDesdeGoogle();
    expect(r.creados).toBe(0);
    expect(r.saltados).toBe(1);
    expect(estado.escrituras).toEqual([]);
  });
});

describe('un turno a la vez', () => {
  it('si ya hay una vuelta en curso, la segunda no escribe nada', async () => {
    estado.turnoLibre = false;
    estado.eventos = [evento()];
    const r = await sincronizarDesdeGoogle();
    expect(r.ok).toBe(false);
    expect(estado.escrituras).toEqual([]);
    expect(estado.tokenGuardado).toBeUndefined();
  });

  it('el turno se suelta siempre, tambien cuando la vuelta falla', async () => {
    estado.devolverNull = true;
    await sincronizarDesdeGoogle();
    expect(estado.turnoSoltado).toBe(true);
  });
});

describe('los huerfanos de Google entran en la agenda', () => {
  it('un evento ajeno nuevo crea una cita marcada como de Google', async () => {
    estado.eventos = [evento({ id: 'ev-movil', summary: 'Dentista' })];

    const r = await sincronizarDesdeGoogle();

    expect(r.creados).toBe(1);
    const w = estado.escrituras[0];
    expect(w.tipo).toBe('set');
    expect(w.campos.source).toBe('google_calendar');
    expect(w.campos.clientName).toBe('Dentista');
    expect(w.campos.googleEventId).toBe('ev-movil');
  });

  it('y NO se le inventa cliente ni inmueble', async () => {
    estado.eventos = [evento({ id: 'ev-movil', summary: 'Dentista' })];
    await sincronizarDesdeGoogle();
    const campos = estado.escrituras[0].campos;
    // Un id inventado ataria la cita al cliente equivocado; la agenda solo
    // necesita titulo y hora para bloquear el hueco.
    expect(campos.clienteId).toBeUndefined();
    expect(campos.immobileId).toBeUndefined();
    expect(campos.clientPhone).toBe('');
  });

  it('un evento sin fecha utilizable se salta en vez de escribir basura', async () => {
    estado.eventos = [{ id: 'ev-roto', summary: 'X', updated: iso(AHORA), start: {}, end: {} }];
    const r = await sincronizarDesdeGoogle();
    expect(r.creados).toBe(0);
    expect(r.saltados).toBe(1);
    expect(estado.escrituras).toEqual([]);
  });

  it('un evento sin id no se toca', async () => {
    estado.eventos = [evento({ id: undefined })];
    const r = await sincronizarDesdeGoogle();
    expect(r.saltados).toBe(1);
    expect(estado.escrituras).toEqual([]);
  });
});

describe('un borrado en Google no destruye la cita', () => {
  it('se marca como anulada, no se borra', async () => {
    estado.citas = [{ id: 'cita-9', googleEventId: 'ev-x', googleSyncedAt: AHORA }];
    estado.eventos = [evento({ id: 'ev-x', status: 'cancelled' })];

    const r = await sincronizarDesdeGoogle();

    expect(r.anulados).toBe(1);
    const w = estado.escrituras[0];
    expect(w.tipo).toBe('update');
    expect(w.campos.status).toBe('Annullato');
    // Ni un delete en todo el recorrido.
    expect(estado.escrituras.some((e) => e.tipo === 'delete')).toBe(false);
  });

  it('un cancelado que no conociamos no crea nada', async () => {
    estado.eventos = [evento({ id: 'ev-desconocido', status: 'cancelled' })];
    const r = await sincronizarDesdeGoogle();
    expect(r.creados).toBe(0);
    expect(r.saltados).toBe(1);
    expect(estado.escrituras).toEqual([]);
  });
});

describe('el syncToken', () => {
  it('se guarda cuando la vuelta termina bien', async () => {
    estado.eventos = [evento()];
    await sincronizarDesdeGoogle();
    expect(estado.tokenGuardado).toBe('tok-2');
  });

  it('NO se guarda si no se pudo traer nada de Google', async () => {
    // Guardarlo tras un fallo daria por vistos cambios que nunca se
    // aplicaron, y esos eventos no volverian a aparecer jamas.
    estado.devolverNull = true;
    const r = await sincronizarDesdeGoogle();
    expect(r.ok).toBe(false);
    expect(estado.tokenGuardado).toBeUndefined();
    expect(estado.escrituras).toEqual([]);
  });
});

describe('sin cambios no se escribe', () => {
  it('cero eventos: ni un commit', async () => {
    const r = await sincronizarDesdeGoogle();
    expect(r.ok).toBe(true);
    expect(estado.commits).toBe(0);
    expect(estado.escrituras).toEqual([]);
  });
});
