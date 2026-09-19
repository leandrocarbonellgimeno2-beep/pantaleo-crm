import { describe, it, expect } from 'vitest';
import { listaDeRespuesta } from '@/lib/lista-respuesta';

describe('listaDeRespuesta', () => {
  it('un array pelado pasa tal cual (clienti, proprietari)', () => {
    expect(listaDeRespuesta([1, 2, 3])).toEqual([1, 2, 3]);
    expect(listaDeRespuesta([])).toEqual([]);
  });

  it('EL BUG: /api/immobili con q devuelve un objeto, no un array', () => {
    // Array.isArray sobre esto es false, y por eso dos typeaheads del CRM
    // llevaban meses rellenandose con la lista vacia mientras pagaban ~870
    // lecturas de Firestore por busqueda.
    const respuestaReal = { data: [{ id: 'a' }, { id: 'b' }], totalCount: 2 };
    expect(listaDeRespuesta(respuestaReal)).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('tambien la forma con nextCursor de la busqueda por codigo', () => {
    expect(listaDeRespuesta({ data: [{ id: 'x' }], nextCursor: null, totalCount: 1 })).toEqual([{ id: 'x' }]);
  });

  it('lo que no contiene lista devuelve lista vacia, nunca undefined', () => {
    for (const v of [null, undefined, 0, '', 'texto', {}, { data: null }, { data: 'no' }, { datos: [1] }]) {
      expect(listaDeRespuesta(v)).toEqual([]);
    }
  });

  it('un documento suelto (/api/immobili?id=) no se confunde con una lista', () => {
    expect(listaDeRespuesta({ id: '10006', DatiBase: { Codice: '10006' } })).toEqual([]);
  });
});
