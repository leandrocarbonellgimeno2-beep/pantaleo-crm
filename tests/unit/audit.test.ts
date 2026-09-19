import { describe, it, expect } from 'vitest';
import { nombresDeCampos } from '@/lib/services/audit';

describe('nombresDeCampos — solo NOMBRES, jamas valores', () => {
  it('aplana a rutas con punto', () => {
    expect(nombresDeCampos({ DatiBase: { Prezzo: 1, Codice: 'P001' } })).toEqual([
      'DatiBase.Prezzo',
      'DatiBase.Codice',
    ]);
  });

  it('EL PUNTO DE TODO: el valor no aparece por ninguna parte', () => {
    // Guardar el antes y el despues meteria datos personales de clientes y
    // firmas en base64 dentro del registro de auditoria, que es justo lo que
    // un registro no debe contener.
    const campos = nombresDeCampos({
      DatiPersonali: { Nome: 'Mario', CodiceFiscale: 'RSSMRA80A01H501U' },
      firmaDigitale: 'data:image/png;base64,iVBORw0KG...',
    });
    const serializado = JSON.stringify(campos);
    expect(serializado).not.toContain('Mario');
    expect(serializado).not.toContain('RSSMRA80A01H501U');
    expect(serializado).not.toContain('base64');
    expect(campos).toContain('DatiPersonali.Nome');
    expect(campos).toContain('firmaDigitale');
  });

  it('trata los arrays como una hoja, sin recorrer su contenido', () => {
    // Recorrerlos convertiria un array de 40 fotos en 40 entradas inutiles.
    const campos = nombresDeCampos({ images: ['a.jpg', 'b.jpg'], Matching: { Proposti: [1, 2] } });
    expect(campos).toEqual(['images', 'Matching.Proposti']);
  });

  it('limita la profundidad', () => {
    const hondo = { a: { b: { c: { d: { e: 1 } } } } };
    const campos = nombresDeCampos(hondo);
    expect(campos.every((c) => c.split('.').length <= 5)).toBe(true);
  });

  it('limita el numero de campos: un registro no es una copia del documento', () => {
    const enorme: Record<string, number> = {};
    for (let i = 0; i < 200; i++) enorme['campo' + i] = i;
    expect(nombresDeCampos(enorme).length).toBeLessThanOrEqual(60);
  });

  it('tolera entradas raras sin lanzar', () => {
    expect(nombresDeCampos(null)).toEqual([]);
    expect(nombresDeCampos(undefined)).toEqual([]);
    expect(nombresDeCampos('texto')).toEqual([]);
    expect(nombresDeCampos({})).toEqual([]);
  });
});
