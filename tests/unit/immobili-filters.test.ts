import { describe, it, expect } from 'vitest';
import {
  applyAdvancedFilters,
  countActiveFilters,
  createEmptyAdvFilters,
  NON_RESIDENTIAL_TYPES,
  ZONA_SIN_ASIGNAR,
  CARATTERISTICHE,
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
    // «c» es el documento minimo: sin precio. Ya NO se cuela en un tope
    // superior, porque un dato ausente no satisface ningun rango.
    expect(ids(applyAdvancedFilters(immobili, { ...base(), prezzoMax: '1000' }))).toEqual(['b']);
  });

  it('un precio de 0 o vacio no filtra', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), prezzoMin: '0' }))).toEqual(['a', 'b', 'c']);
  });

  it('camere, bagni y superficie son minimos y maximos', () => {
    expect(ids(applyAdvancedFilters(immobili, { ...base(), camereMin: '4' }))).toEqual(['b']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), bagniMin: '3' }))).toEqual(['b']);
    expect(ids(applyAdvancedFilters(immobili, { ...base(), superficieMin: '100' }))).toEqual(['b']);
    // Idem: «c» no tiene MetriCommerciali, asi que no puede demostrar que
    // cabe en «hasta 100 m²» y queda fuera.
    expect(ids(applyAdvancedFilters(immobili, { ...base(), superficieMax: '100' }))).toEqual(['a']);
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

  it('cubre todas las claves sin enumerarlas a mano', () => {
    // Eran 23 y ahora son 26, con las tres casillas nuevas de caracteristicas.
    // El contador se deriva de las claves del objeto vacio justamente para que
    // anadir un filtro no obligue a tocarlo: este test comprueba esa
    // propiedad, no el numero, que cambia cada vez que se amplia el buscador.
    const claves = Object.keys(base());
    const todos = Object.fromEntries(
      Object.entries(base()).map(([k, v]) => [k, typeof v === 'boolean' ? true : 'x']),
    ) as any;
    expect(countActiveFilters(todos)).toBe(claves.length);
    expect(claves.length).toBe(26);
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

describe('las tres casillas nuevas de caracteristicas', () => {
  // Salen de la auditoria contra produccion: son las tres claves de
  // Caratteristiche que estaban pobladas como booleanos reales y que la
  // interfaz no ofrecia filtrar. PostoAuto en 413 inmuebles, CucinaAbitabile
  // en 171 y PostoAutoScoperto en 103.
  const catalogo = [
    { id: 'con-posto', Caratteristiche: { PostoAuto: true, CucinaAbitabile: false } },
    { id: 'con-cucina', Caratteristiche: { CucinaAbitabile: true } },
    { id: 'con-scoperto', Caratteristiche: { PostoAutoScoperto: true } },
    { id: 'con-todo', Caratteristiche: { PostoAuto: true, CucinaAbitabile: true, PostoAutoScoperto: true } },
    { id: 'sin-nada', Caratteristiche: {} },
    { id: 'sin-mapa', DatiBase: {} },
  ];

  it('postoAuto filtra por Caratteristiche.PostoAuto', () => {
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), postoAuto: true })))
      .toEqual(['con-posto', 'con-todo']);
  });

  it('cucinaAbitabile filtra por Caratteristiche.CucinaAbitabile', () => {
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), cucinaAbitabile: true })))
      .toEqual(['con-cucina', 'con-todo']);
  });

  it('postoAutoScoperto filtra por Caratteristiche.PostoAutoScoperto', () => {
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), postoAutoScoperto: true })))
      .toEqual(['con-scoperto', 'con-todo']);
  });

  it('se acumulan con las demas, como las otras nueve', () => {
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), postoAuto: true, cucinaAbitabile: true })))
      .toEqual(['con-todo']);
  });

  it('un false explicito no cuenta como tener la caracteristica', () => {
    expect(ids(applyAdvancedFilters([catalogo[0]], { ...base(), cucinaAbitabile: true }))).toEqual([]);
  });

  it('sin marcar, no descartan a nadie', () => {
    expect(ids(applyAdvancedFilters(catalogo, base()))).toEqual(catalogo.map(d => d.id));
  });

  it('cuentan en el contador de filtros activos', () => {
    // countActiveFilters se deriva de las claves del objeto vacio, asi que las
    // tres nuevas entran solas. Este test lo fija.
    expect(countActiveFilters({ ...base(), postoAuto: true })).toBe(1);
    expect(countActiveFilters({ ...base(), postoAuto: true, cucinaAbitabile: true, postoAutoScoperto: true })).toBe(3);
  });
});

describe('la lista de caracteristicas es una sola fuente', () => {
  it('cada casilla declarada tiene su clave en el objeto de filtros', () => {
    // Es la invariante que protege de anadir una casilla que no filtra nada,
    // o un filtro que nadie puede activar: antes habia DOS listas, la del
    // cajon y la del filtrado, y habia que acordarse de tocar las dos.
    const vacio = base() as unknown as Record<string, unknown>;
    for (const c of CARATTERISTICHE) {
      expect(Object.prototype.hasOwnProperty.call(vacio, c.clave)).toBe(true);
      expect(vacio[c.clave]).toBe(false);
    }
  });

  it('no hay claves ni campos repetidos', () => {
    const claves = CARATTERISTICHE.map(c => c.clave);
    const campos = CARATTERISTICHE.map(c => c.campo);
    expect(new Set(claves).size).toBe(claves.length);
    expect(new Set(campos).size).toBe(campos.length);
  });

  it('son las doce esperadas', () => {
    expect(CARATTERISTICHE).toHaveLength(12);
    expect(CARATTERISTICHE.map(c => c.campo)).toContain('PostoAuto');
    expect(CARATTERISTICHE.map(c => c.campo)).toContain('CucinaAbitabile');
    expect(CARATTERISTICHE.map(c => c.campo)).toContain('PostoAutoScoperto');
  });

  it('todas tienen etiqueta y emoji para pintarse', () => {
    for (const c of CARATTERISTICHE) {
      expect(c.etiqueta.length).toBeGreaterThan(0);
      expect(c.emoji.length).toBeGreaterThan(0);
    }
  });
});
