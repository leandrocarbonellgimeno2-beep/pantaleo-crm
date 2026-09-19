/**
 * Clasificación de los campos de texto libre del inmueble.
 *
 * EL PROBLEMA, MEDIDO SOBRE LOS 870 INMUEBLES REALES
 * `DettagliFisici.Piano` y `DettagliFisici.StatoFiniture` se rellenan con un
 * `<input type="text">`, pero el filtro avanzado los compara con un desplegable
 * cerrado y con `===`. El resultado medido en producción:
 *
 *   Piano ......... 70 valores distintos, y el desplegable ofrece 8.
 *                   El más frecuente de todos es «Basso», con 341 inmuebles
 *                   —el 39% del catálogo— y no está en la lista. Otros 62 dicen
 *                   TERRA, Terra o terra, que tampoco casan con «Piano Terra».
 *                   Con igualdad estricta el filtro solo alcanzaba a ~231 de
 *                   870: el 73% del catálogo era invisible para ese filtro.
 *
 *   StatoFiniture . 15 valores. El desplegable dice «Buono» y el dato dice
 *                   «Buone», con 137 inmuebles. «Normali», el más frecuente con
 *                   299, no aparece en la lista. Alcance real: ~22%.
 *
 * Y no es texto sucio por descuido, es que el campo es legítimamente
 * multivalor: «Piano Terra e Primo», «1°-2°», «Terra-Primo-seminterrato». Un
 * local que ocupa la planta baja y la primera está de verdad en las dos.
 *
 * LA DECISIÓN
 * No se toca ni un dato. Se cambia la forma de comparar: en vez de exigir que
 * la cadena sea idéntica, se extraen del texto las plantas que menciona y se
 * comprueba si la buscada está entre ellas. Así «Piano Terra e Primo» aparece
 * tanto al filtrar por planta baja como al filtrar por primera, que es lo que
 * un agente espera.
 *
 * Normalizar los 870 documentos habría sido la otra salida, y se descarta a
 * propósito: reescribir datos de negocio para que encajen en un desplegable es
 * exactamente lo que no se hace. El texto original sigue viéndose tal cual en
 * la ficha; esto solo afecta a cómo se busca.
 */

/** minúsculas, sin acentos, sin espacios de sobra. */
export function normalizarTexto(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/* ────────────────────────── PLANTAS ────────────────────────── */

/**
 * Las plantas que el desplegable ofrece, en el orden en que se pintan.
 *
 * `clave` es lo que se guarda en el filtro; `etiqueta`, lo que lee el agente.
 * La lista sale de los valores que existen de verdad en la base, no de una
 * idea de cómo deberían ser: por eso están «Basso» y «Alto», que no son
 * plantas concretas sino la forma en que esta agencia describe altura, y son
 * entre las dos 351 inmuebles.
 */
export const PLANTAS = [
  { clave: 'seminterrato', etiqueta: 'Seminterrato' },
  { clave: 'terra', etiqueta: 'Piano Terra' },
  { clave: 'rialzato', etiqueta: 'Piano Rialzato' },
  { clave: 'ammezzato', etiqueta: 'Ammezzato' },
  { clave: '1', etiqueta: '1° Piano' },
  { clave: '2', etiqueta: '2° Piano' },
  { clave: '3', etiqueta: '3° Piano' },
  { clave: '4', etiqueta: '4° Piano' },
  { clave: '5', etiqueta: '5° Piano' },
  { clave: '6', etiqueta: '6° Piano' },
  { clave: 'attico', etiqueta: 'Attico' },
  { clave: 'mansarda', etiqueta: 'Mansarda' },
  { clave: 'basso', etiqueta: 'Piano Basso' },
  { clave: 'alto', etiqueta: 'Piano Alto' },
] as const;

export type ClavePlanta = (typeof PLANTAS)[number]['clave'];

/**
 * Cada planta y las formas en que aparece escrita en la base.
 *
 * Los patrones llevan `\b` a los dos lados por un motivo concreto:
 * «seminterrato» contiene «terra» como subcadena, así que sin la frontera de
 * palabra todo semisótano se colaría en el filtro de planta baja.
 */
const PATRONES: Array<{ clave: ClavePlanta; re: RegExp }> = [
  // Antes que `terra`, aunque el orden no importa porque no hay salida
  // anticipada: se listan así para que se lea el parentesco.
  { clave: 'seminterrato', re: /\b(seminterrato|semicantinato|cantinato|interrato)\b/ },
  { clave: 'rialzato', re: /\b(rialzato|sollevato)\b/ },
  { clave: 'ammezzato', re: /\b(ammezzato|mezzanino)\b/ },
  { clave: 'terra', re: /\b(terra|pt|t)\b/ },
  { clave: '1', re: /\b(1|primo|prima)\b/ },
  { clave: '2', re: /\b(2|secondo|seconda)\b/ },
  { clave: '3', re: /\b(3|terzo|terza)\b/ },
  { clave: '4', re: /\b(4|quarto|quarta)\b/ },
  { clave: '5', re: /\b(5|quinto|quinta)\b/ },
  { clave: '6', re: /\b(6|sesto|sesta)\b/ },
  { clave: 'attico', re: /\battico\b/ },
  { clave: 'mansarda', re: /\bmansarda\b/ },
  { clave: 'basso', re: /\bbasso\b/ },
  { clave: 'alto', re: /\balto\b/ },
];

/**
 * Las plantas que menciona un texto libre. Devuelve todas las que encuentre,
 * porque el campo es legítimamente multivalor.
 *
 *   'Piano Terra e Primo'  -> ['terra', '1']
 *   'Basso'                -> ['basso']
 *   '1°-2°'                -> ['1', '2']
 *   'PRIMP'                -> []          (errata: no se adivina)
 *   '-'                    -> []
 */
export function plantasDe(valor: unknown): ClavePlanta[] {
  // Los separadores se convierten en espacios para que `\b` funcione igual con
  // «1°-2°», «1,2», «1-2-3» y «Terra-Primo-seminterrato».
  const t = normalizarTexto(valor).replace(/[°.,;/\-_()]+/g, ' ');
  if (!t) return [];
  return PATRONES.filter((p) => p.re.test(t)).map((p) => p.clave);
}

/** ¿Este inmueble está en la planta buscada? */
export function estaEnLaPlanta(valorGuardado: unknown, buscada: string): boolean {
  if (!buscada) return true;
  return (plantasDe(valorGuardado) as string[]).includes(buscada);
}

/* ────────────────────── ESTADO DE LOS ACABADOS ────────────────────── */

/**
 * Los estados que se ofrecen, ordenados de mejor a peor. También salen de los
 * valores reales: «Normali» (299 inmuebles) y «Da Sistemare» (39) faltaban en
 * el desplegable, y «Buone» estaba escrito «Buono», que es lo que hacía que
 * 137 inmuebles no aparecieran nunca.
 */
export const ESTADOS_ACABADO = [
  { clave: 'nuovo', etiqueta: 'Nuovo' },
  { clave: 'ristrutturato', etiqueta: 'Ristrutturato' },
  { clave: 'ottime', etiqueta: 'Ottime' },
  { clave: 'buone', etiqueta: 'Buone' },
  { clave: 'normali', etiqueta: 'Normali' },
  { clave: 'abitabile', etiqueta: 'Abitabile' },
  { clave: 'da-sistemare', etiqueta: 'Da Sistemare' },
  { clave: 'da-ristrutturare', etiqueta: 'Da Ristrutturare' },
] as const;

export type ClaveEstado = (typeof ESTADOS_ACABADO)[number]['clave'];

const ESTADO_POR_TEXTO: Record<string, ClaveEstado> = {
  nuovo: 'nuovo',
  nuova: 'nuovo',
  ristrutturato: 'ristrutturato',
  ristrutturata: 'ristrutturato',
  rifinito: 'ottime',
  ottime: 'ottime',
  ottimo: 'ottime',
  ottima: 'ottime',
  buone: 'buone',
  buono: 'buone',
  buona: 'buone',
  normali: 'normali',
  normale: 'normali',
  abitabile: 'abitabile',
  abitabili: 'abitabile',
  'da sistemare': 'da-sistemare',
  'da ristrutturare': 'da-ristrutturare',
};

/** El estado canónico de un texto libre, o null si no dice nada útil. */
export function estadoDe(valor: unknown): ClaveEstado | null {
  const t = normalizarTexto(valor);
  if (!t || t === '-' || t.includes('non specificato')) return null;
  return ESTADO_POR_TEXTO[t] ?? null;
}

/** ¿Este inmueble tiene el estado buscado? */
export function tieneElEstado(valorGuardado: unknown, buscado: string): boolean {
  if (!buscado) return true;
  return estadoDe(valorGuardado) === buscado;
}
