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
    where: () => consulta,
    select: () => consulta,
    get: async () => ({
      docs: estado.citas.map((c) => ({ id: c.id, ref: hacerRef(c.id), data: () => c })),
    }),
    doc: (id?: string) => hacerRef(id || 'nueva-' + (estado.escrituras.length + 1)),
  };
  return {
    db: { collection: () => consulta, batch },
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

  it('pero si lo editaron en Google despues, la cita del CRM se actualiza', async () => {
    estado.citas = [{ id: 'cita-1', googleEventId: 'ev-crm', googleSyncedAt: AHORA }];
    estado.eventos = [evento({
      id: 'ev-crm',
      summary: 'Visita movida a las 12',
      updated: iso(AHORA + 7200_000),
      extendedProperties: { private: { origin: ORIGEN_CRM, crmAppointmentId: 'cita-1' } },
    })];

    const r = await sincronizarDesdeGoogle();

    expect(r.actualizados).toBe(1);
    expect(r.creados).toBe(0);
    const w = estado.escrituras[0];
    expect(w.tipo).toBe('update');
    expect(w.id).toBe('cita-1');
    expect(w.campos.clientName).toBe('Visita movida a las 12');
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
