/**
 * Decide si una imagen puede pasar por el optimizador de Next.
 *
 * EL CONTEXTO. Las siete imagenes del CRM llevaban `unoptimized`, que anula el
 * optimizador por completo: sin AVIF, sin WebP, sin redimensionado y sin
 * srcset. La consecuencia es que en el listado una foto de camara de 2-4 MB se
 * descarga ENTERA para pintarse en una tarjeta de 300 px. Con nueve o doce
 * tarjetas, eso es el LCP de la pagina; y en movil, megas de datos del agente.
 * Los `sizes` estaban ya declarados en las siete y no servian de nada, porque
 * sin srcset no hay nada que elegir.
 *
 * POR QUE NO SE QUITA LA BANDERA A SECAS. Porque hay fuentes que el
 * optimizador NO puede tocar: las previsualizaciones de fotos recien
 * seleccionadas son URLs blob: creadas con createObjectURL, y viven solo en el
 * navegador. Pasarlas por el optimizador, que trabaja en el servidor, da un
 * error de src invalido. Lo mismo con data:.
 *
 * Asi que se optimiza todo menos eso. Ante cualquier duda, no se optimiza: es
 * preferible una imagen pesada a una imagen rota.
 */
export function esFuenteLocal(src: unknown): boolean {
  if (typeof src !== 'string' || src.length === 0) return true;
  return src.startsWith('blob:') || src.startsWith('data:');
}
