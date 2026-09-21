/**
 * La fecha de HOY en el reloj de la agencia, como `AAAA-MM-DD`.
 *
 * `new Date().toISOString().split('T')[0]` da la fecha en UTC, y Marsala va
 * una o dos horas por delante. Entre medianoche y las 01:00 —las 02:00 en
 * verano— para UTC todavia es AYER, asi que el panel de inicio enseñaba las
 * citas del dia anterior y daba por «de hoy» las que ya habian pasado.
 *
 * Se fija `Europe/Rome` y no la zona del dispositivo porque es la zona en la
 * que estan escritas las citas de la agenda.
 * Un movil con la zona mal puesta no debe cambiar que dia es para la agencia.
 *
 * `sv-SE` no es un capricho: es el unico locale corriente que formatea
 * exactamente como `AAAA-MM-DD`, que es como se comparan las fechas aqui.
 */
export function hoyEnLaAgencia(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}
