/**
 * El calendario de Google de LA AGENCIA.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * UNA SOLA CUENTA, NO UNA POR AGENTE
 *
 * Francesco conecta su cuenta una vez y ese calendario es el de todos. El
 * refresh_token vive en `calendar_configs/default_admin`, con un id de
 * documento que es una CONSTANTE DE SERVIDOR (lib/calendar-config.ts), no algo
 * derivado de la sesión de quien pulsó «Conectar».
 *
 * Por qué sigue llamándose así y no `_integrations`: ese documento es el que
 * está vivo en producción y guarda el token. Moverlo de sitio dejaría el token
 * huérfano y la agencia tendría que volver a autorizar a mano. Es una
 * migración encubierta y en este proyecto eso no se hace en silencio. El
 * documento ya cumple lo que importa: es de la agencia, no de un usuario.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CÓMO SE EVITA EL REBOTE INFINITO
 *
 * Con sincronización en los dos sentidos hay un bucle esperando: el CRM crea
 * un evento en Google → la sincronización lo lee → crea una cita en el CRM →
 * que sube otro evento a Google → …
 *
 * Cada evento que el CRM crea lleva una marca privada:
 *
 *     extendedProperties.private = { origin: 'CRM', crmAppointmentId: '<id>' }
 *
 * Al importar, un evento con esa marca NO crea nada: ya sabemos de qué cita
 * es. Y solo se aplica al CRM si Google dice que se tocó DESPUÉS de la última
 * vez que nosotros lo subimos (`googleSyncedAt` en la cita). Así:
 *
 *   - el eco de nuestra propia escritura se ignora  → no hay bucle
 *   - una edición hecha de verdad en Google         → sí baja
 *
 * Una marca de «ignorar siempre lo que tenga origin=CRM» habría roto lo
 * segundo, que es justo lo que Francesco va a hacer desde el móvil.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SINCRONIZACIÓN INCREMENTAL CON syncToken
 *
 * Google devuelve un `nextSyncToken` al terminar de listar. En la vuelta
 * siguiente solo manda lo que cambió desde entonces, borrados incluidos
 * (`status: 'cancelled'`). Es lo que hace que un cron cada 15 minutos sea
 * barato y no vuelva a leer el calendario entero.
 *
 * Con `syncToken` NO se pueden mandar `timeMin`, `timeMax`, `orderBy` ni `q`:
 * Google los rechaza. La ventana se fija en la sincronización completa inicial
 * y se hereda. Si el token caduca, Google responde 410 y hay que rehacer la
 * completa; eso está contemplado abajo.
 *
 * No se usan webhooks a propósito: exigen verificar el dominio en Search
 * Console y, sin eso, fallan. El cron no depende de nada externo.
 */
import { google, type calendar_v3 } from 'googleapis';
import { db, admin } from './firebase-admin';
import { sumarMinutosAHoraDePared } from './wall-clock';
import { CALENDAR_CONFIG_ID } from './calendar-config';

/** Marca que distingue lo que subió el CRM de lo que nació en Google. */
export const ORIGEN_CRM = 'CRM';

/**
 * Margen para decidir si un evento es nuestro propio eco.
 *
 * Entre que mandamos el evento y que Google sella su `updated` pasan unos
 * milisegundos, y los relojes no son el mismo. Sin margen, nuestro eco
 * parecería una edición ajena y volvería a bajar; con un margen demasiado
 * grande, una edición real hecha en Google justo después se perdería. Un
 * minuto cubre la deriva sin tragarse nada que una persona pueda teclear.
 */
const MARGEN_ECO_MS = 60_000;

/** La ventana de la primera sincronización. Sin tope superior: el futuro entra. */
const DESDE_HACE_MESES = 12;

export interface ResultadoSync {
  ok: boolean;
  motivo?: string;
  /** true si Google rechazó las credenciales: hay que volver a conectar. */
  desconectado?: boolean;
}

function configRef() {
  return db.collection('calendar_configs').doc(CALENDAR_CONFIG_ID);
}

/**
 * Si el error dice que las credenciales ya no valen.
 *
 * Es lo que distingue «Google está caído un momento» de «alguien revocó el
 * acceso o caducó el refresh_token». Solo lo segundo justifica pintarle a la
 * agencia un aviso rojo pidiendo reconectar.
 */
function esCredencialInvalida(error: any): boolean {
  const codigo = error?.code ?? error?.response?.status;
  const texto = String(
    error?.response?.data?.error || error?.message || '',
  ).toLowerCase();
  return (
    texto.includes('invalid_grant') ||
    texto.includes('invalid_token') ||
    texto.includes('token has been expired or revoked') ||
    codigo === 401
  );
}

/**
 * El cliente autenticado de la agencia, o null si no hay conexión.
 *
 * Los tres sitios que hablaban con Google repetían este bloque —leer el
 * documento, montar el OAuth2, enganchar el refresco— con pequeñas
 * diferencias. Ahora es uno.
 */
async function clienteDeLaAgencia(): Promise<calendar_v3.Calendar | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error('[calendario] faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI');
    return null;
  }

  const doc = await configRef().get();
  const tokens = doc.exists ? doc.data()?.tokens : null;
  if (!tokens?.refresh_token) {
    console.log('[calendario] la agencia no tiene el calendario conectado');
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials(tokens);

  // Google solo manda un refresh_token nuevo de vez en cuando. Fusionar en
  // lugar de reemplazar evita quedarse sin él por una respuesta que solo
  // traía el access_token.
  oauth2Client.on('tokens', (nuevos) => {
    configRef()
      .set({ tokens: { ...tokens, ...nuevos } }, { merge: true })
      .catch((e) => console.error('[calendario] no se pudo guardar el token renovado:', e));
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/** Deja constancia de cómo fue el último intento, para el aviso de la pantalla. */
async function anotarEstado(estado: {
  ok: boolean;
  motivo?: string;
  desconectado?: boolean;
  syncToken?: string | null;
}): Promise<void> {
  const parche: Record<string, unknown> = {
    'sync.ultimoIntentoAt': Date.now(),
    'sync.ok': estado.ok,
    'sync.motivo': estado.motivo ?? null,
    'sync.desconectado': Boolean(estado.desconectado),
  };
  if (estado.ok) parche['sync.ultimoExitoAt'] = Date.now();
  if (estado.syncToken !== undefined) parche['sync.token'] = estado.syncToken;

  await configRef().set(parche, { merge: true }).catch((e) =>
    console.error('[calendario] no se pudo anotar el estado:', e),
  );
}

/** El cuerpo del evento de Google que corresponde a una cita del CRM. */
function eventoDesdeCita(appointment: any, crmAppointmentId?: string): calendar_v3.Schema$Event {
  const duracion = appointment.duration || 60;

  // EL DESFASE DE 1-2 HORAS ESTABA AQUI.
  //
  // Una cadena ISO SIN indicador de zona se interpreta como hora LOCAL DEL
  // PROCESO, y Vercel va en UTC. Y al mandar un dateTime terminado en "Z",
  // Google IGNORA el campo timeZone de al lado, porque la cadena ya lleva su
  // offset. Por eso el desfase seguía al horario de verano y una constante de
  // corrección habría acertado medio año.
  //
  // Se manda la hora de pared sin offset y se deja que Google la interprete en
  // Europe/Rome, que es para lo que existe timeZone.
  const inicio = `${appointment.date}T${appointment.time}:00`;
  const fin = sumarMinutosAHoraDePared(appointment.date, appointment.time, duracion);

  return {
    summary: `Appuntamento CRM: ${appointment.clientName || 'Cliente'}`,
    location: appointment.propertyAddress || '',
    description:
      `Agente: ${appointment.agentName || 'CRM'}\n` +
      `Immobile: ${appointment.propertyAddress || 'N/D'}\n` +
      `Telefono: ${appointment.clientPhone || 'N/D'}`,
    start: { dateTime: inicio, timeZone: 'Europe/Rome' },
    end: { dateTime: fin, timeZone: 'Europe/Rome' },
    // La marca que corta el rebote. `private` y no `shared`: no tiene por qué
    // verla nadie más que nosotros.
    extendedProperties: {
      private: {
        origin: ORIGEN_CRM,
        ...(crmAppointmentId ? { crmAppointmentId } : {}),
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 60 },
      ],
    },
  };
}

/** Crea el evento en Google. Devuelve el evento, o null si no se pudo. */
export async function createCalendarEvent(
  appointment: any,
  crmAppointmentId?: string,
): Promise<calendar_v3.Schema$Event | null> {
  try {
    const calendar = await clienteDeLaAgencia();
    if (!calendar) return null;

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventoDesdeCita(appointment, crmAppointmentId),
    });

    console.log('[calendario] evento creado: %s', res.data.htmlLink);
    return res.data;
  } catch (error: any) {
    console.error('[calendario] error creando el evento:', error?.message);
    if (esCredencialInvalida(error)) {
      await anotarEstado({ ok: false, motivo: 'Credenziali Google non valide', desconectado: true });
    }
    return null;
  }
}

/**
 * Actualiza en Google un evento que ya existe.
 *
 * Esto NO existía: editar una cita en el CRM no tocaba Google, así que el
 * calendario compartido se quedaba con la hora vieja y nadie se enteraba.
 */
export async function updateCalendarEvent(
  googleEventId: string,
  appointment: any,
  crmAppointmentId?: string,
): Promise<calendar_v3.Schema$Event | null> {
  try {
    const calendar = await clienteDeLaAgencia();
    if (!calendar) return null;

    const res = await calendar.events.update({
      calendarId: 'primary',
      eventId: googleEventId,
      requestBody: eventoDesdeCita(appointment, crmAppointmentId),
    });

    console.log('[calendario] evento actualizado: %s', googleEventId);
    return res.data;
  } catch (error: any) {
    const codigo = error?.code || error?.response?.status;
    // Si el evento ya no está en Google, no es un fallo de la edición: lo que
    // hay que hacer es crearlo de nuevo, y de eso se encarga quien llama.
    if (codigo === 404 || codigo === 410) {
      console.log(`[calendario] el evento ${googleEventId} ya no existe en Google`);
      return null;
    }
    console.error('[calendario] error actualizando el evento:', error?.message);
    if (esCredencialInvalida(error)) {
      await anotarEstado({ ok: false, motivo: 'Credenziali Google non valide', desconectado: true });
    }
    return null;
  }
}

/** Borra el evento de Google. true si al terminar no existe. */
export async function deleteCalendarEvent(googleEventId: string): Promise<boolean> {
  try {
    const calendar = await clienteDeLaAgencia();
    if (!calendar) return false;

    await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
    console.log('[calendario] evento borrado: %s', googleEventId);
    return true;
  } catch (error: any) {
    // Un evento que ya no está (410 Gone / 404) no es un fallo: el objetivo
    // era que no existiera, y así es.
    const codigo = error?.code || error?.response?.status;
    if (codigo === 404 || codigo === 410) {
      console.log(`[calendario] el evento ${googleEventId} ya estaba borrado (${codigo})`);
      return true;
    }
    console.error('[calendario] error borrando el evento:', error?.message);
    if (esCredencialInvalida(error)) {
      await anotarEstado({ ok: false, motivo: 'Credenziali Google non valide', desconectado: true });
    }
    return false;
  }
}

export interface CambiosDeGoogle {
  eventos: calendar_v3.Schema$Event[];
  /** El token para la próxima vuelta. Se guarda solo si todo fue bien. */
  proximoSyncToken: string | null;
  /** true si hubo que rehacer la sincronización completa. */
  fueCompleta: boolean;
}

/**
 * Trae de Google lo que cambió desde la última vuelta.
 *
 * Sin `syncToken` guardado hace la sincronización completa —de un año atrás en
 * adelante, SIN tope superior, para que las citas futuras entren; el código
 * anterior ponía `timeMax = ahora` y por eso no importaba ni una— y se queda
 * con el token que Google devuelve al final.
 */
export async function traerCambiosDeGoogle(): Promise<CambiosDeGoogle | null> {
  const calendar = await clienteDeLaAgencia();
  if (!calendar) {
    await anotarEstado({ ok: false, motivo: 'Calendario non collegato', desconectado: true });
    return null;
  }

  const doc = await configRef().get();
  const tokenGuardado: string | null = doc.data()?.sync?.token ?? null;

  const recorrer = async (usarToken: string | null): Promise<CambiosDeGoogle> => {
    const eventos: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    let proximoSyncToken: string | null = null;

    do {
      // Con syncToken, Google RECHAZA timeMin/timeMax/orderBy/q. Por eso los
      // parámetros de la ventana solo van en la completa.
      const parametros: calendar_v3.Params$Resource$Events$List = usarToken
        ? { calendarId: 'primary', syncToken: usarToken, singleEvents: true, showDeleted: true, maxResults: 250, pageToken }
        : {
            calendarId: 'primary',
            timeMin: new Date(Date.now() - DESDE_HACE_MESES * 30 * 24 * 3600_000).toISOString(),
            singleEvents: true,
            showDeleted: true,
            maxResults: 250,
            pageToken,
          };

      const res = await calendar.events.list(parametros);
      eventos.push(...(res.data.items || []));
      pageToken = res.data.nextPageToken ?? undefined;
      // Google solo manda nextSyncToken en la ÚLTIMA página.
      if (res.data.nextSyncToken) proximoSyncToken = res.data.nextSyncToken;
    } while (pageToken);

    return { eventos, proximoSyncToken, fueCompleta: !usarToken };
  };

  try {
    return await recorrer(tokenGuardado);
  } catch (error: any) {
    const codigo = error?.code || error?.response?.status;

    // 410 GONE: el token caducó. No es un error que haya que enseñar a nadie,
    // es la forma que tiene Google de decir «empieza otra vez».
    if (codigo === 410 && tokenGuardado) {
      console.log('[calendario] syncToken caducado, se rehace la sincronizacion completa');
      try {
        return await recorrer(null);
      } catch (e2: any) {
        console.error('[calendario] fallo la sincronizacion completa:', e2?.message);
        await anotarEstado({
          ok: false,
          motivo: e2?.message || 'Errore nella sincronizzazione',
          desconectado: esCredencialInvalida(e2),
        });
        return null;
      }
    }

    console.error('[calendario] error trayendo cambios:', error?.message);
    await anotarEstado({
      ok: false,
      motivo: error?.message || 'Errore nella sincronizzazione',
      desconectado: esCredencialInvalida(error),
    });
    return null;
  }
}

/** Guarda el token de la próxima vuelta y marca la sincronización como buena. */
export async function guardarSyncOk(proximoSyncToken: string | null): Promise<void> {
  await anotarEstado({ ok: true, syncToken: proximoSyncToken });
}

/**
 * Si un evento de Google es el eco de algo que subimos nosotros.
 *
 * Se exporta para poder probarlo: es la pieza que corta el bucle y una
 * regresión aquí no se vería hasta que el calendario empezara a rebotar.
 */
export function esEcoDelCrm(
  evento: calendar_v3.Schema$Event,
  citaGoogleSyncedAt: number | null | undefined,
): boolean {
  const marca = evento.extendedProperties?.private;
  if (marca?.origin !== ORIGEN_CRM) return false;

  // Lo subimos nosotros pero no sabemos cuándo: por prudencia se trata como
  // eco. Crear una cita duplicada es peor que perderse una edición.
  if (!citaGoogleSyncedAt) return true;

  const tocadoEnGoogle = evento.updated ? Date.parse(evento.updated) : NaN;
  if (!Number.isFinite(tocadoEnGoogle)) return true;

  // Si Google lo tocó DESPUÉS de nuestra última subida (con margen), alguien
  // lo editó de verdad allí y eso sí tiene que bajar.
  return tocadoEnGoogle <= citaGoogleSyncedAt + MARGEN_ECO_MS;
}

/** Los campos de una cita del CRM que salen de un evento de Google. */
export function citaDesdeEvento(evento: calendar_v3.Schema$Event) {
  const inicio = evento.start?.dateTime || evento.start?.date || '';
  const fin = evento.end?.dateTime || evento.end?.date || '';

  const fecha = inicio ? inicio.substring(0, 10) : '';
  const hora = inicio.length > 10 ? inicio.substring(11, 16) : '00:00';

  const ms = Date.parse(fin) - Date.parse(inicio);
  const duracion = Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : 60;

  return {
    clientName: evento.summary || 'Evento Google Calendar',
    propertyAddress: evento.location || '',
    date: fecha,
    time: hora,
    duration: duracion,
    googleEventId: evento.id || '',
    googleEventLink: evento.htmlLink || '',
  };
}
