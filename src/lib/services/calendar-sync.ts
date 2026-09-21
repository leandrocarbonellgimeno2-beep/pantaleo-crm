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
  ORIGEN_CRM,
} from '@/lib/google-calendar';

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
  const cambios = await traerCambiosDeGoogle();
  if (!cambios) {
    return { ...VACIO, motivo: 'Calendario non collegato o errore Google' };
  }

  const { eventos, proximoSyncToken, fueCompleta } = cambios;

  // Las citas que ya conocemos, por id de evento de Google. Una sola consulta
  // en lugar de una por evento.
  //
  // `where('googleEventId','!=','')` excluye los documentos SIN el campo, que
  // es justo lo que se quiere: las citas nacidas en el CRM y nunca subidas no
  // pintan nada aquí.
  const conocidas = new Map<string, { ref: FirebaseFirestore.DocumentReference; datos: any }>();
  const snap = await db
    .collection('appointments')
    .where('googleEventId', '!=', '')
    .select('googleEventId', 'googleSyncedAt', 'source')
    .get();
  for (const d of snap.docs) {
    const gid = d.data().googleEventId;
    if (gid) conocidas.set(gid, { ref: d.ref, datos: d.data() });
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
      if (esEcoDelCrm(evento, conocida?.datos?.googleSyncedAt)) {
        ecosIgnorados++;
        continue;
      }

      const campos = citaDesdeEvento(evento);
      if (!campos.date) { saltados++; continue; }

      if (conocida) {
        // Existe: se actualiza lo que viene de Google y NADA más. No se tocan
        // clienteId, telefono, notas ni tipo: son del CRM y Google no sabe de
        // ellos.
        batch.update(conocida.ref, {
          ...campos,
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
      const nueva = db.collection('appointments').doc();
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
