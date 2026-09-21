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
 * `propiedades_fotos/` NO ES UNA SUPOSICION: son 443 ficheros image/jpeg
 * contados en el bucket, que pintan las fotos de 110 inmuebles vivos. Estaba
 * fuera de esta lista porque las tres primeras formas se dedujeron de la
 * allowlist de `sanitize.ts`, que nombra `inmuebles/` y `propiedades/` — y
 * resulta que de esos dos prefijos no hay UN SOLO objeto en el bucket. El
 * unico prefijo legacy con datos reales es justo el que faltaba, y el guion
 * bajo impide que `/^propiedades\//` lo reconozca.
 *
 * Si esto se hubiera quedado como estaba, el script de revocacion habria
 * quitado el token a esas 443 fotos y habria dejado en blanco la galeria de
 * 110 inmuebles, en el CRM y en el escaparate de Idealista.
 *
 * Ninguna ruta de subida escribe hoy en estos tres prefijos legacy: es
 * historico de la migracion, y se queda publico porque solo contiene fotos.
 */
const FORMAS_PUBLICAS: RegExp[] = [
  /^immobili\/[^/]+\/foto\//,
  /^propiedades_fotos\//,
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

/**
 * La URL por la que hay que PEDIR un fichero, a partir de la que hay guardada.
 *
 * POR QUÉ NO BASTA CON ENLAZAR LO GUARDADO
 * Los documentos subidos antes del 19 de septiembre llevan guardada una URL
 * pública de Firebase con `?alt=media&token=…`. Ese token es el mecanismo de
 * «cualquiera con el enlace»: no pasa por `storage.rules`, no caduca y no lo
 * corta ni bloquear al usuario, ni degradarlo, ni cerrar su sesión. Son 320
 * folios de visita firmados y 101 contratos y planimetrías.
 *
 * Esta función traduce en el momento de pintar: si la ruta es privada, se pide
 * por el proxy autenticado; si es una foto de inmueble —que debe seguir siendo
 * pública porque Idealista la descarga sin sesión— se deja como está.
 *
 * Y es lo que hace que revocar los tokens del bucket NO rompa nada dentro del
 * CRM: para cuando se revoquen, la interfaz ya no depende de ellos. Ese es el
 * orden correcto, y al revés dejaría a la agencia sin poder abrir sus propios
 * documentos.
 *
 * NO se reescribe nada en Firestore. El campo guardado se queda como está: es
 * un dato de negocio y aquí solo se decide por dónde se pide el fichero.
 *
 * Una URL que no se sepa interpretar se devuelve tal cual. Romper un enlace que
 * hoy funciona sería peor que dejarlo pasar.
 */
export function urlDeDescarga(urlGuardada: string | null | undefined): string {
  const url = typeof urlGuardada === 'string' ? urlGuardada : '';
  if (!url) return '';

  const ruta = extraerRutaDeUrl(url);
  if (!ruta) return url;
  if (esRutaPublica(ruta)) return url;

  return urlPrivada(ruta);
}
