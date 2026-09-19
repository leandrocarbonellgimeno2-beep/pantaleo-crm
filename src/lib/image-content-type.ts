/**
 * Lista blanca de tipos de contenido para /api/proxy-image.
 *
 * El proxy sirve bytes de Firebase Storage DESDE EL PROPIO DOMINIO del CRM.
 * Hasta ahora copiaba el Content-Type del origen tal cual, asi que un fichero
 * subido a Storage como text/html se servia como HTML desde el dominio del CRM:
 * un XSS de mismo origen. Y de mismo origen es lo grave, porque la cookie de
 * sesion viaja sola en cada peticion que ese script quisiera hacer contra la
 * API, sin necesidad de llegar a leer la cookie (es httpOnly).
 *
 * image/svg+xml NO esta en la lista, y es deliberado: un SVG es un documento y
 * puede ejecutar JavaScript al abrirlo directamente. Permitirlo reabriria el
 * mismo agujero por otra puerta. La ruta de subida tampoco lo acepta.
 */
const TIPOS_PERMITIDOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

/**
 * Normaliza y valida el Content-Type del origen.
 *
 * Devuelve el tipo normalizado si esta permitido, o null si no lo esta o falta.
 * La normalizacion importa tanto como la lista: sin ella, "IMAGE/JPEG" o
 * "image/jpeg; charset=utf-8" se irian fuera por no coincidir literalmente, y
 * un origen podria colar cosas jugando con mayusculas o con parametros.
 */
export function normalizeImageContentType(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  // Se descartan los parametros ("; charset=utf-8", "; boundary=...").
  const tipo = raw.split(';')[0].trim().toLowerCase();
  if (!tipo) return null;

  return TIPOS_PERMITIDOS.has(tipo) ? tipo : null;
}
