import { NextResponse } from 'next/server';
import { signSession } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { hashPassword, verifyPassword, burnPasswordTime } from '@/lib/password';
import { normalizeRole, type Role } from '@/lib/roles';
import { buscarUsuario, migrarUsuarioDesdeLegacy } from '@/lib/services/users';
import { audit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

/**
 * TEMPORAL — SE ELIMINA AL CONSTRUIR EL PANEL DE ADMINISTRACION (Fase 4).
 *
 * Todo usuario que entre por el AUTH_USERS_JSON viejo asume el rol maximo.
 * Es deliberado y tiene una razon concreta: los roles que hay en esa
 * variable no se corresponden con la nomenclatura nueva (propietario /
 * secretaria / vendedor / agente), y ademas no se pueden leer desde aqui,
 * porque Vercel la marca como Sensitive. Traducirlos a ojo podria dejar al
 * dueno de la agencia sin acceso a la administracion de su propio CRM justo
 * cuando las rutas empiezan a comprobar el rol.
 *
 * No afloja nada respecto a hoy: ahora mismo cualquier usuario autenticado
 * puede hacerlo absolutamente todo, porque no existe ni una comprobacion de
 * rol. Esto mantiene ese statu quo SOLO para quien ya estaba en el JSON.
 *
 * COMO SE QUITA: cuando el panel permita crear los usuarios definitivos con
 * su rol real, se borra AUTH_USERS_JSON de Vercel y con ella todo el bloque
 * de fallback. Esta constante se va con el.
 */
const ROL_LEGACY: Role = 'propietario';

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

function emitirSesion(datos: { email: string; nome: string; ruolo: unknown }) {
  // El rol se normaliza AL FIRMAR, no al leerlo, para que lo que viaje en la
  // cookie sea siempre uno de los cuatro canonicos y requireRole no tenga que
  // adivinar. normalizeRole deja ademas un aviso en los logs si el valor no se
  // reconoce, que es como iremos descubriendo los roles reales.
  return signSession({
    email: datos.email,
    nome: datos.nome,
    ruolo: normalizeRole(datos.ruolo),
  });
}

function respuestaConCookie(token: string, user: { email: string; nome: string; ruolo: string }) {
  const response = NextResponse.json({ success: true, user });
  response.cookies.set('pantaleo_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // Misma ventana que el exp del token (lib/auth.ts). Si la cookie durase
    // mas, el navegador seguiria mandando un token ya caducado y el usuario
    // veria un 401 en vez de que le lleven al login.
    maxAge: 60 * 60 * 8,
  });
  return response;
}

/**
 * Login con DOBLE LECTURA durante la migracion de contrasenas.
 *
 *   1. Se busca al usuario en la coleccion _users. Si esta, su hash manda y el
 *      JSON ni se mira.
 *   2. Si no esta, se valida contra AUTH_USERS_JSON como siempre y, si la
 *      contrasena es correcta, se crea el registro en _users con el hash. El
 *      usuario no percibe nada.
 *   3. Cuando todo el mundo haya entrado una vez, se retira el paso 2 y se
 *      borra la variable de entorno.
 *
 * EL ORDEN DE LOS FALLOS ES LO QUE EVITA UN BLOQUEO TOTAL. Si Firestore no
 * responde, la busqueda devuelve 'error' y NO 'no existe', y entonces se
 * degrada al JSON en vez de rechazar el login. Tratar los dos casos igual seria
 * dejar a la agencia entera fuera el dia que Firestore tenga un mal minuto.
 * Es una concesion consciente y temporal: mientras el JSON siga existiendo, es
 * una fuente de credenciales tan valida como la otra.
 */
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

    // ── 1. Fuente principal: _users ──────────────────────────────────────────
    const busqueda = await buscarUsuario(email);

    if (busqueda.estado === 'encontrado') {
      const u = busqueda.usuario;

      if (!(await verifyPassword(password, u.passwordHash))) {
        // Ya migrado: aqui NO se cae al JSON. Si se cayera, cambiar la
        // contrasena desde el panel no serviria de nada mientras la vieja
        // siguiera en la variable de entorno.
        return NextResponse.json({ error: 'Credenziali non valide. Riprova.' }, { status: 401 });
      }

      if (u.status === 'bloccato') {
        console.warn('[Auth] login rechazado, usuario bloqueado:', u.email);
        return NextResponse.json(
          { error: 'Account disattivato. Contattare l\'amministratore.' },
          { status: 403 },
        );
      }

      const token = await emitirSesion({ email: u.email, nome: u.nome, ruolo: u.role });
      audit({ actorEmail: u.email, actorRole: u.role, action: 'auth.login', ip });
      return respuestaConCookie(token, { email: u.email, nome: u.nome, ruolo: u.role });
    }

    // ── 2. Fallback: AUTH_USERS_JSON ─────────────────────────────────────────
    // Se llega aqui tanto si el usuario no esta migrado como si Firestore no
    // contesto.
    const users = getUsers();
    const candidate = users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
    const passwordMatch = candidate ? await safeCompare(password, candidate.password) : false;

    if (!candidate || !passwordMatch) {
      // Iguala el coste con la rama de _users, que gasta un scrypt. Sin esto,
      // un email que no existe responderia mucho antes que uno migrado con la
      // contrasena mal, y esa diferencia se mide desde fuera.
      await burnPasswordTime(password);

      // El aviso de "no configurado" va AQUI y no antes de mirar nada. Si
      // siguiera al principio, el dia que se borre AUTH_USERS_JSON nadie
      // entraria aunque _users estuviese poblada.
      if (users.length === 0) {
        return NextResponse.json(
          { error: 'Servizio di autenticazione non configurato. Contattare l\'amministratore.' },
          { status: 503 },
        );
      }

      return NextResponse.json({ error: 'Credenziali non valide. Riprova.' }, { status: 401 });
    }

    // ── 3. Migracion invisible ───────────────────────────────────────────────
    // Solo si Firestore dijo explicitamente que el usuario NO existe. Si la
    // busqueda fallo, no se escribe: no sabemos si ya hay un documento, y
    // podriamos pisar un hash mas nuevo con la contrasena vieja del JSON.
    if (busqueda.estado === 'no-existe') {
      try {
        const passwordHash = await hashPassword(candidate.password);
        await migrarUsuarioDesdeLegacy({
          email: candidate.email,
          nome: candidate.nome,
          // Mismo criterio que la sesion: el documento migrado hereda el rol
          // maximo, no el del JSON. Estos registros se borran en la Fase 4.
          ruolo: ROL_LEGACY,
          passwordHash,
        });
      } catch (e: any) {
        // El usuario ya ha demostrado quien es: entra igual. La migracion se
        // reintentara sola en el siguiente login.
        console.error('[Auth] migracion a _users fallida (el login continua):', e?.message);
      }
    }

    // Ver ROL_LEGACY: el rol que traiga el JSON se ignora a proposito.
    const token = await emitirSesion({
      email: candidate.email,
      nome: candidate.nome,
      ruolo: ROL_LEGACY,
    });
    audit({ actorEmail: candidate.email, actorRole: ROL_LEGACY, action: 'auth.login', ip });
    return respuestaConCookie(token, {
      email: candidate.email,
      nome: candidate.nome,
      ruolo: ROL_LEGACY,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Errore del server. Riprova più tardi.' },
      { status: 500 },
    );
  }
}
