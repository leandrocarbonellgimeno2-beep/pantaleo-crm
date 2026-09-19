/**
 * Listas de opciones de los desplegables de inmuebles.
 *
 * Estaban duplicadas entre el drawer de filtros y el formulario de edición, y
 * ya habían divergido: el drawer ofrecía "DA SCEGLIERE" y el formulario no.
 * Una sola fuente evita que se vuelvan a separar.
 */

export const TIPOLOGIE = [
  'Appartamento',
  'Casa/Villa',
  'Locale o Capannone',
  'Terreni',
  'Garage o Posto auto',
  'Edificio',
  'Ufficio',
  'Rustico',
  'Stanza',
  'Cessione Di Attivita',
  'Cantina',
  'DA SCEGLIERE',
] as const;

/**
 * OJO: estas dos listas ya NO alimentan el filtro avanzado, y no conviene
 * volver a usarlas para eso. Se escribieron como si Piano y StatoFiniture
 * fueran vocabularios cerrados, pero los dos campos se rellenan con un input
 * de texto libre: en los 870 inmuebles reales hay SETENTA valores distintos de
 * Piano, y el mas frecuente de todos —«Basso», 341 inmuebles— no esta aqui.
 * Comparar con === contra esta lista dejaba fuera al 73% del catalogo.
 *
 * Lo que usa hoy el filtro es PLANTAS y ESTADOS_ACABADO, en
 * lib/immobili/clasificacion.ts, que salen de los valores que existen de
 * verdad y clasifican el texto en vez de exigir que sea identico.
 *
 * Se conservan porque no se ha comprobado tres veces que no las use nadie mas
 * (regla de codigo muerto del proyecto), no porque sirvan.
 */
export const PIANI = [
  'Piano Terra', '1', '2', '3', '4', '5', 'Attico', 'Seminterrato',
] as const;

export const CLASSI_ENERGETICHE = [
  'A4', 'A3', 'A2', 'A1', 'A', 'B', 'C', 'D', 'E', 'F', 'G',
] as const;

export const STATI_FINITURE = [
  'Nuovo', 'Ottime', 'Buono', 'Abitabile', 'Da Ristrutturare',
] as const;
