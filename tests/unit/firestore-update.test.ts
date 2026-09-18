import { describe, it, expect } from 'vitest';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  isPlainObject,
  toFieldPathEntries,
  buildUpdateArgs,
} from '@/lib/firestore-update';

const paths = (data: Record<string, unknown>) =>
  toFieldPathEntries(data).map(e => e.segments.join('|'));

describe('toFieldPathEntries — aplanado', () => {
  it('descompone los mapas anidados en hojas', () => {
    expect(paths({ DatiBase: { Codice: '1001', Stato: 'Libero' } }))
      .toEqual(['DatiBase|Codice', 'DatiBase|Stato']);
  });

  it('recorre varios niveles', () => {
    expect(paths({ a: { b: { c: 1 } } })).toEqual(['a|b|c']);
  });

  it('deja los escalares de primer nivel como estan', () => {
    expect(paths({ note: 'x', proprietarioId: 'abc' })).toEqual(['note', 'proprietarioId']);
  });
});

describe('toFieldPathEntries — que NO se recorre', () => {
  it('los arrays son hojas: se escriben completos', () => {
    const e = toFieldPathEntries({ images: ['a.jpg', 'b.jpg'] });
    expect(e).toHaveLength(1);
    expect(e[0].segments).toEqual(['images']);
    expect(e[0].value).toEqual(['a.jpg', 'b.jpg']);
  });

  it('un array dentro de un mapa conserva a sus hermanas', () => {
    // El caso de handleDocUpload: escribir AltriDocumenti no debe tocar
    // DocumentiIdentita ni ModuliPrivacy.
    expect(paths({ Documentazione: { AltriDocumenti: [1, 2] } }))
      .toEqual(['Documentazione|AltriDocumenti']);
  });

  it('los centinelas FieldValue son hojas', () => {
    const e = toFieldPathEntries({
      updatedAt: FieldValue.serverTimestamp(),
      Matching: { Preferiti: FieldValue.arrayUnion('x') },
      proprietarioId: FieldValue.delete(),
    });
    expect(e.map(x => x.segments.join('|')).sort())
      .toEqual(['Matching|Preferiti', 'proprietarioId', 'updatedAt']);
  });

  it('Timestamp y Date son hojas', () => {
    expect(paths({ t: Timestamp.fromMillis(0), d: new Date(0) })).toEqual(['t', 'd']);
  });

  it('isPlainObject distingue objetos literales del resto', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(FieldValue.serverTimestamp())).toBe(false);
  });
});

describe('toFieldPathEntries — omisiones deliberadas', () => {
  it('omite los mapas vacios en lugar de borrar el mapa existente', () => {
    expect(paths({ Matching: {}, note: 'x' })).toEqual(['note']);
  });

  it('omite los mapas que quedan vacios en profundidad', () => {
    expect(toFieldPathEntries({ a: { b: {} } })).toEqual([]);
  });

  it('omite undefined, que Firestore rechazaria', () => {
    expect(paths({ a: undefined, b: 1 })).toEqual(['b']);
  });

  it('conserva null: es un borrado de valor legitimo', () => {
    const e = toFieldPathEntries({ Idealista: { idealistaError: null } });
    expect(e).toHaveLength(1);
    expect(e[0].value).toBeNull();
  });
});

describe('buildUpdateArgs — seguridad de rutas', () => {
  it('alterna FieldPath y valor', () => {
    const args = buildUpdateArgs({ DatiBase: { Stato: 'Venduto' } });
    expect(args).toHaveLength(2);
    expect(args[0]).toBeInstanceOf(FieldPath);
    expect(args[1]).toBe('Venduto');
  });

  it('una clave anidada con un punto NO se parte en dos segmentos', () => {
    // sanitizeBody solo valida el primer nivel, asi que una clave anidada
    // hostil podria intentar escribir en otra rama del documento.
    const args = buildUpdateArgs({ DatiBase: { 'a.b': 1 } });
    expect((args[0] as FieldPath).toString()).toBe('DatiBase.`a.b`');
  });

  it('devuelve [] cuando no hay nada que escribir', () => {
    expect(buildUpdateArgs({})).toEqual([]);
    expect(buildUpdateArgs({ Matching: {} })).toEqual([]);
  });
});
