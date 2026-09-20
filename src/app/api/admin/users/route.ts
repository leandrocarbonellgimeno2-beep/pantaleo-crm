/**
 * /api/admin/users — listado, alta y edicion de usuarios del CRM.
 *
 * Nivel minimo: PROPIETARIO, y solo propietario. Gestionar quien entra al CRM
 * y con que permisos es cosa del dueno de la agencia.
 *
 * Antes el minimo era secretaria, con la salvedad de que no podia tocar
 * usuarios con rol 'propietario'. Se subio por decision del dueno al integrar
 * la administracion en el home: la secretaria conserva intacto su trabajo sobre
 * los DATOS DE NEGOCIO —incluida el alta de propietarios de inmuebles en
 * /api/proprietari, que es otra cosa y no se toca— pero deja de gestionar
 * usuarios del sistema.
 *
 * LAS SALVAGUARDAS DE ABAJO SE QUEDAN, aunque con este nivel minimo ninguna
 * pueda dispararse hoy: no crear ni tocar propietarios sin serlo, no degradarse
 * a uno mismo, no dejar la agencia sin propietarios y no bloquearse solo. Son
 * baratas y son la red que queda si alguien vuelve a bajar el minimo.
 */
import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { audit } from '@/lib/services/audit';
import { getClientIp } from '@/lib/rate-limit';
import { requireRole, AuthError } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { hasAtLeast, ROLES, type Role } from '@/lib/roles';
import {
  actualizarUsuario,
  contarPropietariosActivos,
  crearUsuario,
  listarUsuarios,
  obtenerUsuario,
  validarNuevoUsuario,
  validarPassword,
  type CambiosUsuario,
} from '@/lib/services/users';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denegado = await guard(request, 'propietario');
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
  const denegado = await guard(request, 'propietario');
  if (denegado) return denegado;

  try {
    // Se vuelve a leer la sesion porque hace falta saber QUIEN crea, para dos
    // cosas: comprobar si puede crear un propietario, y dejar constancia en
    // createdBy. guard() solo responde si o no.
    let sesion;
    try {
      sesion = await requireRole(request, 'propietario');
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
    audit({
      actorEmail: sesion.email,
      actorRole: sesion.ruolo,
      action: 'user.create',
      target: { collection: '_users', id: email, label: nome },
      changedFields: ['role', 'passwordHash'],
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, user: resultado.usuario }, { status: 201 });
  } catch (error: any) {
    console.error('[admin/users POST]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

/**
 * Cambia el rol, el estado o la contrasena de un usuario.
 *
 * Las cuatro salvaguardas que lleva no son burocracia: cada una evita un
 * estado del que no se sale sin editar Firestore a mano.
 */
export async function PATCH(request: Request) {
  const denegado = await guard(request, 'propietario');
  if (denegado) return denegado;

  try {
    let sesion;
    try {
      sesion = await requireRole(request, 'propietario');
    } catch (e: any) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const body = await request.json().catch(() => ({} as any));
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) return NextResponse.json({ error: 'Email obbligatoria' }, { status: 400 });

    const esPropietario = hasAtLeast(sesion.ruolo, 'propietario');
    const esUnoMismo = sesion.email.trim().toLowerCase() === email;

    // El cuerpo se valida ANTES de leer nada de la base: una peticion mal
    // formada no merece una lectura de Firestore, y asi el error que vuelve
    // dice que esta mal en vez de un 500 generico.
    const cambios: CambiosUsuario = {};

    if (body.role !== undefined) {
      const role = String(body.role).trim().toLowerCase();
      if (!(ROLES as readonly string[]).includes(role)) {
        return NextResponse.json(
          { error: `Ruolo non valido. Valori ammessi: ${ROLES.join(', ')}` },
          { status: 400 },
        );
      }
      // ── Salvaguarda 2: solo un propietario concede el rol de propietario ───
      if (role === 'propietario' && !esPropietario) {
        return NextResponse.json(
          { error: 'Solo un propietario può assegnare il ruolo propietario.' },
          { status: 403 },
        );
      }
      cambios.role = role as Role;
    }

    if (body.status !== undefined) {
      const status = String(body.status).trim().toLowerCase();
      if (status !== 'attivo' && status !== 'bloccato') {
        return NextResponse.json({ error: 'Stato non valido' }, { status: 400 });
      }
      cambios.status = status;
    }

    if (body.password !== undefined) {
      const v = validarPassword(body.password);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      cambios.passwordHash = await hashPassword(v.password);
      // Quien recibe una contrasena puesta por otro deberia cambiarla. El
      // flujo de cambio obligatorio llegara despues; de momento queda anotado.
      cambios.mustResetPassword = true;
    }

    if (body.mustResetPassword !== undefined) {
      cambios.mustResetPassword = body.mustResetPassword === true;
    }

    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ error: 'Nessuna modifica richiesta' }, { status: 400 });
    }

    const objetivo = await obtenerUsuario(email);
    if (!objetivo) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });

    // ── Salvaguarda 1: la secretaria no toca a un propietario ────────────────
    if (objetivo.role === 'propietario' && !esPropietario) {
      return NextResponse.json(
        { error: 'Solo un propietario può modificare un altro propietario.' },
        { status: 403 },
      );
    }

    // ── Salvaguarda 3: nadie se degrada ni se bloquea a si mismo ─────────────
    // Es el error mas facil de cometer y el mas caro: el unico propietario se
    // quita el rol sin pensarlo y pierde el acceso al panel que necesita para
    // devolverselo. Cambiarse la propia contrasena SI se permite, por
    // /api/account/password.
    if (esUnoMismo && (cambios.role !== undefined || cambios.status !== undefined)) {
      return NextResponse.json(
        { error: 'Non puoi cambiare il tuo ruolo né disattivare te stesso.' },
        { status: 400 },
      );
    }

    // ── Salvaguarda 4: no dejar la agencia sin propietarios ──────────────────
    const dejariaDeSerPropietario =
      objetivo.role === 'propietario' &&
      objetivo.status === 'attivo' &&
      ((cambios.role !== undefined && cambios.role !== 'propietario') ||
        cambios.status === 'bloccato');

    if (dejariaDeSerPropietario && (await contarPropietariosActivos()) <= 1) {
      return NextResponse.json(
        { error: 'È l\'ultimo propietario attivo: assegna prima il ruolo a un altro utente.' },
        { status: 409 },
      );
    }

    const resultado = await actualizarUsuario(email, cambios);
    if (!resultado.ok) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });

    // Solo NOMBRES de campo, y passwordHash se renombra a 'password': ni el
    // hash ni el valor nuevo tienen nada que hacer en un registro.
    const camposTocados = Object.keys(cambios).map((k) => (k === 'passwordHash' ? 'password' : k));
    console.log(`[admin/users] ${sesion.email} ha modificato ${email}: ${JSON.stringify(camposTocados)}`);
    audit({
      actorEmail: sesion.email,
      actorRole: sesion.ruolo,
      action: 'user.update',
      target: { collection: '_users', id: email, label: objetivo.nome },
      changedFields: camposTocados,
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, user: resultado.usuario });
  } catch (error: any) {
    console.error('[admin/users PATCH]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
