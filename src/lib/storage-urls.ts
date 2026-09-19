/**
 * Visibilidad y rutas de los ficheros de Storage.
 *
 * EL PROBLEMA. /api/upload estampaba un firebaseStorageDownloadTokens en CADA
 * fichero. Ese token va dentro de la URL y la convierte en una credencial
 * portadora: publica, sin sesion y sin caducidad, y ademas se salta las reglas
 * de storage.rules. Ahi viven contratos con CF e IBAN, documentos de identidad
 * y firmas.
 *
 * POR QUE NO SE PUEDE QUITAR PARA TODO. Idealista descarga las fotos de los
 * anuncios desde esas URLs, sin cookie y sin sesion. Si dejan de ser publicas,
 * los anuncios se quedan sin fotos. Las fotos tienen que seguir como estan.
 *
 * POR QUE NO VALE MIRAR EL PREFIJO. Es lo primero que uno intenta y no
 * funciona: immobili/ contiene las dos cosas a la vez.
 *     immobili/{Codice}/foto/...       -> foto del anuncio, publica
 *     immobili/{Codice}/documenti/...  -> planimetria, atto, privados
 * El discriminante es la FORMA COMPLETA de la ruta, y la lista es de lo que se
 * publica, no de lo que se protege: lo que no encaje es privado. Un prefijo
 * nuevo que alguien anada manana nace protegido, que es como tiene que ser.
 */

/**
 * Formas de ruta que siguen sirviendose con token publico.
 *
 * Las dos legacy no las escribe nadie en el codigo actual, asi que
 * clasificarlas de una forma u otra no cambia nada para los ficheros nuevos.
 * Se dejan como publicas porque por lo que se sabe solo contuvieron fotos.
 */
const FORMAS_PUBLICAS: RegExp[] = [
  /^immobili\/[^/]+\/foto\//,
  /^inmuebles\//,
  /^propiedades\//,
];

/** true si el fichero debe seguir siendo accesible sin sesion. */
export function esRutaPublica(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) return false;
  return FORMAS_PUBLICAS.some((re) => re.test(path));
}

/** URL interna que sirve un fichero privado exigiendo sesion. */
export function urlPrivada(path: string): string {
  return `/api/files?path=${encodeURIComponent(path)}`;
}

/**
 * Devuelve la ruta de Storage a partir de una URL guardada, sea de la forma
 * que sea.
 *
 * Esto NO es cosmetico. Hay dos sitios que borran ficheros del bucket a partir
 * de la URL guardada en Firestore: el DELETE de /api/upload y el cron de purga.
 * Los dos sabian leer unicamente la URL con token. Al aparecer una segunda
 * forma de URL, si no entienden las dos, dejan de encontrar el fichero y este
 * se queda en el bucket para siempre, pagando, sin nada que lo referencie.
 *
 * Se aceptan tres formas:
 *   /api/files?path=immobili/X/documenti/y.pdf        (nueva, privada)
 *   https://firebasestorage.googleapis.com/v0/b/B/o/<encoded>?alt=media&token=
 *   https://storage.googleapis.com/B/<path>
 */
export function extraerRutaDeUrl(url: string, bucketName?: string): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;

  // Forma nueva. Es relativa, asi que hay que darle una base para parsearla.
  if (url.startsWith('/api/files')) {
    try {
      const p = new URL(url, 'http://local').searchParams.get('path');
      return p || null;
    } catch {
      return null;
    }
  }

  try {
    const u = new URL(url);

    if (u.hostname === 'firebasestorage.googleapis.com') {
      const part = u.pathname.split('/o/')[1];
      return part ? decodeURIComponent(part.split('?')[0]) : null;
    }

    if (u.hostname === 'storage.googleapis.com') {
      const sinBucket = bucketName
        ? u.pathname.replace(`/${bucketName}/`, '')
        : u.pathname.replace(/^\/[^/]+\//, '');
      return decodeURIComponent(sinBucket.split('?')[0]) || null;
    }

    return null;
  } catch {
    return null;
  }
}
