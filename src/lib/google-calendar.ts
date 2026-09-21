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
 * El título con el que el CRM ha venido creando sus eventos.
 *
 * Sirve para reconocer los eventos que subió el CRM ANTES de que existiera la
 * marca `extendedProperties`. Sin esto, la primera sincronización completa los
 * trataría como eventos ajenos y reescribiría el nombre del cliente con el
 * título del evento —«Appuntamento CRM: Mario Rossi»—, que es exactamente el
 * fallo que la auditoría encontró y que este cambio viene a cerrar.
 *
 * Es una heurística y se usa SOLO como red: en cuanto esa cita se edite una
 * vez desde el CRM, el evento recibe la marca de verdad.
 */
export const PREFIJO_TITULO_CRM = 'Appuntamento CRM:';

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

/**
 * Deja constancia de cómo fue el último intento, para el aviso de la pantalla.
 *
 * OJO CON LAS CLAVES CON PUNTO. Esto escribía `{'sync.token': …}` con
 * `set(…, {merge:true})`, y **Firestore no parte las claves por el punto en
 * `set`** — solo lo hace en `update`. El resultado era un campo llamado
 * literalmente «sync.token» en la raíz del documento, mientras `sync.token`
 * —el que se lee— no existía jamás.
 *
 * Las dos consecuencias eran graves y silenciosas: el `syncToken` no se
 * guardaba nunca, así que CADA vuelta del cron rehacía la sincronización
 * completa de doce meses; y `sync.desconectado` tampoco existía, así que el
 * aviso rojo no podía salir aunque Google rechazara las credenciales.
 *
 * Se escribe el mapa anidado, que con `merge:true` funde hoja a hoja y no
 * borra los subcampos que no vengan.
 */
async function anotarEstado(estado: {
  ok: boolean;
  motivo?: string;
  desconectado?: boolean;
  syncToken?: string | null;
}): Promise<void> {
  const ahora = Date.now();
  const sync: Record<string, unknown> = {
    ultimoIntentoAt: ahora,
    ok: estado.ok,
    motivo: estado.motivo ?? null,
    desconectado: Boolean(estado.desconectado),
  };
  if (estado.ok) sync.ultimoExitoAt = ahora;
  if (estado.syncToken !== undefined) sync.token = estado.syncToken;

  await configRef().set({ sync }, { merge: true }).catch((e) =>
    console.error('[calendario] no se pudo anotar el estado:', e),
  );
}

/** Se llama al EMPEZAR una vuelta, para que un proceso que muera deje huella. */
export async function anotarIntentoDeSync(): Promise<void> {
  await configRef()
    .set({ sync: { ultimoIntentoAt: Date.now() } }, { merge: true })
    .catch((e) => console.error('[calendario] no se pudo anotar el intento:', e));
}

/** Anota un fallo de la vuelta sin tocar el token. */
export async function anotarFalloDeSync(motivo: string): Promise<void> {
  await anotarEstado({ ok: false, motivo });
}

/**
 * Toma el turno para sincronizar, o devuelve false si ya hay otra vuelta.
 *
 * SIN ESTO SE DUPLICAN CITAS. El cron cada 15 minutos y el botón «Sincronizza»
 * llaman a la misma función, y el `disabled` del botón solo bloquea la pestaña
 * de quien lo pulsa. Dos vueltas a la vez leen el MISMO syncToken, reciben el
 * MISMO evento nuevo y lo dan de alta las dos.
 *
 * La transacción es lo que lo hace fiable: comprobar y escribir en dos pasos
 * deja justo la ventana que se quiere cerrar.
 *
 * El turno CADUCA: si una vuelta muere a medias sin soltarlo, la siguiente
 * entra pasado ese plazo en vez de quedarse el calendario colgado para
 * siempre.
 */
const TURNO_MS = 5 * 60_000;

export async function tomarTurnoDeSync(): Promise<boolean> {
  try {
    return await db.runTransaction(async (tx) => {
      const doc = await tx.get(configRef());
      const hasta = doc.data()?.sync?.enCursoHasta ?? 0;
      if (typeof hasta === 'number' && hasta > Date.now()) return false;
      tx.set(configRef(), { sync: { enCursoHasta: Date.now() + TURNO_MS } }, { merge: true });
      return true;
    });
  } catch (e: any) {
    console.error('[calendario] no se pudo tomar el turno:', e?.message);
    // Ante la duda NO se sincroniza: duplicar citas es peor que saltarse una
    // vuelta, porque el duplicado se queda.
    return false;
  }
}

export async function soltarTurnoDeSync(): Promise<void> {
  await configRef()
    .set({ sync: { enCursoHasta: 0 } }, { merge: true })
    .catch((e) => console.error('[calendario] no se pudo soltar el turno:', e));
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
export type ResultadoActualizacion =
  | { estado: 'ok'; evento: calendar_v3.Schema$Event }
  | { estado: 'no_existe' }
  | { estado: 'error'; motivo: string };

export async function updateCalendarEvent(
  googleEventId: string,
  appointment: any,
  crmAppointmentId?: string,
): Promise<ResultadoActualizacion> {
  // ──────────────────────────────────────────────────────────────────────
  // «NO EXISTE» Y «FALLÓ» NO SON LO MISMO, Y CONFUNDIRLOS DUPLICA EVENTOS.
  //
  // Esto devolvía `null` en las dos situaciones. Quien llama interpretaba
  // cualquier `null` como «lo borraron en Google» y creaba el evento otra vez.
  // Bastaba un 403 de cuota o un corte de red —con la edición ya aplicada en
  // Google— para que la agencia acabara con DOS «Appuntamento CRM: Mario
  // Rossi» a horas distintas, y el CRM se quedaba solo con el id del nuevo: el
  // viejo ya no se podía ni borrar desde aquí.
  // ──────────────────────────────────────────────────────────────────────
  try {
    const calendar = await clienteDeLaAgencia();
    if (!calendar) return { estado: 'error', motivo: 'Calendario non collegato' };

    const res = await calendar.events.update({
      calendarId: 'primary',
      eventId: googleEventId,
      requestBody: eventoDesdeCita(appointment, crmAppointmentId),
    });

    console.log('[calendario] evento actualizado: %s', googleEventId);
    return { estado: 'ok', evento: res.data };
  } catch (error: any) {
    const codigo = error?.code || error?.response?.status;
    if (codigo === 404 || codigo === 410) {
      console.log(`[calendario] el evento ${googleEventId} ya no existe en Google`);
      return { estado: 'no_existe' };
    }
    console.error('[calendario] error actualizando el evento:', error?.message);
    if (esCredencialInvalida(error)) {
      await anotarEstado({ ok: false, motivo: 'Credenziali Google non valide', desconectado: true });
    }
    return { estado: 'error', motivo: error?.message || 'Errore Google' };
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
  citaConocida?: { source?: string } | null,
): boolean {
  const marca = evento.extendedProperties?.private;

  if (marca?.origin !== ORIGEN_CRM) {
    // LEGADO. Los eventos que el CRM subió antes de que existiera la marca no
    // la llevan. Si el título es el que el CRM pone y la cita que le
    // corresponde NO nació en Google, es nuestro: dejarlo pasar reescribiría
    // el nombre del cliente con «Appuntamento CRM: …».
    //
    // Se exige que la cita ya exista y que no venga de Google: así un evento
    // que alguien titulara a mano de esa forma, y que no tuviera cita, entra
    // con normalidad.
    const pareceDelCrm = (evento.summary || '').startsWith(PREFIJO_TITULO_CRM);
    const esCitaDelCrm = Boolean(citaConocida) && citaConocida?.source !== 'google_calendar';
    return pareceDelCrm && esCitaDelCrm;
  }

  // Lo subimos nosotros pero no sabemos cuándo: por prudencia se trata como
  // eco. Crear una cita duplicada es peor que perderse una edición.
  if (!citaGoogleSyncedAt) return true;

  const tocadoEnGoogle = evento.updated ? Date.parse(evento.updated) : NaN;
  if (!Number.isFinite(tocadoEnGoogle)) return true;

  // Si Google lo tocó DESPUÉS de nuestra última subida (con margen), alguien
  // lo editó de verdad allí y eso sí tiene que bajar.
  return tocadoEnGoogle <= citaGoogleSyncedAt + MARGEN_ECO_MS;
}

/** Quita el prefijo que el propio CRM le pone al título al subir. */
export function sinPrefijoCrm(titulo: string): string {
  const t = (titulo || '').trim();
  if (!t.startsWith(PREFIJO_TITULO_CRM)) return t;
  return t.slice(PREFIJO_TITULO_CRM.length).trim();
}

/** Fecha y hora de pared en la zona de la agencia, a partir de un instante. */
function enLaAgencia(instanteMs: number): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Rome',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(instanteMs));
  // `sv-SE` formatea como «2026-09-21 10:00», que es justo lo que se guarda.
  const [fecha, hora] = partes.split(' ');
  return { fecha, hora: (hora || '00:00').slice(0, 5) };
}

/** Los campos de una cita del CRM que salen de un evento de Google. */
export function citaDesdeEvento(evento: calendar_v3.Schema$Event) {
  const esDeDiaCompleto = Boolean(evento.start?.date && !evento.start?.dateTime);

  const inicio = evento.start?.dateTime || evento.start?.date || '';
  const fin = evento.end?.dateTime || evento.end?.date || '';

  let fecha = '';
  let hora = '00:00';
  let duracion = 60;

  if (esDeDiaCompleto) {
    // Google da `end.date` EXCLUSIVO: un evento de un día va del 21 al 22.
    fecha = inicio.substring(0, 10);
  } else {
    // LA HORA NO SE RECORTA DE LA CADENA.
    //
    // `inicio.substring(11,16)` daba por hecho que el offset que manda Google
    // es siempre el de Roma, y no lo es: un evento creado con el teléfono en
    // otra zona, o una invitación de un notario o un banco, llega con el suyo.
    // Recortar los caracteres metía la cita a una hora que no era, y el
    // siguiente PATCH subía esa hora equivocada a Google.
    const ms = Date.parse(inicio);
    if (Number.isFinite(ms)) {
      const p = enLaAgencia(ms);
      fecha = p.fecha;
      hora = p.hora;
    }
    const msFin = Date.parse(fin);
    const dur = msFin - ms;
    if (Number.isFinite(dur) && dur > 0) duracion = Math.round(dur / 60000);
  }

  return {
    // El título se guarda SIN el prefijo que el propio CRM le pone al subir.
    // Sin esto, cada ida y vuelta lo acumulaba: «Appuntamento CRM: Appuntamento
    // CRM: Mario Rossi», y el nombre del cliente quedaba corrompido.
    clientName: sinPrefijoCrm(evento.summary || '') || 'Evento Google Calendar',
    propertyAddress: evento.location || '',
    date: fecha,
    time: hora,
    duration: duracion,
    /** Se pinta «Tutto il giorno» en vez de «00:00 · 1440 min». */
    allDay: esDeDiaCompleto,
    /** Último día que ocupa (inclusivo). Para los de varios días. */
    dateEnd: esDeDiaCompleto && fin
      ? new Date(Date.parse(fin) - 86_400_000).toISOString().substring(0, 10)
      : fecha,
    googleEventId: evento.id || '',
    googleEventLink: evento.htmlLink || '',
  };
}
