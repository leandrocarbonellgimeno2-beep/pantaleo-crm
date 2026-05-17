import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId') || 'default_admin';

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  // Derive redirect URI from the incoming request so it works in both local
  // and production without environment-specific configuration.
  const redirectUri = `${new URL(request.url).origin}/api/calendar/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Configurazione OAuth mancante sul server' }, { status: 500 });
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to receive a refresh token
    scope: scopes,
    prompt: 'consent', // Force consent to ensure refresh token is returned
    state: agentId // Pass the identifier through the OAuth flow
  });

  return NextResponse.redirect(url);
}
