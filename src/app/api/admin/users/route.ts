/**
 * /api/admin/users — listado y alta de usuarios del CRM.
 *
 * Nivel minimo: secretaria. Con una excepcion que el usuario confirmo: la
 * secretaria gestiona al equipo, pero NO puede crear ni tocar usuarios con rol
 * 'propietario'. Eso lo comprueba el POST por su cuenta, porque depende del
 * cuerpo de la peticion y no solo del nivel de quien llama.
 */
import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { requireRole, AuthError } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { hasAtLeast } from '@/lib/roles';
import { crearUsuario, listarUsuarios, validarNuevoUsuario } from '@/lib/services/users';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    const usuarios = await listarUsuarios();
    return NextResponse.json({ data: usuarios, totalCount: usuarios.length });
  } catch (error: any) {
    console.error('[admin/users GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    // Se vuelve a leer la sesion porque hace falta saber QUIEN crea, para dos
    // cosas: comprobar si puede crear un propietario, y dejar constancia en
    // createdBy. guard() solo responde si o no.
    let sesion;
    try {
      sesion = await requireRole(request, 'secretaria');
    } catch (e: any) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const body = await request.json().catch(() => ({}));
    const validacion = validarNuevoUsuario(body);
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    const { email, nome, password, role } = validacion.datos;

    // La regla de negocio: solo un propietario crea propietarios. Sin esto,
    // una secretaria podria fabricarse una cuenta de nivel superior y usarla
    // para escalar, que es exactamente lo que la jerarquia intenta impedir.
    if (role === 'propietario' && !hasAtLeast(sesion.ruolo, 'propietario')) {
      console.warn(`[admin/users] ${sesion.email} intento crear un propietario sin serlo`);
      return NextResponse.json(
        { error: 'Solo un propietario può creare un altro propietario.' },
        { status: 403 },
      );
    }

    const passwordHash = await hashPassword(password);

    const resultado = await crearUsuario({
      email,
      nome,
      role,
      passwordHash,
      createdBy: sesion.email,
    });

    if (!resultado.ok) {
      return NextResponse.json(
        { error: 'Esiste già un utente con questa email.' },
        { status: 409 },
      );
    }

    console.log(`[admin/users] ${sesion.email} ha creato l'utente ${email} con ruolo ${role}`);
    return NextResponse.json({ success: true, user: resultado.usuario }, { status: 201 });
  } catch (error: any) {
    console.error('[admin/users POST]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
