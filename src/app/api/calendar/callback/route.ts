import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { admin, db } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const agentId = searchParams.get('state') || 'default_admin'; // We passed this in State
  const error = searchParams.get('error');

  const origin = new URL(request.url).origin;

  if (error) {
    return NextResponse.redirect(`${origin}/agenda?error=${error}`);
  }

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    // Must match the redirectUri used in the auth step
    const redirectUri = `${origin}/api/calendar/callback`;

    if (!clientId || !clientSecret) {
      console.error('[Calendar Callback] Variabili d\'ambiente OAuth mancanti');
      return NextResponse.json({ error: 'Configurazione OAuth mancante sul server' }, { status: 500 });
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Provide the OAuth token so we can fetch the user's email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    // Save to Firestore under the 'users' collection or a dedicated 'calendar_configs' collection
    await db.collection('calendar_configs').doc(agentId).set({
      agentId,
      email: userInfo.data.email,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Success - redirect back to the agenda with a success param
    return NextResponse.redirect(`${origin}/agenda?calendar_connected=true`);

  } catch (error: any) {
    console.error('Error exchanging token:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
