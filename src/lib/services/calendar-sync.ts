/**
 * Baja a Firestore lo que cambió en el calendario de Google.
 *
 * Vive en un servicio y no en la ruta porque lo usan dos sitios: el cron cada
 * 15 minutos y el botón «Sincronizza» de la agenda. Que sean el mismo código
 * es lo que evita que uno de los dos se quede con una versión vieja de las
 * reglas de rebote, que es donde un fallo sería invisible.
 *
 * QUÉ HACE CON CADA EVENTO
 *
 *   marca origin=CRM y es nuestro eco ....... no toca nada
 *   marca origin=CRM y lo editaron en Google  actualiza la cita del CRM
 *   sin marca, y ya lo importamos ........... actualiza esa cita
 *   sin marca, nuevo ........................ crea una cita HUÉRFANA
 *   cancelado en Google ..................... marca la cita como anulada
 *
 * LAS CITAS HUÉRFANAS son las que Francesco crea desde el móvil: no tienen
 * cliente ni inmueble del CRM y no los van a tener nunca. Se guardan con
 * `source: 'google_calendar'` y con el nombre del evento como `clientName`,
 * que es lo que la agenda ya pinta. No se les inventa un `clienteId` ni se
 * busca a nadie por nombre: un id inventado ataría una cita al cliente
 * equivocado, y la agenda solo necesita el título y la hora para bloquear el
 * hueco.
 */
import { db, admin } from '@/lib/firebase-admin';
import {
  traerCambiosDeGoogle,
  guardarSyncOk,
  esEcoDelCrm,
  citaDesdeEvento,
  tomarTurnoDeSync,
  soltarTurnoDeSync,
  anotarIntentoDeSync,
  anotarFalloDeSync,
  ORIGEN_CRM,
} from '@/lib/google-calendar';

/**
 * El id del documento de una cita importada de Google.
 *
 * Derivarlo del id del evento es lo que hace la importación IDEMPOTENTE: dos
 * vueltas que procesen el mismo evento escriben el MISMO documento en vez de
 * crear dos. Con un id automático, dos vueltas simultáneas dejaban dos citas
 * idénticas, y solo una de las dos volvía a recibir actualizaciones nunca más
 * —la otra se quedaba en la agenda para siempre, sin poder anularse—.
 *
 * Los ids de Google son `[a-v0-9_]+`, válidos como id de documento, pero se
 * prefija para que nunca puedan chocar con un id automático de Firestore.
 */
export function idDeCitaDeGoogle(googleEventId: string): string {
  return 'gcal_' + googleEventId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 480);
}

export interface ResumenSync {
  ok: boolean;
  motivo?: string;
  traidos: number;
  creados: number;
  actualizados: number;
  anulados: number;
  ecosIgnorados: number;
  saltados: number;
  fueCompleta: boolean;
}

const VACIO: ResumenSync = {
  ok: false, traidos: 0, creados: 0, actualizados: 0,
  anulados: 0, ecosIgnorados: 0, saltados: 0, fueCompleta: false,
};

export async function sincronizarDesdeGoogle(): Promise<ResumenSync> {
  // UN TURNO A LA VEZ. El cron y el botón llaman a esta misma función, y sin
  // esto dos vueltas simultáneas leen el mismo syncToken, reciben el mismo
  // evento nuevo y lo dan de alta LAS DOS.
  if (!(await tomarTurnoDeSync())) {
    return { ...VACIO, motivo: 'Sincronizzazione già in corso' };
  }

  try {
    return await hacerLaVuelta();
  } catch (e: any) {
    // Sin esto, un fallo del batch subía sin dejar rastro y el estado se
    // quedaba con el del último intento que SÍ llegó al final, que podía ser
    // de semanas atrás: el cron muerto se veía sano desde la pantalla.
    console.error('[calendar-sync] la vuelta fallo:', e?.message);
    await anotarFalloDeSync(e?.message || 'Errore durante la sincronizzazione');
    return { ...VACIO, motivo: e?.message || 'Errore durante la sincronizzazione' };
  } finally {
    await soltarTurnoDeSync();
  }
}

async function hacerLaVuelta(): Promise<ResumenSync> {
  // Se anota ANTES de empezar: un proceso que muera por timeout tiene que
  // dejar huella igualmente.
  await anotarIntentoDeSync();

  const cambios = await traerCambiosDeGoogle();
  if (!cambios) {
    return { ...VACIO, motivo: 'Calendario non collegato o errore Google' };
  }

  const { eventos, proximoSyncToken, fueCompleta } = cambios;

  // Las citas que ya conocemos, buscando SOLO los ids que trae el delta.
  //
  // Antes se leía la colección entera con `where('googleEventId','!=','')` en
  // cada vuelta, incluso cuando el delta venía vacío —que es el 95 % de las
  // veces—. Con el cron cada 15 minutos eso son 96 recorridos diarios de toda
  // la colección para no hacer nada.
  //
  // El id del documento de una cita importada se deriva del id del evento
  // (ver `idDeCitaDeGoogle`), así que basta con pedir esos documentos. Las
  // citas que el CRM subió a Google conservan su id automático, y esas se
  // buscan aparte, por lotes de 30, que es el tope de `in`.
  const conocidas = new Map<string, { ref: FirebaseFirestore.DocumentReference; datos: any }>();
  const idsDeEventos = eventos.map((e) => e.id).filter((x): x is string => Boolean(x));

  if (idsDeEventos.length > 0) {
    const refs = idsDeEventos.map((gid) => db.collection('appointments').doc(idDeCitaDeGoogle(gid)));
    const docs = await db.getAll(...refs);
    for (const d of docs) {
      if (d.exists) conocidas.set(d.data()!.googleEventId, { ref: d.ref, datos: d.data() });
    }

    for (let i = 0; i < idsDeEventos.length; i += 30) {
      const lote = idsDeEventos.slice(i, i + 30).filter((gid) => !conocidas.has(gid));
      if (lote.length === 0) continue;
      const snap = await db
        .collection('appointments')
        .where('googleEventId', 'in', lote)
        .select('googleEventId', 'googleSyncedAt', 'source')
        .get();
      for (const d of snap.docs) {
        const gid = d.data().googleEventId;
        if (gid && !conocidas.has(gid)) conocidas.set(gid, { ref: d.ref, datos: d.data() });
      }
    }
  }

  let creados = 0;
  let actualizados = 0;
  let anulados = 0;
  let ecosIgnorados = 0;
  let saltados = 0;

  // De 400 en 400: es el tope de escrituras de un batch de Firestore.
  for (let i = 0; i < eventos.length; i += 400) {
    const trozo = eventos.slice(i, i + 400);
    const batch = db.batch();
    let escrituras = 0;

    for (const evento of trozo) {
      if (!evento.id) { saltados++; continue; }

      const conocida = conocidas.get(evento.id);

      // ── Cancelado en Google ────────────────────────────────────────────
      if (evento.status === 'cancelled') {
        if (conocida) {
          // No se borra la cita: se marca. Borrarla dejaría al agente sin
          // saber que aquello existió, y el borrado en Google puede ser un
          // error de quien lo hizo.
          batch.update(conocida.ref, {
            status: 'Annullato',
            googleCancelledAt: Date.now(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          escrituras++;
          anulados++;
        } else {
          saltados++;
        }
        continue;
      }

      // ── Eco de nuestra propia escritura ────────────────────────────────
      if (esEcoDelCrm(evento, conocida?.datos?.googleSyncedAt, conocida?.datos)) {
        ecosIgnorados++;
        continue;
      }

      // El calendario de la agencia es el personal de quien lo conectó, así
      // que ahí hay visitas médicas y asuntos de familia. Lo marcado como
      // privado NO se copia a Firestore, donde lo vería cualquier agente.
      if (evento.visibility === 'private') { saltados++; continue; }

      const campos = citaDesdeEvento(evento);
      if (!campos.date) { saltados++; continue; }

      if (conocida) {
        // ──────────────────────────────────────────────────────────────
        // QUÉ CAMPOS POSEE GOOGLE Y CUÁLES NO.
        //
        // Aplicar `...campos` entero sobre una cita nacida en el CRM le
        // escribía el `clientName` con el título del evento. Y como al subir
        // el título es «Appuntamento CRM: <cliente>», el nombre del cliente
        // pasaba a ser «Appuntamento CRM: Mario Rossi» — y a la vuelta
        // siguiente «Appuntamento CRM: Appuntamento CRM: Mario Rossi». El
        // prefijo se acumulaba en un campo de negocio en cada ida y vuelta.
        //
        // De una cita del CRM, Google solo manda CUÁNDO es. El nombre del
        // cliente, la dirección del inmueble, el teléfono y las notas son del
        // CRM, y Google no sabe nada de ellos.
        const nacioEnGoogle = conocida.datos?.source === 'google_calendar';

        const deGoogle = nacioEnGoogle
          ? campos
          : {
              date: campos.date,
              time: campos.time,
              duration: campos.duration,
              allDay: campos.allDay,
              dateEnd: campos.dateEnd,
              googleEventLink: campos.googleEventLink,
            };

        batch.update(conocida.ref, {
          ...deGoogle,
          googleSyncedAt: Date.now(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        escrituras++;
        actualizados++;
        continue;
      }

      // ── Nace en Google: cita huérfana ──────────────────────────────────
      //
      // Si llega aquí con marca de CRM es que la cita original ya no está en
      // Firestore. Se importa igual, como cualquier evento de Google: el hueco
      // del calendario existe y hay que bloquearlo.
      // Id DERIVADO del evento, no automático: dos vueltas simultáneas
      // escriben el mismo documento en vez de crear dos citas idénticas.
      const nueva = db.collection('appointments').doc(idDeCitaDeGoogle(evento.id));
      // Y se apunta en `conocidas` para que un mismo evento repetido dentro
      // del propio delta —posible si la lista cambia mientras se pagina— no
      // se dé de alta dos veces en la misma vuelta.
      conocidas.set(evento.id, { ref: nueva, datos: { source: 'google_calendar' } });
      batch.set(nueva, {
        ...campos,
        status: 'Confermato',
        tipo: 'Altro',
        clientPhone: '',
        notes: '',
        agentName: 'Google Calendar',
        // La marca de que esto NO nació en el CRM. La agenda la usa para no
        // prometer una ficha de cliente que no existe.
        source: 'google_calendar',
        origenExterno: evento.extendedProperties?.private?.origin === ORIGEN_CRM ? 'crm-huerfano' : 'google',
        googleSyncedAt: Date.now(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      escrituras++;
      creados++;
    }

    if (escrituras > 0) await batch.commit();
  }

  // El token SOLO se guarda si todo el recorrido terminó bien. Guardarlo tras
  // un fallo a medias haría que la vuelta siguiente diera por vistos cambios
  // que nunca se aplicaron, y esos eventos no volverían a aparecer jamás.
  await guardarSyncOk(proximoSyncToken);

  return {
    ok: true,
    traidos: eventos.length,
    creados,
    actualizados,
    anulados,
    ecosIgnorados,
    saltados,
    fueCompleta,
  };
}
