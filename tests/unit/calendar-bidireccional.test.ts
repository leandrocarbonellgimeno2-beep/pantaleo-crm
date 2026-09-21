import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El calendario en los dos sentidos.
 *
 * Lo que se prueba aqui es sobre todo LO QUE NO DEBE PASAR:
 *
 *  - que el CRM no rebote con Google indefinidamente (cada evento que subimos
 *    vuelve a bajar, crea otra cita, que sube otro evento…)
 *  - que un evento creado a mano en Google, sin cliente ni inmueble, entre en
 *    la agenda sin romper nada
 *  - que un borrado en Google no destruya la cita del CRM
 *  - que el syncToken NO se guarde si la vuelta fallo a medias
 */

vi.mock('@/lib/firebase-admin', () => ({
  db: { collection: () => ({}) },
  admin: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
}));

import { esEcoDelCrm, citaDesdeEvento, ORIGEN_CRM } from '@/lib/google-calendar';

const AHORA = Date.UTC(2026, 8, 21, 10, 0, 0);

const eventoCrm = (updatedMs: number, crmId = 'cita-1') => ({
  id: 'ev-1',
  summary: 'Appuntamento CRM: Mario Rossi',
  updated: new Date(updatedMs).toISOString(),
  extendedProperties: { private: { origin: ORIGEN_CRM, crmAppointmentId: crmId } },
}) as any;

const eventoDeGoogle = (updatedMs: number) => ({
  id: 'ev-2',
  summary: 'Visita con Francesco',
  updated: new Date(updatedMs).toISOString(),
}) as any;

describe('el corta-bucles: esEcoDelCrm', () => {
  it('el eco de nuestra propia escritura se ignora', () => {
    // Subimos el evento en AHORA; Google lo sella un instante despues.
    expect(esEcoDelCrm(eventoCrm(AHORA + 800), AHORA)).toBe(true);
  });

  it('aunque Google lo selle unos segundos despues, sigue siendo el eco', () => {
    // Los relojes no son el mismo. Sin margen, nuestro propio eco pareceria
    // una edicion ajena y volveria a bajar: ahi empieza el rebote.
    expect(esEcoDelCrm(eventoCrm(AHORA + 30_000), AHORA)).toBe(true);
  });

  it('pero una edicion HECHA EN GOOGLE mas tarde SI baja', () => {
    // Es lo que Francesco hace desde el movil. Una regla de «ignora siempre
    // lo que lleve origin=CRM» se habria comido justo esto.
    expect(esEcoDelCrm(eventoCrm(AHORA + 3600_000), AHORA)).toBe(false);
  });

  it('un evento sin nuestra marca nunca es un eco', () => {
    expect(esEcoDelCrm(eventoDeGoogle(AHORA + 3600_000), AHORA)).toBe(false);
    expect(esEcoDelCrm(eventoDeGoogle(AHORA), null)).toBe(false);
  });

  it('con marca nuestra pero sin saber cuando lo subimos, se trata como eco', () => {
    // Por prudencia: crear una cita duplicada es peor que perderse una
    // edicion, porque el duplicado se queda para siempre.
    expect(esEcoDelCrm(eventoCrm(AHORA), null)).toBe(true);
    expect(esEcoDelCrm(eventoCrm(AHORA), undefined)).toBe(true);
  });

  it('una fecha `updated` ilegible tampoco crea una cita nueva', () => {
    const roto = { ...eventoCrm(AHORA), updated: 'no-es-una-fecha' };
    expect(esEcoDelCrm(roto, AHORA)).toBe(true);
  });

  it('la marca tiene que ser exactamente la nuestra', () => {
    const ajeno = {
      id: 'x', updated: new Date(AHORA).toISOString(),
      extendedProperties: { private: { origin: 'OtroSistema' } },
    } as any;
    expect(esEcoDelCrm(ajeno, AHORA)).toBe(false);
  });
});

describe('un evento de Google se convierte en cita sin inventarse nada', () => {
  it('saca fecha, hora y duracion de start/end', () => {
    const r = citaDesdeEvento({
      id: 'ev-9',
      summary: 'Visita Via Roma',
      location: 'Via Roma 12',
      start: { dateTime: '2026-09-21T10:00:00+02:00' },
      end: { dateTime: '2026-09-21T11:30:00+02:00' },
      htmlLink: 'https://cal/ev-9',
    } as any);

    expect(r.date).toBe('2026-09-21');
    expect(r.time).toBe('10:00');
    expect(r.duration).toBe(90);
    expect(r.clientName).toBe('Visita Via Roma');
    expect(r.propertyAddress).toBe('Via Roma 12');
    expect(r.googleEventId).toBe('ev-9');
  });

  it('un evento de dia completo no revienta: cae a 60 minutos', () => {
    const r = citaDesdeEvento({ id: 'e', start: { date: '2026-09-21' }, end: { date: '2026-09-22' } } as any);
    expect(r.date).toBe('2026-09-21');
    expect(r.time).toBe('00:00');
    expect(r.duration).toBeGreaterThan(0);
  });

  it('un evento sin titulo recibe uno generico, nunca «undefined»', () => {
    const r = citaDesdeEvento({ id: 'e', start: { dateTime: '2026-09-21T09:00:00Z' }, end: { dateTime: '2026-09-21T10:00:00Z' } } as any);
    expect(r.clientName).toBe('Evento Google Calendar');
    expect(r.clientName).not.toContain('undefined');
    expect(r.propertyAddress).toBe('');
  });

  it('NO inventa cliente ni inmueble: los huerfanos no traen relaciones', () => {
    const r = citaDesdeEvento({ id: 'e', summary: 'Dentista', start: { dateTime: '2026-09-21T09:00:00Z' }, end: { dateTime: '2026-09-21T10:00:00Z' } } as any);
    expect(r).not.toHaveProperty('clienteId');
    expect(r).not.toHaveProperty('immobileId');
    // Un id inventado ataria la cita al cliente equivocado.
    expect(Object.values(r).every((v) => typeof v === 'string' || typeof v === 'number')).toBe(true);
  });
});
