import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db, admin } from '@/lib/firebase-admin';

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('[Calendar Sync] Variabili d\'ambiente OAuth mancanti: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Import events FROM Google Calendar INTO our CRM (with pagination + upsert)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const agentId = body.agentId || 'default_admin';
    const timeMin = body.timeMin || '2023-03-02T00:00:00Z';
    const timeMax = body.timeMax || new Date().toISOString();

    // Get stored tokens
    const configDoc = await db.collection('calendar_configs').doc(agentId).get();
    if (!configDoc.exists || !configDoc.data()?.tokens?.refresh_token) {
      return NextResponse.json({ error: 'Calendar not connected for this agent' }, { status: 400 });
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(configDoc.data()!.tokens);

    // Auto-refresh tokens
    oauth2Client.on('tokens', (newTokens) => {
      db.collection('calendar_configs').doc(agentId).set({
        tokens: { ...configDoc.data()!.tokens, ...newTokens }
      }, { merge: true }).catch(console.error);
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    let allEvents: any[] = [];
    let pageToken: string | undefined = undefined;

    // Paginate through ALL events
    do {
      const res: any = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        maxResults: 250,
        singleEvents: true,
        orderBy: 'startTime',
        pageToken,
      });

      const events = res.data.items || [];
      allEvents = allEvents.concat(events);
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    // Upsert into Firestore
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Process in batches of 400
    for (let i = 0; i < allEvents.length; i += 400) {
      const chunk = allEvents.slice(i, i + 400);
      const batch = db.batch();

      for (const event of chunk) {
        if (!event.id) { skipped++; continue; }

        // Check if event already exists by googleEventId
        const existing = await db.collection('appointments')
          .where('googleEventId', '==', event.id)
          .limit(1)
          .get();

        const startDt = event.start?.dateTime || event.start?.date || '';
        const endDt = event.end?.dateTime || event.end?.date || '';

        const dateStr = startDt ? startDt.substring(0, 10) : '';
        const timeStr = startDt.length > 10 ? startDt.substring(11, 16) : '00:00';

        const endDate = new Date(endDt);
        const startDate = new Date(startDt);
        const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000) || 60;

        const appointmentData: any = {
          clientName: event.summary || 'Evento Google Calendar',
          propertyAddress: event.location || '',
          date: dateStr,
          time: timeStr,
          duration: durationMinutes,
          status: event.status === 'cancelled' ? 'Annullato' : 'Confermato',
          googleEventId: event.id,
          googleEventLink: event.htmlLink || '',
          source: 'google_calendar',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (!existing.empty) {
          // Update existing
          batch.update(existing.docs[0].ref, appointmentData);
          updated++;
        } else {
          // Create new
          appointmentData.createdAt = admin.firestore.FieldValue.serverTimestamp();
          const newRef = db.collection('appointments').doc();
          batch.set(newRef, appointmentData);
          created++;
        }
      }
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      totalFromGoogle: allEvents.length,
      created,
      updated,
      skipped,
    });

  } catch (error: any) {
    console.error('Calendar sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
