import { describe, it, expect } from 'vitest';
import { belongsToProprietario } from '@/lib/ownership';

describe('belongsToProprietario — vinculos validos', () => {
  it('reconoce el campo nuevo', () => {
    expect(belongsToProprietario({ proprietarioId_real: 'owner1' }, 'owner1')).toBe(true);
  });

  it('reconoce el campo heredado, que es lo que evita el falso negativo', () => {
    // Los inmuebles anteriores a la migracion solo tienen proprietarioId.
    // Exigir el campo nuevo impediria desvincular un vinculo legitimo.
    expect(belongsToProprietario({ proprietarioId: 'owner1' }, 'owner1')).toBe(true);
  });

  it('reconoce los dos campos a la vez, que es como los escribe el POST', () => {
    expect(
      belongsToProprietario({ proprietarioId: 'owner1', proprietarioId_real: 'owner1' }, 'owner1'),
    ).toBe(true);
  });

  it('basta con que coincida uno de los dos', () => {
    // Estado posible si una migracion se quedo a medias.
    expect(
      belongsToProprietario({ proprietarioId: 'viejo', proprietarioId_real: 'owner1' }, 'owner1'),
    ).toBe(true);
  });
});

describe('belongsToProprietario — el ataque que cierra', () => {
  it('rechaza un inmueble de OTRO propietario', () => {
    expect(
      belongsToProprietario({ proprietarioId: 'owner2', proprietarioId_real: 'owner2' }, 'owner1'),
    ).toBe(false);
  });

  it('rechaza un inmueble sin propietario', () => {
    expect(belongsToProprietario({}, 'owner1')).toBe(false);
    expect(belongsToProprietario({ proprietarioId: undefined }, 'owner1')).toBe(false);
  });

  it('rechaza documentos ausentes', () => {
    expect(belongsToProprietario(null, 'owner1')).toBe(false);
    expect(belongsToProprietario(undefined, 'owner1')).toBe(false);
  });

  it('rechaza un id de propietario vacio', () => {
    // Sin esto, un inmueble con el campo a cadena vacia coincidiria.
    expect(belongsToProprietario({ proprietarioId: '' }, '')).toBe(false);
  });

  it('no compara por igualdad debil: un id numerico no coincide con su cadena', () => {
    expect(belongsToProprietario({ proprietarioId: 123 }, '123')).toBe(false);
  });
});
