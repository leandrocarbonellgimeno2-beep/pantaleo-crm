import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createOAuthState, OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS } from '@/lib/oauth-state';

export async function GET(request: Request) {
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

  // Ya no se lee ningun agentId de la query. Antes se leia y se enviaba tal
  // cual como `state`, de modo que el state era un valor constante, publico y
  // predecible: exactamente lo contrario de lo que sirve un state. El id del
  // documento es ahora una constante de servidor (lib/calendar-config.ts).
  const { state, nonce } = await createOAuthState();

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to receive a refresh token
    scope: scopes,
    prompt: 'consent', // Force consent to ensure refresh token is returned
    state,
  });

  const response = NextResponse.redirect(url);

  // El nonce se queda en el navegador y nunca viaja por la URL. El callback
  // exigira que coincida con el que va dentro del state firmado.
  //
  // sameSite DEBE ser 'lax' y nunca 'strict': Google devuelve al usuario con
  // una navegacion GET de primer nivel desde accounts.google.com, y con
  // 'strict' esa cookie no se enviaria y el callback fallaria siempre.
  response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // Alcance minimo: solo la rama que la necesita.
    path: '/api/calendar',
    maxAge: OAUTH_STATE_TTL_MS / 1000,
  });

  return response;
}
