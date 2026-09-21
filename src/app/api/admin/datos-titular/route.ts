/**
 * /api/admin/datos-titular — los datos de la agencia que salen en las páginas
 * legales.
 *
 * NIVEL MÍNIMO: PROPIETARIO, en los dos métodos. Lo que se edita aquí acaba
 * publicado en dos páginas accesibles SIN SESIÓN —la razón social, la
 * dirección, la P. IVA y los correos de la agencia—, y es el documento que
 * Google revisa a mano para publicar la aplicación OAuth. No es una ficha de
 * trabajo: es quién dice ser la empresa.
 *
 * También el GET, y es deliberado: aunque el contenido acabe siendo público,
 * saber qué campos faltan por rellenar es información de administración y no
 * tiene por qué verla un vendedor.
 */
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { guard, sesionActual } from '@/lib/api-guard';
import { getClientIp } from '@/lib/rate-limit';
import { leerDatosTitular, guardarDatosTitular } from '@/lib/services/datos-titular';
import { camposQueFaltan } from '@/lib/datos-titular';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denegado = await guard(request, 'propietario');
  if (denegado) return denegado;

  try {
    const guardados = await leerDatosTitular();
    return NextResponse.json({
      datos: guardados.datos,
      existe: guardados.existe,
      actualizadoAt: guardados.actualizadoAt,
      actualizadoPor: guardados.actualizadoPor,
      faltan: camposQueFaltan(guardados.datos),
      errorDeLectura: guardados.errorDeLectura,
    });
  } catch (error: any) {
    console.error('[admin/datos-titular GET]', error?.message);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const denegado = await guard(request, 'propietario');
  if (denegado) return denegado;

  try {
    const sesion = await sesionActual(request);
    const cuerpo = await request.json();

    const r = await guardarDatosTitular(cuerpo, {
      email: sesion?.email ?? 'sconosciuto',
      role: sesion?.ruolo ?? 'sconosciuto',
      ip: getClientIp(request),
    });

    if (!r.ok) {
      // 422 y no 400: el cuerpo se entiende perfectamente, lo que pasa es que
      // su contenido no vale. La pantalla pinta el error debajo de cada campo.
      return NextResponse.json({ errores: r.errores }, { status: 422 });
    }

    // Las dos páginas públicas se sirven en dinámico, así que ya leen cada vez.
    // Esto es la red por si algún día alguien las pasa a estáticas: sin ello,
    // Francesco guardaría los datos y la página seguiría enseñando los
    // anteriores hasta el siguiente despliegue, que es justo lo que este
    // trabajo viene a quitar.
    revalidatePath('/privacy');
    revalidatePath('/terms');

    return NextResponse.json({ success: true, datos: r.datos, faltan: r.faltan });
  } catch (error: any) {
    console.error('[admin/datos-titular PUT]', error?.message);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
