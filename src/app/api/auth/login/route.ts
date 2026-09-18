import { NextResponse } from 'next/server';
import { signSession } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface UserRecord {
  email: string;
  password: string;
  nome: string;
  ruolo: string;
}

function getUsers(): UserRecord[] {
  const raw = process.env.AUTH_USERS_JSON;
  if (!raw) {
    console.error('[Auth] AUTH_USERS_JSON env var is not set — no logins will succeed');
    return [];
  }
  try {
    return JSON.parse(raw) as UserRecord[];
  } catch {
    console.error('[Auth] AUTH_USERS_JSON is not valid JSON');
    return [];
  }
}

// Timing-safe comparison via HMAC so the response time does not leak string length
async function safeCompare(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('pantaleo-compare'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const [ha, hb] = await Promise.all([
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(a)),
    crypto.subtle.sign('HMAC', key, new TextEncoder().encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export async function POST(request: Request) {
  try {
    // Rate limit per-IP: 7 tentativi ogni 15 minuti. Previene brute-force
    // su singolo IP senza penalizzare i typo legittimi dell'utente.
    const ip = getClientIp(request);
    const rl = await rateLimit({ key: `login:${ip}`, max: 7, windowMs: 15 * 60_000 });
    if (!rl.allowed) {
      console.warn(`[Auth] rate-limited login from ${ip}, retry in ${rl.retryAfterSec}s`);
      return NextResponse.json(
        { error: `Troppi tentativi di accesso. Riprova tra ${Math.ceil(rl.retryAfterSec / 60)} minuti.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e password sono obbligatori.' },
        { status: 400 },
      );
    }

    const users = getUsers();
    if (users.length === 0) {
      return NextResponse.json(
        { error: 'Servizio di autenticazione non configurato. Contattare l\'amministratore.' },
        { status: 503 },
      );
    }

    const candidate = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    // Always run safeCompare even if user not found (prevents timing-based user enumeration)
    const sentPassword = password;
    const storedPassword = candidate?.password ?? 'dummy-to-prevent-timing-leak';
    const passwordMatch = await safeCompare(sentPassword, storedPassword);

    if (!candidate || !passwordMatch) {
      return NextResponse.json(
        { error: 'Credenziali non valide. Riprova.' },
        { status: 401 },
      );
    }

    const token = await signSession({
      email: candidate.email,
      nome: candidate.nome,
      ruolo: candidate.ruolo,
    });

    const response = NextResponse.json({
      success: true,
      user: { email: candidate.email, nome: candidate.nome, ruolo: candidate.ruolo },
    });

    response.cookies.set('pantaleo_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Errore del server. Riprova più tardi.' },
      { status: 500 },
    );
  }
}
