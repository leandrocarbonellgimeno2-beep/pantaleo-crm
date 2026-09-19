import { google } from 'googleapis';
import { db } from './firebase-admin';
import { sumarMinutosAHoraDePared } from './wall-clock';

export async function createCalendarEvent(agentId: string, appointment: any) {
  try {
    // Validare credenziali OAuth da variabili d'ambiente
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('[Google Calendar] Variabili d\'ambiente mancanti: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI');
      return null;
    }

    const doc = await db.collection('calendar_configs').doc(agentId).get();
    
    if (!doc.exists) {
      console.log(`No calendar config found for agent: ${agentId}`);
      return null;
    }

    const tokens = doc.data()?.tokens;
    if (!tokens || !tokens.refresh_token) {
      console.log(`No valid refresh token for agent: ${agentId}`);
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // Set credentials. The library will auto-refresh if we have a refresh_token
    oauth2Client.setCredentials(tokens);

    // If access token gets refreshed, save the new one
    oauth2Client.on('tokens', (newTokens) => {
      if (newTokens.refresh_token) {
        db.collection('calendar_configs').doc(agentId).set({
          tokens: { ...tokens, ...newTokens }
        }, { merge: true }).catch(err => console.error('Failed to update tokens:', err));
      } else {
        db.collection('calendar_configs').doc(agentId).set({
          tokens: { ...tokens, access_token: newTokens.access_token, expiry_date: newTokens.expiry_date }
        }, { merge: true }).catch(err => console.error('Failed to update access token:', err));
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // EL DESFASE DE 1-2 HORAS ESTABA AQUI.
    //
    // Antes: new Date(`${date}T${time}:00`) y luego .toISOString().
    // Una cadena ISO SIN indicador de zona se interpreta como hora LOCAL DEL
    // PROCESO, y el servidor de Vercel va en UTC. Una cita de las 10:00 se
    // convertia asi en las 10:00 UTC. Y al mandar el dateTime terminado en
    // "Z", Google IGNORA el campo timeZone que va al lado, porque la cadena
    // ya lleva su propio offset. Resultado: la cita aparecia a las 12:00 en
    // verano y a las 11:00 en invierno.
    //
    // Por eso el desfase no era fijo: seguia al horario de verano. Una
    // constante de correccion habria acertado medio ano y fallado el otro.
    //
    // Ahora se manda la hora de pared SIN offset y se deja que Google la
    // interprete en Europe/Rome, que es para lo que existe el campo timeZone.
    // Los datos guardados en Firestore no se tocan: date y time siguen
    // siendo exactamente lo que el agente escribio.
    const durationMinutes = appointment.duration || 60;
    const startDateTime = `${appointment.date}T${appointment.time}:00`;
    const endDateTime = sumarMinutosAHoraDePared(
      appointment.date,
      appointment.time,
      durationMinutes,
    );

    const event = {
      summary: `Appuntamento CRM: ${appointment.clientName || 'Cliente'}`,
      location: appointment.propertyAddress || '',
      description: `Agente: ${appointment.agentName || agentId}\nImmobile: ${appointment.propertyAddress || 'N/D'}\nTelefono: ${appointment.clientPhone || 'N/D'}`,
      start: {
        // Sin "Z" ni offset: es lo que hace que timeZone cuente.
        dateTime: startDateTime,
        timeZone: 'Europe/Rome',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Europe/Rome',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
    };

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    console.log('Event created in Google Calendar: %s', res.data.htmlLink);
    return res.data;

  } catch (error) {
    console.error('Error creating Google Calendar event:', error);
    return null;
  }
}

export async function deleteCalendarEvent(agentId: string, googleEventId: string): Promise<boolean> {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('[Google Calendar] Variabili d\'ambiente mancanti: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI');
      return false;
    }

    const doc = await db.collection('calendar_configs').doc(agentId).get();
    if (!doc.exists) {
      console.log(`No calendar config found for agent: ${agentId}`);
      return false;
    }

    const tokens = doc.data()?.tokens;
    if (!tokens || !tokens.refresh_token) {
      console.log(`No valid refresh token for agent: ${agentId}`);
      return false;
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials(tokens);

    oauth2Client.on('tokens', (newTokens) => {
      if (newTokens.refresh_token) {
        db.collection('calendar_configs').doc(agentId).set({
          tokens: { ...tokens, ...newTokens }
        }, { merge: true }).catch(err => console.error('Failed to update tokens:', err));
      } else {
        db.collection('calendar_configs').doc(agentId).set({
          tokens: { ...tokens, access_token: newTokens.access_token, expiry_date: newTokens.expiry_date }
        }, { merge: true }).catch(err => console.error('Failed to update access token:', err));
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
    });

    console.log('Event deleted from Google Calendar: %s', googleEventId);
    return true;

  } catch (error: any) {
    // Un evento già rimosso (410 Gone / 404 Not Found) non è un fallimento:
    // l'obiettivo era che non esistesse, e così è.
    const code = error?.code || error?.response?.status;
    if (code === 404 || code === 410) {
      console.log(`Google Calendar event ${googleEventId} already gone (${code}).`);
      return true;
    }
    console.error('Error deleting Google Calendar event:', error);
    return false;
  }
}
