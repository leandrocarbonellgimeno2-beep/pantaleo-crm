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

export const PIANI = [
  'Piano Terra', '1', '2', '3', '4', '5', 'Attico', 'Seminterrato',
] as const;

export const CLASSI_ENERGETICHE = [
  'A4', 'A3', 'A2', 'A1', 'A', 'B', 'C', 'D', 'E', 'F', 'G',
] as const;

export const STATI_FINITURE = [
  'Nuovo', 'Ottime', 'Buono', 'Abitabile', 'Da Ristrutturare',
] as const;
