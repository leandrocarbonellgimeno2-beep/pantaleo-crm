/**
 * Qué decirle al agente cuando una petición falla.
 *
 * POR QUE HACE FALTA. La sesión dura ocho horas y caduca de golpe, a media
 * jornada, normalmente con un formulario largo a medio rellenar. Cuando eso
 * pasa la API responde 401, pero cinco de los seis formularios enseñaban el
 * mismo cartel que para cualquier otro fallo: «Errore durante il
 * salvataggio». El agente lo leía como un problema pasajero y volvía a pulsar
 * Salva, una y otra vez, sin que ningún intento pudiera funcionar nunca,
 * porque lo que falta es la sesión.
 *
 * Un 403 tampoco es «un error»: es que ese rol no puede hacer eso, y decirlo
 * evita que alguien insista o crea que el CRM está roto.
 *
 * Lo que esto NO hace es cerrar la sesión ni redirigir por su cuenta. Con un
 * formulario a medias, llevarse al agente a /login sin preguntar le tira el
 * trabajo: el mensaje explica qué pasa y la decisión es suya.
 */

export const MENSAJE_SESION_CADUCADA =
  'La sessione è scaduta. Apri il CRM in una nuova scheda, accedi di nuovo e torna qui: il modulo resta com\'è.';

export const MENSAJE_SIN_PERMISOS =
  'Non hai i permessi per questa operazione. Contatta l\'amministratore.';

/**
 * El mensaje que corresponde a una respuesta fallida.
 *
 * @param res      la respuesta que no salió bien
 * @param porDefecto qué decir cuando no es ni 401 ni 403
 * @param delServidor mensaje que haya mandado la API, si lo hay
 */
export function mensajeDeFallo(
  res: { status: number } | null | undefined,
  porDefecto: string,
  delServidor?: unknown,
): string {
  const estado = res?.status;

  if (estado === 401) return MENSAJE_SESION_CADUCADA;
  if (estado === 403) return MENSAJE_SIN_PERMISOS;

  // El texto del servidor solo se enseña si es un texto. Varias rutas
  // devuelven `{ error: ... }` con formas distintas, y pintar «[object
  // Object]» en pantalla es peor que el mensaje genérico.
  if (typeof delServidor === 'string' && delServidor.trim()) return delServidor.trim();

  return porDefecto;
}

/** Si el fallo es «hay que volver a entrar», y no un problema pasajero. */
export function esSesionCaducada(res: { status: number } | null | undefined): boolean {
  return res?.status === 401;
}
