import { describe, it, expect } from 'vitest';
import { aMilisegundos, primeraFechaMs } from '@/lib/fecha-ms';

/**
 * El fallo que fija este fichero: el listado de clientes ordenaba con
 * `new Date(c.createdAt).getTime()`, y eso no entiende un Timestamp de
 * Firestore. Devolvia NaN, que al caer a 0 hacia empatar a los 576 clientes y
 * dejaba el orden al azar: los dados de alta esta semana caian en la posicion
 * 272 y habia que pulsar «Carica altri» nueve veces para verlos.
 */

const UN_MOMENTO = Date.UTC(2026, 8, 10, 8, 0, 0); // 2026-09-10T08:00:00Z
const EN_SEGUNDOS = UN_MOMENTO / 1000;

describe('aMilisegundos — las cuatro formas del mismo dato', () => {
  it('Timestamp serializado por la API: { _seconds }', () => {
    expect(aMilisegundos({ _seconds: EN_SEGUNDOS, _nanoseconds: 0 })).toBe(UN_MOMENTO);
  });

  it('Timestamp vivo del Admin SDK: { seconds, toMillis() }', () => {
    expect(aMilisegundos({ seconds: EN_SEGUNDOS, nanoseconds: 0 })).toBe(UN_MOMENTO);
    expect(aMilisegundos({ toMillis: () => UN_MOMENTO })).toBe(UN_MOMENTO);
  });

  it('cadena ISO', () => {
    expect(aMilisegundos('2026-09-10T08:00:00.000Z')).toBe(UN_MOMENTO);
  });

  it('numero ya en milisegundos, y un Date', () => {
    expect(aMilisegundos(UN_MOMENTO)).toBe(UN_MOMENTO);
    expect(aMilisegundos(new Date(UN_MOMENTO))).toBe(UN_MOMENTO);
  });

  it('los nanosegundos suman su parte de milisegundo', () => {
    expect(aMilisegundos({ _seconds: 1, _nanoseconds: 500_000_000 })).toBe(1500);
  });
});

describe('ordenar de verdad, que es para lo que existe', () => {
  it('un Timestamp NO empata con otro: es el bug del listado de clientes', () => {
    const viejo = { createdAt: { _seconds: EN_SEGUNDOS - 86_400 * 120 } };
    const nuevo = { createdAt: { _seconds: EN_SEGUNDOS } };

    // Lo que hacia antes: NaN → 0 → empate.
    expect(new Date(viejo.createdAt as any).getTime()).toBeNaN();
    expect(new Date(nuevo.createdAt as any).getTime()).toBeNaN();

    // Lo que hace ahora.
    expect(aMilisegundos(nuevo.createdAt)).toBeGreaterThan(aMilisegundos(viejo.createdAt));
  });

  it('ordena bien aunque las cuatro formas convivan en la misma lista', () => {
    const lista = [
      { n: 'iso-viejo', createdAt: '2025-01-01T00:00:00.000Z' },
      { n: 'ts-nuevo', createdAt: { _seconds: EN_SEGUNDOS } },
      { n: 'sin-fecha', createdAt: undefined },
      { n: 'numero-medio', createdAt: Date.UTC(2026, 0, 1) },
    ];
    const orden = [...lista]
      .sort((a, b) => aMilisegundos(b.createdAt) - aMilisegundos(a.createdAt))
      .map((x) => x.n);

    expect(orden).toEqual(['ts-nuevo', 'numero-medio', 'iso-viejo', 'sin-fecha']);
  });
});

describe('lo que no se entiende no se inventa', () => {
  it('sin fecha, fecha vacia o basura devuelve el valor por defecto', () => {
    for (const malo of [null, undefined, '', 'ayer por la tarde', {}, [], NaN, { _seconds: 'x' }]) {
      expect(aMilisegundos(malo)).toBe(0);
    }
  });

  it('el centinela -1 se respeta, para mandar los sin-fecha al final', () => {
    // Lo usa /api/proprietari: con 0 un registro sin fecha se confundiria con
    // el 1 de enero de 1970, que es una fecha valida y ordenaria antes.
    expect(aMilisegundos(null, -1)).toBe(-1);
    expect(aMilisegundos({ _seconds: EN_SEGUNDOS }, -1)).toBe(UN_MOMENTO);
  });

  it('una fecha real de valor 0 no se confunde con «no hay fecha»', () => {
    expect(aMilisegundos({ _seconds: 0, _nanoseconds: 0 }, -1)).toBe(0);
  });
});

describe('primeraFechaMs — tres nombres para el mismo campo', () => {
  it('toma el primero que se entienda, no el primero que exista', () => {
    // `dataCreazione` esta, pero es basura: tiene que seguir buscando.
    expect(primeraFechaMs([undefined, 'no-es-fecha', { _seconds: EN_SEGUNDOS }])).toBe(UN_MOMENTO);
  });

  it('respeta el orden de preferencia', () => {
    const a = { _seconds: EN_SEGUNDOS };
    const b = { _seconds: EN_SEGUNDOS - 1000 };
    expect(primeraFechaMs([a, b])).toBe(aMilisegundos(a));
  });

  it('si no se entiende ninguno, el valor por defecto', () => {
    expect(primeraFechaMs([null, undefined, 'x'])).toBe(0);
    expect(primeraFechaMs([], -1)).toBe(-1);
  });
});
