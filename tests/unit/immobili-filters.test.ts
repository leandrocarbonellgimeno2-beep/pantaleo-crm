import { describe, it, expect } from 'vitest';
import {
  applyAdvancedFilters,
  countActiveFilters,
  createEmptyAdvFilters,
  NON_RESIDENTIAL_TYPES,
  ZONA_SIN_ASIGNAR,
} from '@/lib/immobili/filters';

const base = createEmptyAdvFilters;

const immobili = [
  {
    id: 'a',
    DatiBase: { Tipologia: 'Appartamento', Zona: 'Centro Storico', Citta: 'Marsala' },
    DettagliFisici: { CamereLetto: 3, Bagni: 2, MetriCommerciali: 90, Piano: '2', ClasseEnergetica: 'A', StatoFiniture: 'Nuovo' },
    GestioneCommerciale: { PrezzoVendita: 250000 },
    Caratteristiche: { Ascensore: true, VistaMare: false },
  },
  {
    id: 'b',
    DatiBase: { Tipologia: 'Villa', Zona: 'Periferia', Citta: 'Trapani' },
    DettagliFisici: { CamereLetto: 5, Bagni: 3, MetriCommerciali: 200, Piano: 'T', ClasseEnergetica: 'C', StatoFiniture: 'Da ristrutturare' },
    GestioneCommerciale: { PrezzoAffitto: 900 },
    Caratteristiche: { VistaMare: true },
  },
  { id: 'c', DatiBase: { Tipologia: 'Terreni' } }, // documento minimo
];

const ids = (r: any[]) => r.map(x => x.id);

describe('applyAdvancedFilters', () => {
  it('sin filtros devuelve todo', () => {
    expect(ids(applyAdvancedFilters(immobili, base()))).toEqual(['a', 'b', 'c']);
  });

  it('tipologia es coincidencia exacta', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), tipologia: 'Villa' }))).toEqual(['b']);
  });

  it('zona ignora acentos y mayusculas y busca por contenido', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), zona: 'centro' }))).toEqual(['a']);
  });

  it('provincia filtra por ciudad', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), provincia: 'trapani' }))).toEqual(['b']);
  });

  it('el precio usa venta, y alquiler como alternativa', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), prezzoMin: '1000' }))).toEqual(['a']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), prezzoMax: '1000' }))).toEqual(['b', 'c']);
  });

  it('un precio de 0 o vacio no filtra', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), prezzoMin: '0' }))).toEqual(['a', 'b', 'c']);
  });

  it('camere, bagni y superficie son minimos y maximos', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), camereMin: '4' }))).toEqual(['b']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), bagniMin: '3' }))).toEqual(['b']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), superficieMin: '100' }))).toEqual(['b']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), superficieMax: '100' }))).toEqual(['a', 'c']);
  });

  it('piano y estado se CLASIFICAN, no se comparan letra a letra', () => {
    // El fixture guarda Piano: 'T' y StatoFiniture: 'Da ristrutturare' (con erre
    // minuscula). Con la comparacion estricta de antes, el desplegable ofrecia
    // 'Piano Terra' y 'Da Ristrutturare' y ninguno de los dos encontraba nada.
    expect(ids(applyAdvancedFilters(immobili, { ...base(), piano: 'terra' }))).toEqual(['b']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), piano: '2' }))).toEqual(['a']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), statoFiniture: 'nuovo' }))).toEqual(['a']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), statoFiniture: 'da-ristrutturare' }))).toEqual(['b']);
  });

  it('la clase energetica SI es un vocabulario cerrado y sigue siendo exacta', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), classeEnergetica: 'A' }))).toEqual(['a']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), classeEnergetica: 'G' }))).toEqual([]);
  });

  it('la opcion «sin zona» encuentra los que no la tienen', () => {
    // Antes esta opcion valia la cadena literal «Nessuna Zona» y el filtro la
    // comparaba por SUBCADENA contra DatiBase.Zona. Como ningun inmueble tiene
    // una zona que contenga ese texto, devolvia CERO resultados SIEMPRE, y los
    // 11 inmuebles sin zona de la base no se podian encontrar por ninguna via.
    const conYSin = [
      { id: 'con', DatiBase: { Zona: 'Centro' } },
      { id: 'vacia', DatiBase: { Zona: '' } },
      { id: 'espacios', DatiBase: { Zona: '   ' } },
      { id: 'ausente', DatiBase: {} },
    ];
    expect(ids(applyAdvancedFilters(conYSin, { ...base(), zona: ZONA_SIN_ASIGNAR })))
      .toEqual(['vacia', 'espacios', 'ausente']);
  });

  it('el centinela no puede confundirse con una zona de verdad', () => {
    const trampa = [{ id: 'x', DatiBase: { Zona: 'Nessuna Zona' } }];
    // Una zona que se llamara literalmente asi NO se cuela en «sin zona».
    expect(ids(applyAdvancedFilters(trampa, { ...base(), zona: ZONA_SIN_ASIGNAR }))).toEqual([]);
    // Y se sigue encontrando por su nombre, como cualquier otra.
    expect(ids(applyAdvancedFilters(trampa, { ...base(), zona: 'Nessuna Zona' }))).toEqual(['x']);
  });

  it('la zona sigue casando por subcadena y sin acentos', () => {
    // Los valores reales son «Rif. A1 Centro Storico», «Rif. A2 Centro»,
    // «Marsala Centro»... Buscar «Centro» tiene que encontrarlos todos.
    const reales = [
      { id: 'a', DatiBase: { Zona: 'Rif. A1 Centro Storico' } },
      { id: 'b', DatiBase: { Zona: 'Marsala Centro' } },
      { id: 'c', DatiBase: { Zona: 'Periferia' } },
    ];
    expect(ids(applyAdvancedFilters(reales, { ...base(), zona: 'Centro' }))).toEqual(['a', 'b']);
  });

  it('un inmueble en varias plantas aparece en todas', () => {
    const local = [{ id: 'multi', DettagliFisici: { Piano: 'Piano Terra e Primo' } }];
    expect(ids(applyAdvancedFilters(local, { ...base(), piano: 'terra' }))).toEqual(['multi']);
    expect(ids(applyAdvancedFilters(local, { ...base(), piano: '1' }))).toEqual(['multi']);
    expect(ids(applyAdvancedFilters(local, { ...base(), piano: '2' }))).toEqual([]);
  });

  it('las caracteristicas booleanas exigen el flag en el documento', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), ascensore: true }))).toEqual(['a']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), vistaMare: true }))).toEqual(['b']);
  });

  it('los filtros se acumulan', () => {
    const r = applyAdvancedFilters(immobili, { ...base(), tipologia: 'Appartamento', camereMin: '2', ascensore: true });
    expect(ids(r)).toEqual(['a']);
  });

  it('codice y proprietario NO filtran en cliente: van a la API', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), codice: 'XXX', proprietario: 'YYY' })))
      .toEqual(['a', 'b', 'c']);
  });

  it('tolera documentos incompletos sin reventar', () => {
    expect(() => applyAdvancedFilters(immobili, { ...base(), camereMin: '1', zona: 'x' })).not.toThrow();
  });

  it('no muta el array de entrada', () => {
    const copia = [...immobili];
    applyAdvancedFilters(immobili, { ...base(), tipologia: 'Villa' });
    expect(immobili).toEqual(copia);
  });
});

describe('countActiveFilters', () => {
  it('cuenta 0 sin filtros', () => {
    expect(countActiveFilters(base())).toBe(0);
  });

  it('cuenta cadenas y booleanos', () => {
    expect(countActiveFilters({ ...base(), zona: 'Centro', ascensore: true, prezzoMin: '100' })).toBe(3);
  });

  it('cuenta codice y proprietario aunque no filtren en cliente', () => {
    expect(countActiveFilters({ ...base(), codice: '1001', proprietario: 'Rossi' })).toBe(2);
  });

  it('cubre las 23 claves: todas activas suman 23', () => {
    const todos = Object.fromEntries(
      Object.entries(base()).map(([k, v]) => [k, typeof v === 'boolean' ? true : 'x']),
    ) as any;
    expect(countActiveFilters(todos)).toBe(23);
  });
});

describe('createEmptyAdvFilters', () => {
  it('devuelve una copia nueva cada vez', () => {
    const a = createEmptyAdvFilters();
    const b = createEmptyAdvFilters();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('NON_RESIDENTIAL_TYPES conserva las cuatro tipologias', () => {
    expect(NON_RESIDENTIAL_TYPES).toHaveLength(4);
    expect(NON_RESIDENTIAL_TYPES).toContain('Terreni');
  });
});
