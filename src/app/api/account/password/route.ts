/**
 * /api/account/password — cambiar la propia contrasena.
 *
 * Separada del panel a proposito: esto lo puede hacer CUALQUIER rol, incluido
 * el de solo lectura, sobre su propia cuenta y solo sobre ella. El email no se
 * lee del cuerpo, se lee de la sesion, de modo que no hay forma de pedir el
 * cambio de la contrasena de otra persona.
 */
import { NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { actualizarUsuario, hashActualDe, validarPassword } from '@/lib/services/users';
import { audit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    let sesion;
    try {
      sesion = await requireAuth(request.headers.get('cookie'));
    } catch (e: any) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    // Mismo motivo que en el login: sin limite, esto es un oraculo para probar
    // la contrasena actual de una sesion robada tantas veces como se quiera.
    const rl = await rateLimit({
      key: `pwd:${getClientIp(request)}`,
      max: 7,
      windowMs: 15 * 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Troppi tentativi. Riprova tra ${Math.ceil(rl.retryAfterSec / 60)} minuti.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const body = await request.json().catch(() => ({} as any));

    const validacion = validarPassword(body?.nuevaPassword);
    if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 });

    const hashGuardado = await hashActualDe(sesion.email);
    if (!hashGuardado) {
      // Todavia entra por AUTH_USERS_JSON: no hay documento que actualizar.
      // Cuando se borre la variable y todo el mundo este en _users, este caso
      // desaparece solo.
      return NextResponse.json(
        { error: 'Il tuo account non è ancora gestito dal pannello. Contattare l\'amministratore.' },
        { status: 409 },
      );
    }

    // Se exige la contrasena actual. Sin esto, una sesion robada o un portatil
    // abierto bastan para cambiar la contrasena y quedarse con la cuenta.
    const actualCorrecta = await verifyPassword(String(body?.passwordActual ?? ''), hashGuardado);
    if (!actualCorrecta) {
      return NextResponse.json({ error: 'La password attuale non è corretta.' }, { status: 401 });
    }

    const passwordHash = await hashPassword(validacion.password);
    const resultado = await actualizarUsuario(sesion.email, {
      passwordHash,
      mustResetPassword: false,
    });

    if (!resultado.ok) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });

    console.log('[account/password] cambio de contrasena de', sesion.email);
    audit({
      actorEmail: sesion.email,
      actorRole: sesion.ruolo,
      action: 'account.password',
      target: { collection: '_users', id: sesion.email },
      changedFields: ['password'],
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[account/password]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
