/**
 * Filtros avanzados del catálogo de inmuebles.
 *
 * Vivían dentro de immobili/page.tsx, con el objeto de filtros vacío
 * duplicado literalmente (estado inicial y reset): añadir un filtro y olvidar
 * el reset era un bug silencioso. El contador eran 23 `if` manuales con el
 * mismo problema. Aquí hay una sola fuente de verdad.
 *
 * OJO: `codice` y `proprietario` NO se aplican en cliente. Viajan a la API
 * como parte de la consulta; se cuentan como activos, pero no filtran aquí.
 */

export interface AdvFilters {
  codice: string;
  proprietario: string;
  tipologia: string;
  zona: string;
  prezzoMin: string;
  prezzoMax: string;
  camereMin: string;
  bagniMin: string;
  superficieMin: string;
  superficieMax: string;
  piano: string;
  ascensore: boolean;
  balcone: boolean;
  terrazza: boolean;
  garage: boolean;
  giardino: boolean;
  arredato: boolean;
  vistaMare: boolean;
  ariaCondizionata: boolean;
  riscaldamentoAutonomo: boolean;
  classeEnergetica: string;
  statoFiniture: string;
  provincia: string;
}

const EMPTY_ADV_FILTERS: AdvFilters = {
  codice: '', proprietario: '', tipologia: '', zona: '',
  prezzoMin: '', prezzoMax: '',
  camereMin: '', bagniMin: '', superficieMin: '', superficieMax: '', piano: '',
  ascensore: false, balcone: false, terrazza: false, garage: false, giardino: false,
  arredato: false, vistaMare: false, ariaCondizionata: false, riscaldamentoAutonomo: false,
  classeEnergetica: '', statoFiniture: '', provincia: '',
};

/** Siempre una copia nueva: el objeto no debe compartirse entre estados. */
export const createEmptyAdvFilters = (): AdvFilters => ({ ...EMPTY_ADV_FILTERS });

/** Tipologías sin camere/bagni/superficie: al elegirlas esos filtros se limpian. */
export const NON_RESIDENTIAL_TYPES = [
  'Terreni', 'Locale o Capannone', 'Garage o Posto auto', 'Ufficio',
];

/** Mapea la clave del filtro con la del documento en Caratteristiche. */
const CHARACTERISTIC_KEYS: Record<string, string> = {
  ascensore: 'Ascensore', balcone: 'Balcone', terrazza: 'Terrazza',
  garage: 'Garage', giardino: 'Giardino', arredato: 'Arredato',
  vistaMare: 'VistaMare', ariaCondizionata: 'AriaCondizionata',
  riscaldamentoAutonomo: 'RiscaldamentoAutonomo',
};

/** Normaliza para comparar sin acentos ni mayúsculas. */
const nfd = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Precio de referencia: venta si existe, si no alquiler. */
const priceOf = (d: any) =>
  Number(d.GestioneCommerciale?.PrezzoVendita || d.GestioneCommerciale?.PrezzoAffitto || 0);

export function applyAdvancedFilters<T = any>(items: T[], af: AdvFilters): T[] {
  let result: any[] = items as any[];

  // Tipologia (coincidencia exacta — la BBDD está normalizada)
  if (af.tipologia) result = result.filter(d => d.DatiBase?.Tipologia === af.tipologia);

  if (af.zona) {
    const z = nfd(af.zona);
    result = result.filter(d => nfd(d.DatiBase?.Zona || '').includes(z));
  }

  if (af.provincia) {
    const p = nfd(af.provincia);
    result = result.filter(d => nfd(d.DatiBase?.Citta || '').includes(p));
  }

  if (af.prezzoMin && Number(af.prezzoMin) > 0) {
    const min = Number(af.prezzoMin);
    result = result.filter(d => priceOf(d) >= min);
  }
  if (af.prezzoMax && Number(af.prezzoMax) > 0) {
    const max = Number(af.prezzoMax);
    result = result.filter(d => priceOf(d) <= max);
  }

  if (af.camereMin && Number(af.camereMin) > 0) {
    const min = Number(af.camereMin);
    result = result.filter(d => Number(d.DettagliFisici?.CamereLetto || 0) >= min);
  }

  if (af.bagniMin && Number(af.bagniMin) > 0) {
    const min = Number(af.bagniMin);
    result = result.filter(d => Number(d.DettagliFisici?.Bagni || 0) >= min);
  }

  if (af.superficieMin && Number(af.superficieMin) > 0) {
    const min = Number(af.superficieMin);
    result = result.filter(d => Number(d.DettagliFisici?.MetriCommerciali || 0) >= min);
  }
  if (af.superficieMax && Number(af.superficieMax) > 0) {
    const max = Number(af.superficieMax);
    result = result.filter(d => Number(d.DettagliFisici?.MetriCommerciali || 0) <= max);
  }

  if (af.piano) result = result.filter(d => d.DettagliFisici?.Piano === af.piano);
  if (af.classeEnergetica) result = result.filter(d => d.DettagliFisici?.ClasseEnergetica === af.classeEnergetica);
  if (af.statoFiniture) result = result.filter(d => d.DettagliFisici?.StatoFiniture === af.statoFiniture);

  for (const [key, docKey] of Object.entries(CHARACTERISTIC_KEYS)) {
    if (af[key as keyof AdvFilters]) {
      result = result.filter(d => d.Caratteristiche?.[docKey]);
    }
  }

  return result as T[];
}

/**
 * Cuenta los filtros activos. Se deriva de las claves conocidas en lugar de
 * enumerarlas a mano, para que añadir un filtro no exija tocar el contador.
 */
export function countActiveFilters(af: AdvFilters): number {
  return (Object.keys(EMPTY_ADV_FILTERS) as Array<keyof AdvFilters>)
    .filter(key => Boolean(af[key])).length;
}
