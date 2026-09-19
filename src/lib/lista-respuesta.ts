/**
 * Extrae la lista de una respuesta de la API, venga en la forma que venga.
 *
 * POR QUÉ EXISTE ESTO
 * Las rutas de listado del CRM no devuelven todas la misma forma, y no por
 * capricho: fueron creciendo por separado.
 *
 *   /api/clienti        ->  [ ... ]                          array pelado
 *   /api/proprietari    ->  [ ... ]                          array pelado
 *   /api/immobili?q=    ->  { data: [...], totalCount }       objeto
 *   /api/immobili       ->  { data: [...], totalCount }       objeto
 *   /api/immobili?id=   ->  { ...un documento... }            ni lo uno ni lo otro
 *
 * El resultado fue un fallo vivo y silencioso: dos de los seis typeaheads del
 * CRM hacían `Array.isArray(data) ? data : []` contra `/api/immobili?q=`. Como
 * la respuesta es un OBJETO, la comprobación era falsa SIEMPRE y el desplegable
 * se rellenaba con la lista vacía. El buscador de inmuebles de la agenda y el
 * del generador de documentos llevaban meses sin encontrar nada, pagando
 * además unas 870 lecturas de Firestore por búsqueda para tirar el resultado.
 *
 * No fallaban los otros cuatro porque apuntan a rutas que sí devuelven arrays,
 * lo cual hacía el fallo aún más difícil de ver: el mismo patrón, copiado en
 * los seis sitios, funcionaba en cuatro.
 *
 * Unificar la forma de las respuestas sería lo correcto, pero es un cambio de
 * contrato que toca a todos los consumidores a la vez. Mientras tanto, esto
 * quita el pie de la piedra: un solo sitio que entiende las dos formas, y nadie
 * más vuelve a escribir la comprobación a mano.
 */
export function listaDeRespuesta(json: unknown): any[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const data = (json as { data?: unknown }).data;
    if (Array.isArray(data)) return data;
  }
  return [];
}
