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
 * Aqui vivian tambien PIANI y STATI_FINITURE. Se han borrado, y conviene
 * saber por que para no reescribirlas: daban por hecho que Piano y
 * StatoFiniture eran vocabularios cerrados, pero los dos campos se rellenan
 * con un input de texto libre. En los 870 inmuebles reales hay SETENTA
 * valores distintos de Piano, y el mas frecuente —«Basso», 341 inmuebles— no
 * estaba en la lista: comparar con === contra ella dejaba fuera al 73% del
 * catalogo.
 *
 * Lo que alimenta hoy esos dos filtros es PLANTAS y ESTADOS_ACABADO, en
 * lib/immobili/clasificacion.ts, que salen de los valores que existen de
 * verdad y clasifican el texto en vez de exigir que sea identico.
 */
export const CLASSI_ENERGETICHE = [
  'A4', 'A3', 'A2', 'A1', 'A', 'B', 'C', 'D', 'E', 'F', 'G',
] as const;
