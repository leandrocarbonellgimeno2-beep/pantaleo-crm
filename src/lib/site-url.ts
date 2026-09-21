/**
 * La direccion publica del CRM.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTO NO PUEDE ESTAR ESCRITO A MANO EN UNA PANTALLA
 *
 * El dominio ya cambio dos veces. Estaba escrito a mano en el generador de
 * mensajes de WhatsApp, asi que cada cambio dejaba a los clientes recibiendo
 * un enlace a un dominio que ya no existia — y nadie se entera de eso hasta
 * que un cliente lo dice.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE SE MIRAN DOS VARIABLES
 *
 * El codigo leia `NEXT_PUBLIC_SITE_URL` y en Vercel la que esta puesta es
 * `NEXT_PUBLIC_APP_URL`. No son la misma: la que leia no existia, asi que
 * SIEMPRE caia al valor escrito a mano y cambiarlo en Vercel no habria
 * servido de nada.
 *
 * Se miran las dos, empezando por la que de verdad esta configurada, y el
 * ultimo recurso es el dominio actual — para que si un dia falta la variable,
 * el enlace siga llevando a algun sitio que funcione en vez de a uno muerto.
 *
 * `NEXT_PUBLIC_` es imprescindible: esto lo usa codigo de navegador, y una
 * variable sin ese prefijo llega como `undefined` en el cliente.
 */

/** El dominio de produccion de hoy. Ultimo recurso, no la fuente. */
export const DOMINIO_POR_DEFECTO = 'https://sistema-immobiliare-pantaleo.vercel.app';

/**
 * La base de las URL publicas, sin barra final.
 *
 * Se quita la barra final porque quien llama compone `${base}/algo`: con ella
 * saldrian rutas con doble barra, que funcionan de milagro y se ven mal en un
 * mensaje a un cliente.
 */
export function urlDelSitio(): string {
  const deEntorno =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    '';

  const base = (typeof deEntorno === 'string' ? deEntorno.trim() : '') || DOMINIO_POR_DEFECTO;
  return base.replace(/\/+$/, '');
}
