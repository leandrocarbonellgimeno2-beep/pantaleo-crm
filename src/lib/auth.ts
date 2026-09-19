// Web Crypto API session utilities — compatible with both Edge (middleware) and Node.js runtimes.
import { hasAtLeast, type Role } from './roles';

// Uses HMAC-SHA256 to sign and verify session tokens, preventing cookie forgery.

export interface SessionPayload {
  email: string;
  nome: string;
  ruolo: string;
  iat: number; // issued-at (ms)
  exp: number; // expires-at (ms)
}

export class AuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// ── base64url helpers (no Buffer dependency — Edge compatible) ──────────────
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

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Signs a session payload and returns a tamper-proof token.
 * Format: base64url(payload).base64url(hmac_signature)
 */
export async function signSession(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is required');

  const full: SessionPayload = {
    ...payload,
    iat: Date.now(),
    exp: Date.now() + SESSION_DURATION_MS,
  };

  const base = b64uEncode(new TextEncoder().encode(JSON.stringify(full)));
  const key = await hmacKey(secret);
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base)),
  );
  return `${base}.${b64uEncode(sigBytes)}`;
}

/**
 * Verifies a session token. Returns the payload, or null if invalid/expired/tampered.
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return null;
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;

    const base = token.substring(0, dot);
    const sig = token.substring(dot + 1);

    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64uDecode(sig),
      new TextEncoder().encode(base),
    );
    if (!valid) return null;

    const payload: SessionPayload = JSON.parse(
      new TextDecoder().decode(b64uDecode(base)),
    );
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the session from a raw Cookie header string.
 * Use this in route handlers that receive a Request object.
 */
export async function requireAuth(cookieHeader: string | null | undefined): Promise<SessionPayload> {
  const token = cookieHeader?.match(/pantaleo_session=([^;]+)/)?.[1];
  if (!token) throw new AuthError(401, 'Unauthorized');
  const payload = await verifySession(token);
  if (!payload) throw new AuthError(401, 'Invalid or expired session');
  return payload;
}

/**
 * Como requireAuth, pero ademas exige un nivel minimo de rol.
 *
 * Se compara por NIVEL y no por lista de roles: una ruta declara el minimo
 * que necesita y cualquiera por encima pasa. Escribir listas en cada ruta es
 * la forma segura de que alguien se deje un rol fuera y rompa algo.
 *
 * Va aqui y no en un modulo aparte porque es la extension natural de
 * requireAuth, que ya existia y solo usaba backup-db, y porque AuthError ya
 * estaba disenada para llevar el codigo HTTP.
 *
 * Esta comprobacion vive en las RUTAS, no en el middleware, y no es un
 * capricho: el middleware corre en Edge, donde firebase-admin no funciona,
 * asi que alli no se puede consultar nada de la base de datos.
 *
 * Uso:  const sesion = await requireRole(request, 'admin');
 */
export async function requireRole(
  request: Request,
  minimo: Role,
): Promise<SessionPayload> {
  const payload = await requireAuth(request.headers.get('cookie'));
  if (!hasAtLeast(payload.ruolo, minimo)) {
    throw new AuthError(403, 'Permessi insufficienti');
  }
  return payload;
}
