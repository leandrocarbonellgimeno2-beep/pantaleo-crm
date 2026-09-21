/**
 * Las opciones que ofrece el formulario de alta y edición de un inmueble.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE ESTE FICHERO
 *
 * El formulario escribía sus opciones a mano en el JSX, y el buscador y el
 * matching usan otras constantes. Las dos listas llevaban tiempo separándose,
 * y cada hueco se traduce en inmuebles que nacen con un valor que después
 * nadie encuentra:
 *
 *   - `Stato Finiture`: el formulario ofrecía 5 valores y el buscador reconoce
 *     8. No se podía marcar «Normali» —que son 299 inmuebles—, ni
 *     «Ristrutturato», ni «Da Sistemare». Y escribía «Buono» donde el canon es
 *     «Buone».
 *   - `Piano`: era un campo de texto libre. De ahí salen los ~70 valores
 *     distintos que el buscador tiene que adivinar con expresiones regulares.
 *   - `Classe Energetica`: el formulario no ofrecía «A». Un inmueble que la
 *     tuviera la PERDÍA al guardar la ficha.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA REGLA QUE MANDA AQUÍ: NUNCA PERDER UN VALOR GUARDADO
 *
 * Alinear los desplegables tiene un peligro que no es obvio. Si un inmueble
 * tiene guardado un valor que la lista nueva no contempla, un `<select>` lo
 * pinta como «sin selección» y el primer guardado lo sustituye. Eso es alterar
 * un dato de negocio, y está prohibido.
 *
 * Por eso ninguna lista de aquí se usa cruda: se pasa por `conValorActual`,
 * que añade el valor que el inmueble ya tiene si no estaba. Abrir una ficha y
 * guardarla sin tocar ese campo la deja exactamente igual.
 *
 * Y por eso `Piano` es una lista de sugerencias (`<datalist>`) y no un
 * `<select>`: hay 70 formas distintas escritas en la base y convertirlo en una
 * lista cerrada obligaría a reescribirlas.
 *
 * Esto solo cambia lo que se puede ELEGIR de aquí en adelante. No toca ni un
 * dato guardado.
 */
import { PLANTAS, ESTADOS_ACABADO } from '@/lib/immobili/clasificacion';
import { TIPOLOGIE, CLASSI_ENERGETICHE } from '@/lib/immobili/options';

/** Las tipologías canónicas, las mismas que filtra el buscador. */
export const OPCIONES_TIPOLOGIA: readonly string[] = TIPOLOGIE;

/**
 * Los 8 estados que el buscador reconoce, no los 5 que ofrecía el formulario.
 *
 * Se usan las ETIQUETAS y no las claves internas porque es lo que se guarda en
 * `DettagliFisici.StatoFiniture` y lo que el resto del CRM lee. `estadoDe()`
 * las normaliza de vuelta a la clave al buscar.
 */
export const OPCIONES_STATO_FINITURE: readonly string[] = ESTADOS_ACABADO.map((e) => e.etiqueta);

/**
 * Las 14 formas de planta que el buscador entiende, como SUGERENCIAS.
 *
 * Incluye «Piano Basso» y «Piano Alto», que no son plantas concretas sino
 * cómo describe la altura esta agencia, y son entre las dos 351 inmuebles.
 */
export const SUGERENCIAS_PIANO: readonly string[] = PLANTAS.map((p) => p.etiqueta);

/** Las clases energéticas completas. La lista del formulario se dejaba «A». */
export const OPCIONES_CLASSE_ENERGETICA: readonly string[] = CLASSI_ENERGETICHE;

/**
 * La lista de opciones que hay que pintar, garantizando que el valor guardado
 * sigue estando.
 *
 * Si el inmueble tiene un valor que la lista canónica no contempla —un dato
 * heredado, una tipología que ya no se usa—, se añade al final en vez de
 * desaparecer. Devolverlo es lo que impide que abrir y guardar una ficha
 * cambie un campo que nadie tocó.
 */
export function conValorActual(
  opciones: readonly string[],
  valorActual: unknown,
): string[] {
  const lista = [...opciones];
  const actual = typeof valorActual === 'string' ? valorActual.trim() : '';
  if (!actual) return lista;

  // Comparación laxa para no duplicar por un acento o una mayúscula, pero se
  // conserva la forma EXACTA que está guardada.
  const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (lista.some((o) => normal(o) === normal(actual))) return lista;

  lista.push(actual);
  return lista;
}
