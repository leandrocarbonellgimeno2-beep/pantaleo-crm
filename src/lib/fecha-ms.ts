/**
 * Pasar a milisegundos una fecha que puede venir de cuatro sitios distintos.
 *
 * POR QUE HACE FALTA. En esta base conviven cuatro formas del mismo dato,
 * herencia de la migracion y de las dos APIs que escriben:
 *
 *   1. `Timestamp` de Firestore serializado por la API .... { _seconds, ... }
 *   2. `Timestamp` de Firestore vivo, en el servidor ....... { seconds, toMillis() }
 *   3. cadena ISO ......................................... '2026-09-10T08:00:00Z'
 *   4. numero, ya en milisegundos ......................... 1789121171774
 *
 * Y `new Date(x).getTime()` solo entiende las dos ultimas. Con las otras dos
 * devuelve NaN, que al caer a 0 hace que TODOS los registros empaten y el
 * orden quede al azar. Eso es exactamente lo que le pasaba al listado de
 * clientes: los dados de alta esta semana aparecian en la posicion 272.
 *
 * Firestore tampoco puede arreglarlo con un `orderBy`, porque ordena primero
 * por TIPO y luego por valor: mientras convivan las cuatro formas, el orden
 * util tiene que salir de aqui.
 *
 * ESTO NO ESCRIBE NADA. Traduce al leer. Normalizar el dato guardado seria una
 * migracion sobre datos de negocio y no se hace sin permiso.
 */

/**
 * @param valor cualquiera de las cuatro formas, o nada.
 * @param siFalta que devolver cuando no hay fecha o no se entiende. Por
 *   defecto 0. Las listas que quieren mandar los registros sin fecha al final
 *   pasan -1, que nunca se confunde con una fecha real.
 */
export function aMilisegundos(valor: unknown, siFalta = 0): number {
  if (valor == null || valor === '') return siFalta;

  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : siFalta;

  if (typeof valor === 'string') {
    const ms = new Date(valor).getTime();
    return Number.isFinite(ms) ? ms : siFalta;
  }

  if (typeof valor === 'object') {
    const o = valor as Record<string, any>;

    // Primero los segundos, y solo si son un numero. Un `_seconds` que venga
    // como cadena es dato corrupto, no una fecha.
    const s = o._seconds ?? o.seconds;
    if (typeof s === 'number' && Number.isFinite(s)) {
      const nanos = o._nanoseconds ?? o.nanoseconds;
      const extra = typeof nanos === 'number' && Number.isFinite(nanos)
        ? Math.floor(nanos / 1e6)
        : 0;
      return s * 1000 + extra;
    }

    // Timestamp vivo del Admin SDK, o un Date.
    if (typeof o.toMillis === 'function') {
      const ms = o.toMillis();
      if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
    }
    if (valor instanceof Date) {
      const ms = valor.getTime();
      return Number.isFinite(ms) ? ms : siFalta;
    }
  }

  return siFalta;
}

/**
 * La primera fecha que se entienda, de varios campos candidatos.
 *
 * Los documentos de este CRM guardan la fecha de creacion con tres nombres
 * segun quien los escribiera: `dataCreazione`, `createdAt` y `DataCreazione`.
 */
export function primeraFechaMs(candidatos: unknown[], siFalta = 0): number {
  for (const c of candidatos) {
    const ms = aMilisegundos(c, NaN);
    if (Number.isFinite(ms)) return ms;
  }
  return siFalta;
}
