/**
 * Identificador del documento de configuracion de Google Calendar.
 *
 * POR QUE ES UNA CONSTANTE DE SERVIDOR Y NO UN VALOR DE LA PETICION.
 * Antes salia del parametro `state` del callback OAuth, es decir, lo elegia
 * quien hiciera la llamada: podia escribir en cualquier documento de
 * calendar_configs, e incluso en subcolecciones arbitrarias metiendo barras,
 * porque no pasaba por ningun saneador.
 *
 * POR QUE SIGUE VALIENDO "default_admin" Y NO SE DERIVA DE LA SESION.
 * Hoy el CRM tiene una sola conexion de calendario: el cliente manda este
 * mismo valor codificado a mano (agenda/page.tsx:78) y es el fallback de todas
 * las rutas del servidor. El documento calendar_configs/default_admin es el
 * que esta vivo en produccion y guarda el refresh_token.
 *
 * Derivarlo de la sesion (por ejemplo del email del agente) cambiaria el id del
 * documento y dejaria huerfano ese refresh_token: la agencia veria su
 * calendario desconectado y tendria que volver a autorizar a mano. Eso es una
 * migracion encubierta, y este proyecto tiene prohibido hacerlas sin decirlo.
 *
 * El dia que haga falta calendario por agente, sera un cambio aparte y con
 * backfill explicito. Hay un detalle a tener en cuenta entonces: las citas ya
 * guardadas en produccion llevan agentName con este mismo valor y
 * deleteCalendarEvent lo lee de ahi (api/appointments/route.ts:112).
 */
export const CALENDAR_CONFIG_ID = 'default_admin';
