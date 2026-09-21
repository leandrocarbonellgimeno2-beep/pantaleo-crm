import { describe, it, expect } from 'vitest';
import { hoyEnLaAgencia } from '@/lib/wall-clock';

/**
 * El panel de inicio calculaba «hoy» con
 * `new Date().toISOString().split('T')[0]`, que da la fecha en UTC. Marsala va
 * una hora por delante en invierno y dos en verano, asi que entre medianoche y
 * las 01:00 —las 02:00 en verano— para UTC todavia era AYER: el panel enseñaba
 * las citas del dia anterior y daba por «de hoy» las que ya habian pasado.
 */

const enUtc = (iso: string) => new Date(iso);
const comoAntes = (d: Date) => d.toISOString().split('T')[0];

describe('la medianoche de Marsala, que es donde fallaba', () => {
  it('invierno: 00:30 del 15 de enero en Marsala ya es dia 15', () => {
    // 00:30 CET = 23:30 UTC del dia ANTERIOR.
    const momento = enUtc('2026-01-14T23:30:00Z');
    expect(hoyEnLaAgencia(momento)).toBe('2026-01-15');
    // Lo que hacia antes:
    expect(comoAntes(momento)).toBe('2026-01-14');
  });

  it('verano: 01:30 del 15 de julio en Marsala ya es dia 15', () => {
    // 01:30 CEST = 23:30 UTC del dia anterior.
    const momento = enUtc('2026-07-14T23:30:00Z');
    expect(hoyEnLaAgencia(momento)).toBe('2026-07-15');
    expect(comoAntes(momento)).toBe('2026-07-14');
  });

  it('y a las 02:00 de verano, que es el limite del hueco', () => {
    const momento = enUtc('2026-07-15T00:00:00Z'); // 02:00 CEST
    expect(hoyEnLaAgencia(momento)).toBe('2026-07-15');
  });
});

describe('el resto del dia no cambia', () => {
  it('media mañana', () => {
    expect(hoyEnLaAgencia(enUtc('2026-09-21T09:00:00Z'))).toBe('2026-09-21');
  });

  it('y justo antes de medianoche sigue siendo el dia que toca', () => {
    // 23:30 CEST del 21 = 21:30 UTC del 21.
    expect(hoyEnLaAgencia(enUtc('2026-09-21T21:30:00Z'))).toBe('2026-09-21');
  });

  it('pasada la medianoche de Marsala ya es el dia siguiente', () => {
    // 00:30 CEST del 22 = 22:30 UTC del 21.
    expect(hoyEnLaAgencia(enUtc('2026-09-21T22:30:00Z'))).toBe('2026-09-22');
  });
});

describe('el formato es el que se compara', () => {
  it('siempre AAAA-MM-DD, con ceros delante', () => {
    expect(hoyEnLaAgencia(enUtc('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
    expect(hoyEnLaAgencia(enUtc('2026-12-31T12:00:00Z'))).toBe('2026-12-31');
    expect(hoyEnLaAgencia(enUtc('2026-03-09T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
