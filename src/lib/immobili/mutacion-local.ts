/**
 * Mutación local del catálogo de inmuebles, sin volver a la red.
 *
 * EL PROBLEMA QUE RESUELVE
 * Cambiar un inmueble de estado desde el menú de su tarjeta llamaba a
 * `refresh()`, que es `mutate()` a secas. Eso pone `isValidating` a true
 * dejando `isLoading` en false (por `keepPreviousData`), la pantalla lo traduce
 * a `isFilterTransitioning` y la rejilla **sustituye la lista entera por
 * esqueleto** mientras vuelve a descargar los 631 documentos activos. Marcar un
 * inmueble como suspendido costaba 631 lecturas de Firestore y un parpadeo de
 * toda la pantalla, para acabar enseñando lo mismo menos una tarjeta.
 *
 * Aquí el cambio se aplica sobre el array que ya está en memoria y no se toca
 * la red. La escritura en Firestore sigue haciéndose, claro; lo que desaparece
 * es la RELECTURA.
 *
 * LA PARTE QUE NO ES OBVIA: LA CONSISTENCIA CON EL FILTRO
 * La caché no contiene el catálogo entero, contiene **lo que pedía la vista**.
 * Con el filtro por defecto (`Attivi`) solo hay inmuebles activos. Así que
 * suspender uno no es «actualizar su campo»: es que **deja de pertenecer a la
 * lista** y hay que quitarlo. Si solo se parchea el campo, la tarjeta se queda
 * en pantalla luciendo una insignia que contradice al filtro activo, y el
 * usuario ve un «Sospeso» en la pestaña «Attivi».
 *
 * Lo mismo al revés desde la vista `Sospesi`, y lo mismo al guardar la ficha si
 * la edición cambió el estado o el tipo de operación.
 *
 * LO QUE NO SE REEVALÚA, A PROPÓSITO
 * La pertenencia por búsqueda de texto (`q=`). Decidir si un inmueble sigue
 * casando con «via roma» exige repetir la lógica del servidor en el cliente, y
 * el peor caso es benigno: una tarjeta que sigue viéndose hasta la siguiente
 * carga. Duplicar esa lógica sí tendría el riesgo de divergir en silencio, que
 * es peor.
 */

export type VistaEstado = 'Attivi' | 'Sospesi' | 'Tutti';
export type VistaTipo = 'Tutti' | 'Vendita' | 'Affitto';

export interface Vista {
  estado: VistaEstado;
  tipo: VistaTipo;
}

export interface Catalogo {
  data: any[];
  totalCount: number;
}

/**
 * ¿Este documento pertenece a la vista que hay en pantalla?
 *
 * Replica lo que hace `/api/immobili` al montar la consulta, y solo eso:
 * estado, tipo de operación y el descarte de los pendientes de cancelación.
 */
export function perteneceALaVista(doc: any, vista: Vista): boolean {
  if (!doc) return false;
  if (doc._status === 'pendente_cancellazione') return false;

  const sospeso = doc.GestioneCommerciale?.Sospeso === true;
  if (vista.estado === 'Attivi' && sospeso) return false;
  if (vista.estado === 'Sospesi' && !sospeso) return false;

  if (vista.tipo === 'Vendita' && doc.GestioneCommerciale?.InVendita !== true) return false;
  if (vista.tipo === 'Affitto' && doc.GestioneCommerciale?.InAffitto !== true) return false;

  return true;
}

/**
 * El mismo orden que impone el fetcher al recibir del servidor: código más
 * alto primero. Se repite aquí para que un documento insertado a mano no
 * aparezca en un sitio distinto al que ocuparía tras recargar.
 */
function porCodigoDescendente(a: any, b: any): number {
  return Number(b?.DatiBase?.Codice ?? 0) - Number(a?.DatiBase?.Codice ?? 0);
}

/** `totalCount` sigue al tamaño del array, nunca baja de cero. */
function conTotalAjustado(previo: Catalogo, data: any[]): Catalogo {
  const delta = data.length - previo.data.length;
  return { data, totalCount: Math.max(0, previo.totalCount + delta) };
}

/** Quita un documento del catálogo. Si no estaba, devuelve el mismo objeto. */
export function quitarDelCatalogo(catalogo: Catalogo, id: string): Catalogo {
  if (!catalogo?.data) return catalogo;
  const data = catalogo.data.filter((d) => d?.id !== id);
  if (data.length === catalogo.data.length) return catalogo;
  return conTotalAjustado(catalogo, data);
}

/**
 * Cambia el estado de suspensión de un inmueble.
 *
 * Si con el estado nuevo deja de pertenecer a la vista, se quita en vez de
 * actualizarse. El mapa `GestioneCommerciale` se copia por partes: el
 * documento de la lista viene proyectado y hay que conservarle el resto de
 * campos tal cual.
 */
export function cambiarEstadoEnCatalogo(
  catalogo: Catalogo,
  id: string,
  sospeso: boolean,
  vista: Vista,
): Catalogo {
  if (!catalogo?.data) return catalogo;

  const actual = catalogo.data.find((d) => d?.id === id);
  if (!actual) return catalogo;

  const actualizado = {
    ...actual,
    GestioneCommerciale: { ...actual.GestioneCommerciale, Sospeso: sospeso },
  };

  if (!perteneceALaVista(actualizado, vista)) return quitarDelCatalogo(catalogo, id);

  return {
    ...catalogo,
    data: catalogo.data.map((d) => (d?.id === id ? actualizado : d)),
  };
}

/**
 * Mete en el catálogo la versión nueva de un documento ya editado.
 *
 * - Si deja de pertenecer a la vista, se quita.
 * - Si ya estaba, se sustituye en su sitio (el código no cambia, así que el
 *   orden tampoco).
 * - Si no estaba y sí pertenece, se inserta y se reordena.
 *
 * Las claves del documento entrante se fusionan SOBRE las que ya había, no al
 * revés: el de la lista viene proyectado y el editado trae el documento
 * completo, pero campos derivados que solo calcula el listado —`thumbnail` e
 * `imageCount`— no viajan en el editado y se perderían al sustituirlo a pelo.
 */
export function fusionarEnCatalogo(catalogo: Catalogo, doc: any, vista: Vista): Catalogo {
  if (!catalogo?.data || !doc?.id) return catalogo;

  const indice = catalogo.data.findIndex((d) => d?.id === doc.id);
  const fusionado = indice >= 0 ? { ...catalogo.data[indice], ...doc } : doc;

  if (!perteneceALaVista(fusionado, vista)) {
    return indice >= 0 ? quitarDelCatalogo(catalogo, doc.id) : catalogo;
  }

  if (indice >= 0) {
    const data = [...catalogo.data];
    data[indice] = fusionado;
    return { ...catalogo, data };
  }

  const data = [...catalogo.data, fusionado].sort(porCodigoDescendente);
  return conTotalAjustado(catalogo, data);
}
