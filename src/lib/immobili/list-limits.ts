/**
 * Topes de la ruta de listado de inmuebles.
 *
 * Son DOS topes distintos y conviene no confundirlos:
 *  - ESCANEO: cuántos documentos se le piden a Firestore. Es lo que se paga.
 *  - SALIDA:  cuántos se devuelven al cliente. Eso es solo payload.
 *
 * La regla tiene dos trampas, las dos cubiertas por tests:
 *
 * 1. Con búsqueda de texto (`?q=`) el filtrado ocurre EN MEMORIA, después de la
 *    consulta, porque Firestore no busca subcadenas de forma nativa. Empujar el
 *    limit a la consulta recortaría ANTES de filtrar: `?q=rossi&limit=6` traería
 *    los 6 primeros por Codice y buscaría "rossi" solo entre ellos, devolviendo
 *    casi siempre nada. /api/clienti ya tuvo ese mismo bug y lo resuelve igual.
 *    Los seis typeaheads del CRM pasan `?limit=` siempre junto a `?q=`, así que
 *    caen todos en este caso.
 *
 * 2. Sin búsqueda sí se empuja, pero con colchón: `status=attivi` y el descarte
 *    de los pendientes de cancelación también se aplican en JS después de la
 *    consulta, de modo que pedir exactamente N podría devolver menos de N. Se
 *    piden 3N+10. Si aun así no llegaran, se devuelven menos resultados; nunca
 *    resultados incorrectos.
 */

/** Tope duro heredado: nadie escanea más de esto, pida lo que pida. */
export const SCAN_CAP = 1000;

export interface ListLimits {
  /** Tope de SALIDA. 0 significa que el cliente no pidió recorte. */
  limitCount: number;
  /** Tope de ESCANEO que se pasa a Firestore. */
  scanLimit: number;
}

export function resolveListLimits(limitRaw: string | null, hasQuery: boolean): ListLimits {
  const parsed = limitRaw !== null ? parseInt(limitRaw, 10) : NaN;
  // Ausente, no numérico, cero o negativo = sin recorte. Hasta ahora este valor
  // se parseaba con default 50 y no lo usaba ninguna rama; estrenarlo con ese
  // default habría dejado /immobili mostrando 50 inmuebles de 806.
  const limitCount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const scanLimit = limitCount > 0 && !hasQuery
    ? Math.min(SCAN_CAP, limitCount * 3 + 10)
    : SCAN_CAP;

  return { limitCount, scanLimit };
}
