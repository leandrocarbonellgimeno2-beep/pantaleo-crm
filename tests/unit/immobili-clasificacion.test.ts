import { describe, it, expect } from 'vitest';
import {
  normalizarTexto,
  plantasDe,
  estaEnLaPlanta,
  estadoDe,
  tieneElEstado,
  PLANTAS,
  ESTADOS_ACABADO,
} from '@/lib/immobili/clasificacion';

/**
 * Los casos de este fichero NO son inventados: son los valores que de verdad
 * hay en los 870 inmuebles de producción, con su frecuencia medida al lado.
 * Por eso el test sirve de algo: si alguien cambia la clasificación, aquí se
 * ve cuántos inmuebles se dejan de encontrar.
 */

describe('normalizarTexto', () => {
  it('quita acentos, mayusculas y espacios de sobra', () => {
    expect(normalizarTexto('  Piano   TERRA ')).toBe('piano terra');
    expect(normalizarTexto('Più')).toBe('piu');
  });

  it('lo que no es cadena da cadena vacia', () => {
    for (const v of [null, undefined, 42, {}, []]) expect(normalizarTexto(v)).toBe('');
  });
});

describe('plantasDe — sobre los valores reales de la base', () => {
  it('reconoce las tres formas de escribir la planta baja', () => {
    // 37 + 20 + 5 = 62 inmuebles que el desplegable cerrado no encontraba.
    for (const v of ['TERRA', 'Terra', 'terra', 'Piano Terra']) {
      expect(plantasDe(v)).toContain('terra');
    }
  });

  it('«Basso» es su propia planta: 341 inmuebles, el 39% del catalogo', () => {
    expect(plantasDe('Basso')).toEqual(['basso']);
    expect(plantasDe('Alto')).toEqual(['alto']);
  });

  it('reconoce los ordinales escritos con letra', () => {
    expect(plantasDe('PRIMO')).toContain('1');
    expect(plantasDe('Primo')).toContain('1');
    expect(plantasDe('SECONDO')).toContain('2');
    expect(plantasDe('TERZO')).toContain('3');
    expect(plantasDe('QUARTO')).toContain('4');
  });

  it('un inmueble en varias plantas sale en TODAS', () => {
    // Es lo que hace util el cambio: un local que ocupa baja y primera esta de
    // verdad en las dos, y con igualdad estricta no aparecia en ninguna.
    expect(plantasDe('Piano Terra e Primo').sort()).toEqual(['1', 'terra']);
    expect(plantasDe('Piano Terra e Primo Piano').sort()).toEqual(['1', 'terra']);
    expect(plantasDe('PRIMO E SECONDO').sort()).toEqual(['1', '2']);
    expect(plantasDe('3° e 4° Piano').sort()).toEqual(['3', '4']);
    expect(plantasDe('Su più livelli (1° e 2°)').sort()).toEqual(['1', '2']);
    expect(plantasDe('Terra-Primo-seminterrato').sort()).toEqual(['1', 'seminterrato', 'terra']);
  });

  it('los separadores raros no estorban', () => {
    expect(plantasDe('1°-2°').sort()).toEqual(['1', '2']);
    expect(plantasDe('1,2').sort()).toEqual(['1', '2']);
    expect(plantasDe('1-2-3').sort()).toEqual(['1', '2', '3']);
    expect(plantasDe('1 e 2').sort()).toEqual(['1', '2']);
    expect(plantasDe('2 e 3').sort()).toEqual(['2', '3']);
  });

  it('LA TRAMPA: «seminterrato» contiene «terra» como subcadena', () => {
    // Sin frontera de palabra, los 10 semisotanos se colarian en el filtro de
    // planta baja y nadie se enteraria.
    expect(plantasDe('Seminterrato')).toEqual(['seminterrato']);
    expect(plantasDe('Semicantinato')).toEqual(['seminterrato']);
    expect(plantasDe('Cantinato')).toEqual(['seminterrato']);
  });

  it('rialzato y ammezzato, que tampoco estaban en el desplegable', () => {
    expect(plantasDe('Piano Rialzato')).toEqual(['rialzato']);
    expect(plantasDe('Piano rialzato')).toEqual(['rialzato']);
    expect(plantasDe('Rialzato')).toEqual(['rialzato']);
    expect(plantasDe('Piano Ammezzato')).toEqual(['ammezzato']);
    expect(plantasDe('AMMEZZATO')).toEqual(['ammezzato']);
    expect(plantasDe('Piano Terra e Piano Sollevato').sort()).toEqual(['rialzato', 'terra']);
  });

  it('lo que no dice nada devuelve lista vacia, sin adivinar', () => {
    // «PRIMP» es una errata real de la base. Adivinarla seria peor que no
    // encontrarla: un inmueble colocado en una planta que nadie escribio.
    for (const v of ['', '-', 'PRIMP', 'Unico', 'Unico Piano', 'Su più livelli', null, undefined]) {
      expect(plantasDe(v)).toEqual([]);
    }
  });

  it('todas las claves que devuelve existen en el desplegable', () => {
    const validas = new Set(PLANTAS.map((p) => p.clave));
    const muestra = [
      'Basso', 'Piano Terra', '1', '2', '3', '4', '5', '6', 'TERRA', 'Piano Ammezzato',
      'Alto', 'SECONDO', 'PRIMO', 'Piano Rialzato', 'Seminterrato', 'Attico', 'Mansarda',
      'Piano Terra e Primo', '1°-2°', 'Terra-Primo-seminterrato',
    ];
    for (const v of muestra) {
      for (const clave of plantasDe(v)) expect(validas.has(clave)).toBe(true);
    }
  });
});

describe('estaEnLaPlanta', () => {
  it('sin filtro no descarta nada', () => {
    expect(estaEnLaPlanta('lo que sea', '')).toBe(true);
    expect(estaEnLaPlanta(undefined, '')).toBe(true);
  });

  it('encuentra el caso que antes se perdia', () => {
    expect(estaEnLaPlanta('TERRA', 'terra')).toBe(true);
    expect(estaEnLaPlanta('Piano Terra e Primo', 'terra')).toBe(true);
    expect(estaEnLaPlanta('Piano Terra e Primo', '1')).toBe(true);
    expect(estaEnLaPlanta('Basso', 'basso')).toBe(true);
  });

  it('no encuentra lo que no es', () => {
    expect(estaEnLaPlanta('Seminterrato', 'terra')).toBe(false);
    expect(estaEnLaPlanta('Basso', 'terra')).toBe(false);
    expect(estaEnLaPlanta('', 'terra')).toBe(false);
  });
});

describe('estadoDe — sobre los valores reales de la base', () => {
  it('el singular del desplegable y el plural del dato son lo mismo', () => {
    // 137 inmuebles dicen «Buone» y el desplegable decia «Buono». Ninguno de
    // los 137 aparecia jamas.
    expect(estadoDe('Buone')).toBe('buone');
    expect(estadoDe('Buono')).toBe('buone');
    expect(estadoDe('BUONE')).toBe('buone');
  });

  it('«Normali» es el estado mas frecuente y faltaba en la lista', () => {
    expect(estadoDe('Normali')).toBe('normali');
    expect(ESTADOS_ACABADO.some((e) => e.clave === 'normali')).toBe(true);
  });

  it('la caja de mayusculas da igual', () => {
    expect(estadoDe('OTTIMO')).toBe('ottime');
    expect(estadoDe('Ottime')).toBe('ottime');
    expect(estadoDe('Da ristrutturare')).toBe('da-ristrutturare');
    expect(estadoDe('Da Ristrutturare')).toBe('da-ristrutturare');
  });

  it('los que faltaban en el desplegable ya tienen sitio', () => {
    expect(estadoDe('Da Sistemare')).toBe('da-sistemare');
    expect(estadoDe('Ristrutturato')).toBe('ristrutturato');
    expect(estadoDe('Nuovo')).toBe('nuovo');
    expect(estadoDe('Abitabile')).toBe('abitabile');
  });

  it('lo que no informa de nada da null', () => {
    for (const v of ['', '-', '-- Non specificato --', 'cualquier cosa', null, undefined]) {
      expect(estadoDe(v)).toBeNull();
    }
  });

  it('tieneElEstado sin filtro no descarta', () => {
    expect(tieneElEstado('-- Non specificato --', '')).toBe(true);
    expect(tieneElEstado('Buone', 'buone')).toBe(true);
    expect(tieneElEstado('Buone', 'ottime')).toBe(false);
  });
});

describe('cobertura sobre la distribucion real medida en produccion', () => {
  // Los 24 valores de Piano mas frecuentes con su recuento real. Suman 811 de
  // los 870 inmuebles.
  const PIANO_REAL: Array<[string, number]> = [
    ['Basso', 341], ['Piano Terra', 75], ['1', 72], ['2', 45], ['', 43], ['-', 38],
    ['TERRA', 37], ['3', 22], ['Terra', 20], ['Piano Ammezzato', 18], ['Ammezzato', 13],
    ['4', 11], ['Alto', 10], ['SECONDO', 9], ['PRIMO', 8], ['5', 6], ['Piano Rialzato', 5],
    ['terra', 5], ['Primo', 5], ['Piano Terra e Primo', 4], ['Seminterrato', 4],
    ['TERZO', 4], ['primo', 4], ['Piano Terra e Primo Piano', 3],
  ];

  it('la clasificacion alcanza a mas del 85% del catalogo', () => {
    const total = PIANO_REAL.reduce((s, [, n]) => s + n, 0);
    const clasificados = PIANO_REAL.reduce((s, [v, n]) => s + (plantasDe(v).length ? n : 0), 0);
    // Los no clasificados son los 43 vacios y los 38 guiones: no dicen nada, y
    // eso es correcto, no un fallo.
    expect(clasificados / total).toBeGreaterThan(0.85);
  });

  it('con igualdad estricta contra el desplegable viejo apenas se llegaba a un tercio', () => {
    // Esto documenta el fallo que se arregla. El desplegable ofrecia estos 8.
    const VIEJO = ['Piano Terra', '1', '2', '3', '4', '5', 'Attico', 'Seminterrato'];
    const total = PIANO_REAL.reduce((s, [, n]) => s + n, 0);
    const alcanzaViejo = PIANO_REAL.reduce((s, [v, n]) => s + (VIEJO.includes(v) ? n : 0), 0);
    expect(alcanzaViejo / total).toBeLessThan(0.34);
  });
});
