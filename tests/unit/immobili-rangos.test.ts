import { describe, it, expect } from 'vitest';
import { numeroDe, cumpleRango, topeDe, precioDe } from '@/lib/immobili/rangos';
import { applyAdvancedFilters, createEmptyAdvFilters } from '@/lib/immobili/filters';

const base = createEmptyAdvFilters;
const ids = (r: any[]) => r.map((x) => x.id);

describe('numeroDe', () => {
  it('lee numeros y cadenas, que es como la base guarda esto', () => {
    // Medido: de los 870 inmuebles, 730 guardan los metros como TEXTO y 130
    // como numero. Las dos formas tienen que funcionar igual.
    expect(numeroDe(120)).toBe(120);
    expect(numeroDe('120')).toBe(120);
    expect(numeroDe(' 85 ')).toBe(85);
    expect(numeroDe('85.5')).toBe(85.5);
  });

  it('lo ausente es null, no cero', () => {
    for (const v of [null, undefined, '', '   ', 'abc', {}, [], true, false, NaN, Infinity]) {
      expect(numeroDe(v)).toBeNull();
    }
  });

  it('por defecto el cero es «sin rellenar», no «cero metros»', () => {
    expect(numeroDe(0)).toBeNull();
    expect(numeroDe('0')).toBeNull();
  });

  it('con ceroCuenta el cero es un valor de verdad', () => {
    // Para habitaciones y banos: un local comercial con 0 dormitorios no es un
    // campo sin rellenar, es la respuesta correcta.
    expect(numeroDe(0, { ceroCuenta: true })).toBe(0);
    expect(numeroDe('0', { ceroCuenta: true })).toBe(0);
    // Pero ausente sigue siendo ausente.
    expect(numeroDe(undefined, { ceroCuenta: true })).toBeNull();
    expect(numeroDe('', { ceroCuenta: true })).toBeNull();
  });
});

describe('cumpleRango — LA regla del bucle', () => {
  it('un valor desconocido NO satisface ningun rango', () => {
    for (const v of [undefined, null, '', 0, 'abc']) {
      expect(cumpleRango(v, null, 100)).toBe(false);
      expect(cumpleRango(v, 50, null)).toBe(false);
      expect(cumpleRango(v, 50, 100)).toBe(false);
    }
  });

  it('un valor conocido se compara como siempre', () => {
    expect(cumpleRango(80, null, 100)).toBe(true);
    expect(cumpleRango(120, null, 100)).toBe(false);
    expect(cumpleRango(120, 100, null)).toBe(true);
    expect(cumpleRango(80, 100, null)).toBe(false);
    expect(cumpleRango(80, 50, 100)).toBe(true);
  });

  it('los extremos son inclusivos, como antes', () => {
    expect(cumpleRango(100, null, 100)).toBe(true);
    expect(cumpleRango(100, 100, null)).toBe(true);
  });
});

describe('topeDe', () => {
  it('convierte el texto del input en tope', () => {
    expect(topeDe('100')).toBe(100);
    expect(topeDe('0.5')).toBe(0.5);
  });

  it('lo que no es un tope util devuelve null', () => {
    for (const v of ['', '0', '-5', 'abc']) expect(topeDe(v)).toBeNull();
  });
});

describe('precioDe', () => {
  it('venta si la hay, si no alquiler', () => {
    expect(precioDe({ GestioneCommerciale: { PrezzoVendita: 250000, PrezzoAffitto: 900 } })).toBe(250000);
    expect(precioDe({ GestioneCommerciale: { PrezzoAffitto: 900 } })).toBe(900);
  });

  it('LA TRAMPA: la cadena «0» es truthy en JavaScript', () => {
    // El atajo de antes era `PrezzoVendita || PrezzoAffitto`. Con la venta en
    // «0» —cadena, no numero— se quedaba con el cero y no llegaba a mirar el
    // alquiler. Hoy no hay ninguno asi en la base, pero la forma correcta no
    // cuesta mas.
    expect(precioDe({ GestioneCommerciale: { PrezzoVendita: '0', PrezzoAffitto: 900 } })).toBe(900);
    expect(precioDe({ GestioneCommerciale: { PrezzoVendita: 0, PrezzoAffitto: 900 } })).toBe(900);
  });

  it('sin ninguno de los dos, null', () => {
    expect(precioDe({ GestioneCommerciale: {} })).toBeNull();
    expect(precioDe({})).toBeNull();
    expect(precioDe(null)).toBeNull();
    expect(precioDe({ GestioneCommerciale: { PrezzoVendita: '', PrezzoAffitto: 0 } })).toBeNull();
  });
});

describe('el filtro de superficie sobre casos reales del catalogo', () => {
  // La base tiene 27 inmuebles sin metros cargados, 16 de ellos visibles en el
  // listado por defecto. Estos son las formas en que aparece ese hueco.
  const catalogo = [
    { id: 'con-80', DettagliFisici: { MetriCommerciali: 80 } },
    { id: 'con-texto', DettagliFisici: { MetriCommerciali: '250' } },
    { id: 'sin-campo', DettagliFisici: {} },
    { id: 'vacio', DettagliFisici: { MetriCommerciali: '' } },
    { id: 'cero', DettagliFisici: { MetriCommerciali: 0 } },
    { id: 'cero-texto', DettagliFisici: { MetriCommerciali: '0' } },
  ];

  it('EL ARREGLO: los que no tienen metros dejan de colarse en «hasta X»', () => {
    // Antes, Number(campo || 0) los convertia en 0 y un 0 satisface cualquier
    // tope superior: salian en TODAS las busquedas por tamano, incluida
    // «hasta 30 m²».
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), superficieMax: '100' }))).toEqual(['con-80']);
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), superficieMax: '30' }))).toEqual([]);
  });

  it('en «desde X» no cambia nada: ya quedaban fuera', () => {
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), superficieMin: '100' }))).toEqual(['con-texto']);
  });

  it('con rango por los dos lados tambien quedan fuera', () => {
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), superficieMin: '50', superficieMax: '300' })))
      .toEqual(['con-80', 'con-texto']);
  });

  it('SIN filtro de superficie se siguen viendo TODOS', () => {
    // Es la otra mitad de la decision: un inmueble sin metros no desaparece del
    // CRM, solo deja de colarse donde no puede demostrar que encaja.
    expect(ids(applyAdvancedFilters(catalogo, base()))).toEqual(catalogo.map((d) => d.id));
  });

  it('y tampoco estorban a otros filtros', () => {
    const conTipo = catalogo.map((d) => ({ ...d, DatiBase: { Tipologia: 'Appartamento' } }));
    expect(ids(applyAdvancedFilters(conTipo, { ...base(), tipologia: 'Appartamento' })))
      .toEqual(catalogo.map((d) => d.id));
  });
});

describe('el filtro de precio arrastraba el mismo fallo', () => {
  const catalogo = [
    { id: 'venta', GestioneCommerciale: { PrezzoVendita: 150000 } },
    { id: 'alquiler', GestioneCommerciale: { PrezzoAffitto: '900' } },
    { id: 'sin-precio', GestioneCommerciale: {} },
    { id: 'sin-mapa', DatiBase: {} },
  ];

  it('los inmuebles sin precio dejan de aparecer en «hasta X»', () => {
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), prezzoMax: '200000' })))
      .toEqual(['venta', 'alquiler']);
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), prezzoMax: '1000' }))).toEqual(['alquiler']);
  });

  it('sin filtro de precio siguen todos', () => {
    expect(ids(applyAdvancedFilters(catalogo, base()))).toEqual(catalogo.map((d) => d.id));
  });
});

describe('habitaciones y banos: el cero SI cuenta', () => {
  const catalogo = [
    { id: 'local', DettagliFisici: { CamereLetto: 0, Bagni: '1' } },
    { id: 'piso', DettagliFisici: { CamereLetto: 3, Bagni: 2 } },
    { id: 'sin-datos', DettagliFisici: {} },
  ];

  it('un minimo de 1 deja fuera al local y al que no tiene el dato', () => {
    // Resultado identico al de antes del cambio: con «desde X» y X>=1, el cero
    // ya quedaba fuera en las dos lecturas. Por eso estos filtros no cambian
    // ni un resultado en produccion.
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), camereMin: '1' }))).toEqual(['piso']);
    expect(ids(applyAdvancedFilters(catalogo, { ...base(), bagniMin: '1' }))).toEqual(['local', 'piso']);
  });

  it('sin filtro siguen los tres', () => {
    expect(ids(applyAdvancedFilters(catalogo, base()))).toEqual(['local', 'piso', 'sin-datos']);
  });
});
