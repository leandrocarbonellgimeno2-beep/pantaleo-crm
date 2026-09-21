/**
 * Suma minutos a una hora de pared, sin que la zona del servidor se meta.
 *
 * La fecha se interpreta como UTC A PROPOSITO. No es que la hora sea UTC: es
 * que asi la aritmetica ocurre sobre el reloj de pared tal cual, y el
 * resultado se vuelve a formatear sin offset para que Google lo interprete en
 * la zona que se le indica por separado. Usar la zona del proceso aqui es
 * justamente lo que causaba el desfase de 1-2 horas en las citas.
 *
 * Caso limite conocido y asumido: una cita que cruce el cambio de horario de
 * verano en mitad de su duracion quedaria una hora corta o larga. Son las 2 y
 * las 3 de la madrugada de dos noches al ano; no compensa complicar esto.
 */
export function sumarMinutosAHoraDePared(fecha: string, hora: string, minutos: number): string {
  // El formato se valida con expresiones regulares y NO se delega en Date.
  // El parser de fechas de V8 es sorprendentemente laxo: new Date("T:00Z")
  // devuelve el 1 de enero del ano 2000 en vez de una fecha invalida. Sin esta
  // comprobacion, una cita con la fecha vacia se creaba en el ano 2000 en
  // silencio en lugar de fallar.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) {
    throw new Error(`Data o ora non valide per l appuntamento: "${fecha}" "${hora}"`);
  }

  const base = new Date(`${fecha}T${hora}:00Z`);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Data o ora non valide per l appuntamento: "${fecha}" "${hora}"`);
  }

  const fin = new Date(base.getTime() + minutos * 60000);
  const dd = (n: number) => String(n).padStart(2, '0');
  return `${fin.getUTCFullYear()}-${dd(fin.getUTCMonth() + 1)}-${dd(fin.getUTCDate())}` +
    `T${dd(fin.getUTCHours())}:${dd(fin.getUTCMinutes())}:00`;
}

/**
 * La fecha de HOY en el reloj de la agencia, como `AAAA-MM-DD`.
 *
 * `new Date().toISOString().split('T')[0]` da la fecha en UTC, y Marsala va
 * una o dos horas por delante. Entre medianoche y las 01:00 —las 02:00 en
 * verano— para UTC todavia es AYER, asi que el panel de inicio enseñaba las
 * citas del dia anterior y daba por «de hoy» las que ya habian pasado.
 *
 * Se fija `Europe/Rome` y no la zona del dispositivo porque es la zona en la
 * que estan escritas las citas: `google-calendar.ts` ya manda ahi sus horas.
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
