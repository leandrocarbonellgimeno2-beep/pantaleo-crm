/**
 * Filtros numéricos de rango, con «dato ausente» tratado como DESCONOCIDO.
 *
 * EL PROBLEMA
 * Los filtros de rango hacían `Number(campo || 0)`. Eso convierte un campo sin
 * cargar en un cero, y un cero satisface cualquier tope superior: los inmuebles
 * a los que nadie les puso los metros aparecían en TODAS las búsquedas «hasta
 * X m²», incluida «hasta 30». Medido sobre producción: 27 inmuebles sin
 * superficie en el catálogo, 16 de ellos visibles en el listado por defecto,
 * ensuciando cualquier búsqueda acotada por tamaño. Con el precio pasaba lo
 * mismo, en menor escala: 3 en el catálogo, 2 visibles.
 *
 * Al revés no ocurría: con `>= min` el cero ya quedaba fuera. Por eso el
 * cambio solo altera los resultados de los filtros de MÁXIMO.
 *
 * LA REGLA
 * Un valor desconocido no satisface NINGÚN rango, ni por arriba ni por abajo.
 * «No sé cuántos metros tiene» no es «tiene cero metros», y tampoco es «vale
 * para cualquier búsqueda». Un inmueble sin metros sigue viéndose perfectamente
 * mientras no se filtre por superficie: lo único que se le pide es que no se
 * cuele en una búsqueda que no puede demostrar que cumple.
 *
 * EL CERO, Y POR QUÉ NO SIEMPRE SIGNIFICA LO MISMO
 * En superficie y precio, un cero es siempre un campo sin rellenar: no existen
 * inmuebles de cero metros ni a cero euros. En habitaciones y baños, en cambio,
 * el cero puede ser la respuesta correcta —un local comercial o un garaje no
 * tienen dormitorios—, así que ahí el cero cuenta como valor. Hoy la diferencia
 * no se nota, porque de esos dos campos solo hay filtro de mínimo y con un
 * mínimo de 1 el cero queda fuera en las dos lecturas; pero el día que alguien
 * añada un «hasta N habitaciones», la distinción importa.
 */

export interface OpcionesNumero {
  /**
   * Si un cero es un valor legítimo (habitaciones, baños) o significa que el
   * campo no se rellenó (superficie, precio). Por defecto, lo segundo.
   */
  ceroCuenta?: boolean;
}

/**
 * El valor numérico de un campo, o `null` si no se sabe.
 *
 * Acepta cadenas porque la base las tiene a montones: de los 870 inmuebles,
 * 730 guardan los metros como texto y 337 el precio de venta. Todas parsean
 * limpias —está medido, cero NaN—, pero se comprueba igualmente.
 */
export function numeroDe(valor: unknown, { ceroCuenta = false }: OpcionesNumero = {}): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string' && valor.trim() === '') return null;
  if (typeof valor === 'boolean') return null;

  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  if (n === 0 && !ceroCuenta) return null;
  return n;
}

/**
 * ¿El valor cae dentro del rango?
 *
 * `null` en un extremo significa «sin tope por ese lado». Un valor
 * desconocido devuelve false: es lo que evita que un campo vacío se cuele en
 * las búsquedas acotadas.
 *
 * Solo se llama cuando hay algún tope activo, así que un inmueble sin dato
 * nunca desaparece de una vista sin filtro de rango.
 */
export function cumpleRango(
  valor: unknown,
  min: number | null,
  max: number | null,
  opciones: OpcionesNumero = {},
): boolean {
  const n = numeroDe(valor, opciones);
  if (n === null) return false;
  if (min !== null && n < min) return false;
  if (max !== null && n > max) return false;
  return true;
}

/** Convierte el texto de un input de filtro en tope, o `null` si no lo es. */
export function topeDe(entrada: string): number | null {
  if (!entrada) return null;
  const n = Number(entrada);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * El precio de referencia de un inmueble: venta si la tiene, si no alquiler.
 *
 * Devuelve `null` cuando no consta ninguno de los dos.
 *
 * Ojo con el atajo que había antes, `PrezzoVendita || PrezzoAffitto`: la cadena
 * «0» es TRUTHY en JavaScript, así que un inmueble con la venta a «0» y un
 * alquiler real se quedaba con el cero y no llegaba a mirar el alquiler. Hoy no
 * hay ninguno así en la base —comprobado—, pero la forma correcta no cuesta más
 * y cierra la puerta.
 */
export function precioDe(doc: any): number | null {
  const venta = numeroDe(doc?.GestioneCommerciale?.PrezzoVendita);
  if (venta !== null) return venta;
  return numeroDe(doc?.GestioneCommerciale?.PrezzoAffitto);
}
