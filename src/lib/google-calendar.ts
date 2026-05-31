import { google } from 'googleapis';
import { db } from './firebase-admin';

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

    // Format start and end times (assuming date is YYYY-MM-DD and time is HH:MM)
    const startDateTime = new Date(`${appointment.date}T${appointment.time}:00`);
    
    // Default duration to 60 minutes if not provided
    const durationMinutes = appointment.duration || 60;
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);

    const event = {
      summary: `Appuntamento CRM: ${appointment.clientName || 'Cliente'}`,
      location: appointment.propertyAddress || '',
      description: `Agente: ${appointment.agentName || agentId}\nImmobile: ${appointment.propertyAddress || 'N/D'}\nTelefono: ${appointment.clientPhone || 'N/D'}`,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'Europe/Rome', // Modify this if necessary based on your timezone
      },
      end: {
        dateTime: endDateTime.toISOString(),
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
