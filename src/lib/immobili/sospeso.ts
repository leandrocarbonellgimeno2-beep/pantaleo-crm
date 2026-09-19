/**
 * Garantía de que GestioneCommerciale.Sospeso existe y es booleano.
 *
 * POR QUÉ ESTO ES CRÍTICO AHORA
 * El listado por defecto del CRM ya no escanea la colección: consulta
 * `where('GestioneCommerciale.Sospeso', '==', false)`. Firestore indexa por
 * campo, así que un documento **sin** ese campo —o con un valor que no sea el
 * booleano `false`— sencillamente no está en el índice y DESAPARECE de la
 * pantalla principal sin error, sin aviso y sin rastro en los logs. Un inmueble
 * invisible es, para la agencia, un inmueble perdido.
 *
 * Antes daba igual: el filtro se aplicaba en JavaScript y trataba
 * «ausente» como «activo». Ese colchón ya no existe, y por eso la regla se
 * centraliza aquí en vez de repetirse en cada ruta.
 *
 * LAS DOS REGLAS, Y POR QUÉ SON DISTINTAS
 *
 *  · Al CREAR no hay valor previo que proteger, así que el campo se rellena
 *    siempre. Lo que no se entienda cae a `false`, es decir, VISIBLE. El modo de
 *    fallo se elige a propósito: un inmueble que aparece cuando no debía se ve y
 *    se corrige en diez segundos; uno que se esconde no lo nota nadie hasta que
 *    un cliente pregunta por un anuncio que la agencia ya no encuentra.
 *
 *  · Al EDITAR sí hay valor previo, y está garantizado que es válido. Por eso
 *    un valor ininteligible NO se convierte a `false`: se descarta la clave y el
 *    valor guardado se queda como estaba. Convertirlo sería reactivar un
 *    inmueble suspendido por culpa de un payload roto, y eso es alterar un dato
 *    de negocio. Descartarlo no altera nada.
 *
 * CUALQUIER CAMINO NUEVO QUE CREE INMUEBLES —importadores, sincronización con
 * portales, seeds, migraciones— TIENE QUE PASAR POR `prepararImmobileParaCrear`.
 * Es el único sitio donde vive el valor por defecto.
 */

/** Visible. Es el valor por defecto y el modo de fallo seguro. */
export const SOSPESO_POR_DEFECTO = false;

/** La ruta del campo, en un solo sitio para que nadie la escriba a mano mal. */
export const RUTA_SOSPESO = ['GestioneCommerciale', 'Sospeso'] as const;

/**
 * Traduce a booleano lo que venga, o devuelve `undefined` si no hay forma
 * honesta de interpretarlo.
 *
 * `undefined` significa «no me consta la intención», y cada llamante decide qué
 * hacer con eso: al crear se cae al valor por defecto, al editar se deja el
 * valor guardado en paz. Es justo la distinción que evita que un payload roto
 * reactive un inmueble suspendido.
 *
 * Se aceptan las variantes de texto y numéricas porque los formularios HTML,
 * los `FormData` y los CSV de importación mandan `"true"`, `"0"` o `"si"` con
 * total normalidad, y rechazarlas obligaría a cada llamante a normalizar por su
 * cuenta — que es exactamente cómo se pierde una regla centralizada.
 */
export function interpretarSospeso(valor: unknown): boolean | undefined {
  if (typeof valor === 'boolean') return valor;

  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return undefined;
    return valor !== 0;
  }

  if (typeof valor === 'string') {
    const t = valor.trim().toLowerCase();
    if (t === 'true' || t === '1' || t === 'si' || t === 'sì' || t === 'yes' || t === 'on') return true;
    if (t === 'false' || t === '0' || t === 'no' || t === 'off') return false;
    // Cadena vacía incluida: no dice nada, así que no se inventa una intención.
    return undefined;
  }

  // null, undefined, objetos, arrays, funciones...
  return undefined;
}

type Payload = Record<string, unknown>;

/**
 * Prepara el payload de una CREACIÓN. Devuelve una copia; no muta la entrada.
 *
 * Garantiza que el resultado lleva `GestioneCommerciale.Sospeso` booleano,
 * creando el mapa `GestioneCommerciale` si hacía falta.
 */
export function prepararImmobileParaCrear<T extends Payload>(
  payload: T,
): T & { GestioneCommerciale: Record<string, unknown> } {
  const gestion = payload.GestioneCommerciale;
  const previo = esMapa(gestion) ? gestion.Sospeso : undefined;

  return {
    ...payload,
    GestioneCommerciale: {
      ...(esMapa(gestion) ? gestion : {}),
      Sospeso: interpretarSospeso(previo) ?? SOSPESO_POR_DEFECTO,
    },
  };
}

/**
 * Sanea el payload de una EDICIÓN. Devuelve una copia; no muta la entrada.
 *
 * - Valor interpretable  -> se normaliza al booleano correspondiente.
 * - Valor ininteligible  -> se descarta la clave, y el valor guardado no se toca.
 * - Clave ausente        -> no se toca nada (`buildUpdateArgs` solo escribe las
 *                           hojas que recibe, así que el campo sobrevive).
 *
 * De ahí que un PATCH no pueda borrar ni corromper el campo por ninguna vía:
 * ni mandando `null`, ni mandando un mapa vacío, ni omitiéndolo.
 */
export function sanearImmobileParaEditar<T extends Payload>(payload: T): T {
  const gestion = payload.GestioneCommerciale;

  // GestioneCommerciale presente pero NO es un mapa: una cadena, un número, un
  // booleano. Hay que descartarlo entero, y no es un caso rebuscado, es el peor
  // de todos. `buildUpdateArgs` trata cualquier cosa que no sea objeto plano
  // como una HOJA, así que emitiría `FieldPath('GestioneCommerciale') = "texto"`
  // y Firestore REEMPLAZARÍA el mapa completo: adiós Sospeso, InVendita,
  // InAffitto, PrezzoVendita y Provvigioni en una sola escritura. `sanitizeBody`
  // no lo frena porque solo mira que la clave esté permitida, nunca su tipo.
  if (Object.prototype.hasOwnProperty.call(payload, 'GestioneCommerciale') && !esMapa(gestion)) {
    const copia: Payload = { ...payload };
    delete copia.GestioneCommerciale;
    return copia as T;
  }

  if (!esMapa(gestion) || !Object.prototype.hasOwnProperty.call(gestion, 'Sospeso')) {
    return payload;
  }

  const interpretado = interpretarSospeso(gestion.Sospeso);
  const copia: Payload = { ...gestion };

  if (interpretado === undefined) {
    // Ininteligible: fuera. `buildUpdateArgs` ni siquiera verá la clave, así que
    // Firestore no recibe ninguna escritura para esta hoja.
    delete copia.Sospeso;
  } else {
    copia.Sospeso = interpretado;
  }

  return { ...payload, GestioneCommerciale: copia };
}

/**
 * Un inmueble ya guardado, ¿lo va a ver el usuario en la pantalla principal?
 * Útil para diagnósticos y para los tests: es la definición de «visible» que
 * aplica la consulta de Firestore, escrita una sola vez.
 */
export function seraVisibleEnElListado(documento: unknown): boolean {
  if (!esMapa(documento)) return false;
  const gestion = documento.GestioneCommerciale;
  if (!esMapa(gestion)) return false;
  return gestion.Sospeso === false;
}

function esMapa(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
