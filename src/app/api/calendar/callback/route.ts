import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { admin, db } from '@/lib/firebase-admin';
import { verifyOAuthState, OAUTH_STATE_COOKIE } from '@/lib/oauth-state';
import { CALENDAR_CONFIG_ID } from '@/lib/calendar-config';
import { audit } from '@/lib/services/audit';
import { guard } from '@/lib/api-guard';

export async function GET(request: Request) {
  // Vincular la cuenta de Google de LA AGENCIA es al menos tan sensible como
  // gestionar usuarios, y no tenia ninguna comprobacion de rol: cualquier
  // usuario autenticado podia consentir con SU cuenta personal y el callback
  // reescribia la configuracion compartida con sus tokens. A partir de ahi cada
  // cita de la inmobiliaria —nombre del cliente, direccion del inmueble y
  // telefono en la descripcion del evento— aterrizaba en su calendario privado,
  // y la agencia dejaba de recibirlas.
  const denegado = await guard(request, 'propietario');
  if (denegado) return denegado;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const origin = new URL(request.url).origin;

  if (error) {
    return NextResponse.redirect(`${origin}/agenda?error=${error}`);
  }

  // ── Validacion del state ───────────────────────────────────────────────────
  // Va ANTES de canjear el code, y es deliberado: un code de la cuenta de otro
  // no debe llegar siquiera a canjearse. Antes no habia validacion ninguna y el
  // state se usaba directamente como id de documento.
  //
  // Este es el punto donde hay que comprobarlo, no la ruta de inicio: el
  // atacante no pasa por nuestra ruta de inicio, construye su URL de
  // autorizacion contra Google por su cuenta.
  const cookieNonce = request.headers
    .get('cookie')
    ?.match(new RegExp(`${OAUTH_STATE_COOKIE}=([^;]+)`))?.[1];

  if (!(await verifyOAuthState(state, cookieNonce))) {
    console.warn('[Calendar Callback] state non valido: richiesta rifiutata');
    const rechazo = NextResponse.redirect(`${origin}/agenda?error=invalid_state`);
    rechazo.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/api/calendar', maxAge: 0 });
    return rechazo;
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

    // El id del documento es una constante de servidor. Antes salia del state,
    // es decir, lo elegia quien llamara: podia escribir en cualquier documento
    // de la coleccion y, metiendo barras, en subcolecciones arbitrarias.
    await db.collection('calendar_configs').doc(CALENDAR_CONFIG_ID).set({
      agentId: CALENDAR_CONFIG_ID,
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

    // Esta ruta ESCRIBE en un GET, que es facil que se escape de cualquier
    // inventario hecho filtrando por metodo HTTP. Y lo que escribe son los
    // tokens de la cuenta de Google de la agencia: merece registro.
    audit({
      actorEmail: userInfo.data.email ?? 'sconosciuto',
      actorRole: 'sistema',
      action: 'calendar.link',
      target: { collection: 'calendar_configs', id: CALENDAR_CONFIG_ID },
      changedFields: ['tokens', 'email'],
    });

    // Success - redirect back to the agenda with a success param
    const exito = NextResponse.redirect(`${origin}/agenda?calendar_connected=true`);
    // El state es de un solo uso: consumido el flujo, la cookie sobra.
    exito.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/api/calendar', maxAge: 0 });
    return exito;

  } catch (error: any) {
    console.error('Error exchanging token:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
