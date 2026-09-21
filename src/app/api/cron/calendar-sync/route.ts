/**
 * Trae del calendario de Google lo que cambió. Lo llama el cron de Vercel.
 *
 * POR QUÉ UN CRON Y NO WEBHOOKS. Los avisos push de Google Calendar exigen
 * verificar el dominio en Search Console; sin eso, Google rechaza el canal y
 * la sincronización no se entera de nada. Un cron no depende de nada externo,
 * y con `syncToken` cada vuelta solo trae lo que cambió, así que costar, no
 * cuesta: 96 llamadas al día que casi siempre vuelven vacías.
 */
import { NextResponse } from 'next/server';
import { sincronizarDesdeGoogle } from '@/lib/services/calendar-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Esta ruta está exenta del proxy de sesión (el cron de Vercel llega sin
  // cookies), así que esta comprobación es la ÚNICA barrera: sin CRON_SECRET
  // configurado, `Bearer undefined` sería una credencial válida.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron:calendar-sync] CRON_SECRET no configurado — peticion rechazada');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resumen = await sincronizarDesdeGoogle();
    console.log('[cron:calendar-sync]', JSON.stringify(resumen));

    // 200 aunque la sincronización no haya ido bien: el cron se ejecutó, y el
    // motivo queda anotado en el documento de configuración, que es lo que
    // lee el aviso de la pantalla. Devolver 500 solo haría que Vercel marcara
    // el cron en rojo por algo que no es culpa suya —el calendario
    // desconectado, por ejemplo—.
    return NextResponse.json(resumen);
  } catch (error: any) {
    console.error('[cron:calendar-sync] error inesperado:', error?.message);
    return NextResponse.json({ ok: false, error: 'Sync fallita' }, { status: 500 });
  }
}
