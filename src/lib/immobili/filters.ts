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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUDITORÍA CONTRA LOS 870 INMUEBLES REALES (2026-09-20)
 *
 * Se midió cada filtro contra producción en vez de suponer. La herramienta es
 * `scripts/auditar-filtros.cjs`, que solo lee y se puede relanzar.
 *
 *   tipologia ........ SANO. El desplegable cubre los 10 valores que existen.
 *   provincia ........ SANO. Compara por subcadena normalizada contra Citta,
 *                      así que absorbe los 53 «MARSALA» y los 3 «marsala».
 *   zona ............. SANO, 857 de 859 alcanzables. Los dos huérfanos son
 *                      «Zona Tribunale» y «Stadio». Su opción «sin zona» SÍ
 *                      estaba rota: ver ZONA_SIN_ASIGNAR más abajo.
 *   prezzo min/max ... La coacción numérica está SANA: se temía que `Number()`
 *                      devolviera NaN sobre precios guardados como texto —son
 *                      337 y 394 cadenas— y las dos listas dan CERO NaN. Pero
 *                      el TOPE SUPERIOR sí estaba roto: ver más abajo.
 *   camere, bagni,
 *   superficie ....... Igual. 344, 642 y 730 cadenas, cero NaN, y el tope
 *                      superior de superficie roto por lo mismo.
 *
 *   classeEnergetica . SANO. Vocabulario cerrado de verdad: 864 de 870 «G».
 *   piano ............ ESTABA ROTO, arreglado en el bucle anterior.
 *   statoFiniture .... ESTABA ROTO, arreglado en el bucle anterior.
 *   caracteristicas .. SANAS. Las claves existen y son booleanas en los
 *                      865-866 documentos que las llevan. No hay cadenas
 *                      «true» ni variantes de nombre.
 *
 * EL FALLO DE LOS TOPES SUPERIORES, arreglado después de la auditoría: los
 * rangos hacían `Number(campo || 0)`, que convierte un campo sin rellenar en un
 * cero, y un cero satisface cualquier «hasta X». Los inmuebles sin metros
 * cargados aparecían en TODAS las búsquedas por tamaño, incluida «hasta 30 m²»:
 * 27 en el catálogo, 16 visibles en el listado por defecto. Con el precio, 3 y
 * 2. Los filtros de mínimo no estaban afectados, porque ahí el cero ya quedaba
 * fuera. Ver lib/immobili/rangos.ts.
 *
 * LAS CASILLAS QUE FALTABAN: la auditoría encontró once claves pobladas en
 * `Caratteristiche` que la interfaz no ofrecía filtrar. Se han añadido las
 * TRES que tienen volumen de verdad y son criterios que un agente pide —
 * PostoAuto (413 inmuebles en cierto), CucinaAbitabile (171) y
 * PostoAutoScoperto (103)—. Las otras ocho se quedan fuera a propósito: están
 * todas por debajo de 12 y Mansarda está en cero, así que serían casillas que
 * casi nunca devuelven nada. Si algún día se pueblan, se añaden en la lista
 * CARATTERISTICHE de más abajo y funcionan solas.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { estaEnLaPlanta, tieneElEstado } from "@/lib/immobili/clasificacion";
import { cumpleRango, precioDe, topeDe } from "@/lib/immobili/rangos";

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
  postoAuto: boolean;
  cucinaAbitabile: boolean;
  postoAutoScoperto: boolean;
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
  postoAuto: false, cucinaAbitabile: false, postoAutoScoperto: false,
  classeEnergetica: '', statoFiniture: '', provincia: '',
};

/** Siempre una copia nueva: el objeto no debe compartirse entre estados. */
export const createEmptyAdvFilters = (): AdvFilters => ({ ...EMPTY_ADV_FILTERS });

/**
 * Valor del desplegable de zona que significa «los que no tienen zona».
 *
 * Es un centinela y no un texto normal a propósito: la opción existía con el
 * valor literal «Nessuna Zona», y el filtro la comparaba por SUBCADENA contra
 * DatiBase.Zona. Como ningún inmueble tiene una zona que contenga ese texto, la
 * opción devolvía CERO resultados siempre, y los 11 inmuebles sin zona no se
 * podían encontrar por ninguna vía. Con un centinela no hay forma de que se
 * confunda con una zona real, ni siquiera si algún día alguien da de alta una
 * zona que se llame así.
 */
export const ZONA_SIN_ASIGNAR = "__sin-zona__";

/** Tipologías sin camere/bagni/superficie: al elegirlas esos filtros se limpian. */
export const NON_RESIDENTIAL_TYPES = [
  'Terreni', 'Locale o Capannone', 'Garage o Posto auto', 'Ufficio',
];

/**
 * Las casillas de caracteristicas: clave del filtro, campo del documento y
 * como se pintan.
 *
 * La etiqueta y el emoji viven AQUI, en el modulo de logica, y no en el cajon
 * de filtros, aunque sean cosa de interfaz. El motivo es el mismo por el que
 * existe este fichero: el cajon tenia su propia lista de nueve tuplas, copiada
 * a mano, y el filtrado tenia otra. Dos listas que hay que mantener en
 * sincronia son exactamente como se anade una casilla que no filtra nada, o un
 * filtro que nadie puede activar. Con una sola fuente, anadir una casilla es
 * una linea en un sitio.
 *
 * El orden es el de pintado.
 */
export const CARATTERISTICHE = [
  { clave: 'ascensore', campo: 'Ascensore', etiqueta: 'Ascensore', emoji: '🛗' },
  { clave: 'balcone', campo: 'Balcone', etiqueta: 'Balcone', emoji: '🏠' },
  { clave: 'terrazza', campo: 'Terrazza', etiqueta: 'Terrazzo', emoji: '☀️' },
  { clave: 'garage', campo: 'Garage', etiqueta: 'Garage', emoji: '🚗' },
  { clave: 'postoAuto', campo: 'PostoAuto', etiqueta: 'Posto Auto', emoji: '🅿️' },
  { clave: 'postoAutoScoperto', campo: 'PostoAutoScoperto', etiqueta: 'Posto Scoperto', emoji: '🌤️' },
  { clave: 'giardino', campo: 'Giardino', etiqueta: 'Giardino', emoji: '🌳' },
  { clave: 'cucinaAbitabile', campo: 'CucinaAbitabile', etiqueta: 'Cucina Abit.', emoji: '🍽️' },
  { clave: 'arredato', campo: 'Arredato', etiqueta: 'Arredato', emoji: '🛋️' },
  { clave: 'vistaMare', campo: 'VistaMare', etiqueta: 'Vista Mare', emoji: '🌊' },
  { clave: 'ariaCondizionata', campo: 'AriaCondizionata', etiqueta: 'Aria Cond.', emoji: '❄️' },
  { clave: 'riscaldamentoAutonomo', campo: 'RiscaldamentoAutonomo', etiqueta: 'Risc. Autonomo', emoji: '🔥' },
] as const;

/** Mapea la clave del filtro con la del documento en Caratteristiche. */
const CHARACTERISTIC_KEYS: Record<string, string> = Object.fromEntries(
  CARATTERISTICHE.map(c => [c.clave, c.campo]),
);

/** Normaliza para comparar sin acentos ni mayúsculas. */
const nfd = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function applyAdvancedFilters<T = any>(items: T[], af: AdvFilters): T[] {
  let result: any[] = items as any[];

  // Tipologia (coincidencia exacta — la BBDD está normalizada)
  if (af.tipologia) result = result.filter(d => d.DatiBase?.Tipologia === af.tipologia);

  if (af.zona === ZONA_SIN_ASIGNAR) {
    result = result.filter(d => !String(d.DatiBase?.Zona || '').trim());
  } else if (af.zona) {
    const z = nfd(af.zona);
    result = result.filter(d => nfd(d.DatiBase?.Zona || '').includes(z));
  }

  if (af.provincia) {
    const p = nfd(af.provincia);
    result = result.filter(d => nfd(d.DatiBase?.Citta || '').includes(p));
  }

  // Los rangos van por cumpleRango, que trata el dato AUSENTE como
  // desconocido en vez de como cero. Antes, `Number(campo || 0)` convertia un
  // campo sin rellenar en un cero, y un cero satisface cualquier tope
  // superior: los inmuebles sin metros cargados aparecian en TODAS las
  // busquedas «hasta X m²», incluida «hasta 30». Ver lib/immobili/rangos.ts.
  const prezzoMin = topeDe(af.prezzoMin);
  const prezzoMax = topeDe(af.prezzoMax);
  if (prezzoMin !== null || prezzoMax !== null) {
    result = result.filter(d => {
      const p = precioDe(d);
      if (p === null) return false;
      if (prezzoMin !== null && p < prezzoMin) return false;
      if (prezzoMax !== null && p > prezzoMax) return false;
      return true;
    });
  }

  // En habitaciones y banos el cero SI es una respuesta valida: un local o un
  // garaje no tienen dormitorios. Por eso van con ceroCuenta.
  const camereMin = topeDe(af.camereMin);
  if (camereMin !== null) {
    result = result.filter(d => cumpleRango(d.DettagliFisici?.CamereLetto, camereMin, null, { ceroCuenta: true }));
  }

  const bagniMin = topeDe(af.bagniMin);
  if (bagniMin !== null) {
    result = result.filter(d => cumpleRango(d.DettagliFisici?.Bagni, bagniMin, null, { ceroCuenta: true }));
  }

  // La superficie, en cambio, no puede ser cero: ahi un cero es un campo sin
  // rellenar, y son 27 inmuebles en la base.
  const superficieMin = topeDe(af.superficieMin);
  const superficieMax = topeDe(af.superficieMax);
  if (superficieMin !== null || superficieMax !== null) {
    result = result.filter(d => cumpleRango(d.DettagliFisici?.MetriCommerciali, superficieMin, superficieMax));
  }

  // Piano y StatoFiniture se comparaban con === contra un desplegable cerrado,
  // pero los dos campos se rellenan con un input de texto libre. Medido sobre
  // los 870 inmuebles reales: Piano tiene SETENTA valores distintos y el
  // desplegable ofrecia ocho, asi que el filtro solo alcanzaba a ~231 —el 27%
  // del catalogo—; el valor mas frecuente de todos, «Basso» con 341 inmuebles,
  // no estaba en la lista. StatoFiniture llegaba al 22%, entre otras cosas
  // porque el desplegable decia «Buono» y el dato dice «Buone».
  //
  // Ahora se clasifica el texto en vez de exigir que sea identico, y ademas el
  // campo es legitimamente multivalor: «Piano Terra e Primo» sale en las dos
  // plantas, que es lo que un agente espera. Ver lib/immobili/clasificacion.ts.
  if (af.piano) result = result.filter(d => estaEnLaPlanta(d.DettagliFisici?.Piano, af.piano));
  if (af.statoFiniture) result = result.filter(d => tieneElEstado(d.DettagliFisici?.StatoFiniture, af.statoFiniture));
  // ClasseEnergetica si es un vocabulario cerrado de verdad: 864 de los 870
  // dicen «G» y los demas usan una letra valida. Se queda con igualdad.
  if (af.classeEnergetica) result = result.filter(d => d.DettagliFisici?.ClasseEnergetica === af.classeEnergetica);

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
