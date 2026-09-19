// Parametro `state` del flujo OAuth de Google Calendar.
//
// EL ATAQUE QUE CIERRA. Hasta ahora el `state` era literalmente el string
// "default_admin": constante, publico y predecible. Un atacante podia iniciar
// su propio consentimiento en Google con su cuenta, quedarse con el `code`, y
// conseguir que el navegador de un agente ya logueado visitara
// /api/calendar/callback?code=<del atacante>&state=default_admin. El CRM
// canjeaba ese code y guardaba los tokens del ATACANTE como si fueran los de
// la agencia: a partir de ahi, las citas de la inmobiliaria se sincronizaban
// contra el calendario del atacante.
//
// El punto de aplicacion tiene que ser el CALLBACK, no la ruta de inicio: el
// atacante no pasa por nuestra ruta de inicio, construye su URL de
// autorizacion directamente contra Google, donde client_id y redirect_uri son
// valores publicos que se ven en nuestro propio 302.
//
// COMO SE CIERRA. Doble comprobacion:
//   1. El state va FIRMADO (HMAC-SHA256 con SESSION_SECRET) y caduca a los 10
//      minutos, asi que no se puede fabricar ni reutilizar indefinidamente.
//   2. Dentro lleva un nonce aleatorio que tambien se guarda en una cookie
//      HttpOnly. El callback exige que los dos coincidan, asi que un state
//      valido solo sirve en el navegador que inicio ese flujo concreto.
//
// POR QUE NO SE REUTILIZA signSession. Parece la opcion obvia y es una trampa:
// verifySession (src/lib/auth.ts:75) NO valida la forma del payload, solo la
// firma y el exp. Un token emitido con signSession seria por tanto una cookie
// de sesion valida, y el state circula por URLs, historiales y referers. De ahi
// el PREFIJO DE DOMINIO: aqui se firma "oauth-state:" + base, no base a secas,
// de modo que un state jamas valida como sesion y una sesion jamas valida como
// state, aunque compartan secreto y formato.

/** Cookie que acompana al state. Corta, HttpOnly y de un solo uso. */
export const OAUTH_STATE_COOKIE = 'pantaleo_oauth_state';

/** Ventana para completar el consentimiento en Google. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// Separacion de dominio criptografico: ver la nota de arriba.
const DOMAIN_PREFIX = 'oauth-state:';

interface StatePayload {
  n: string;
  exp: number;
}

// ── base64url sin Buffer, igual que src/lib/auth.ts ─────────────────────────
function b64uEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64uDecode(str: string): Uint8Array<ArrayBuffer> {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Comparacion en tiempo constante.
 *
 * Comparar el nonce con === filtraria informacion por el tiempo de respuesta:
 * un atacante que pueda medirlo podria ir adivinandolo caracter a caracter.
 * Es barato hacerlo bien.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Crea el par state/nonce para iniciar el flujo.
 *
 * El `state` viaja por la URL hasta Google y vuelve; el `nonce` va en la cookie
 * y nunca sale del navegador del agente.
 */
export async function createOAuthState(): Promise<{ state: string; nonce: string }> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is required');

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const nonce = b64uEncode(bytes);

  const payload: StatePayload = { n: nonce, exp: Date.now() + OAUTH_STATE_TTL_MS };
  const base = b64uEncode(new TextEncoder().encode(JSON.stringify(payload)));

  const key = await hmacKey(secret);
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(DOMAIN_PREFIX + base)),
  );

  return { state: `${base}.${b64uEncode(sigBytes)}`, nonce };
}

/**
 * Valida el state que devuelve Google contra el nonce de la cookie.
 *
 * Devuelve false ante cualquier problema, sin distinguir cual: firma invalida,
 * caducado, malformado, nonce que no coincide o cookie ausente. Quien llama no
 * necesita el motivo y darlo solo ayudaria a quien sondea.
 */
export async function verifyOAuthState(
  state: string | null | undefined,
  cookieNonce: string | null | undefined,
): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !state || !cookieNonce) return false;

  try {
    const dot = state.lastIndexOf('.');
    if (dot === -1) return false;

    const base = state.substring(0, dot);
    const sig = state.substring(dot + 1);
    if (!base || !sig) return false;

    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64uDecode(sig),
      new TextEncoder().encode(DOMAIN_PREFIX + base),
    );
    if (!valid) return false;

    const payload = JSON.parse(new TextDecoder().decode(b64uDecode(base))) as StatePayload;
    if (typeof payload?.n !== 'string' || typeof payload?.exp !== 'number') return false;
    if (Date.now() > payload.exp) return false;

    return timingSafeEqual(payload.n, cookieNonce);
  } catch {
    return false;
  }
}
