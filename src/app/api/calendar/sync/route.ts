/**
 * El botón «Sincronizza Google» de la agenda.
 *
 * Solo dispara a mano lo mismo que hace el cron cada 15 minutos. Toda la
 * lógica vive en `services/calendar-sync.ts`: si estuviera duplicada aquí,
 * uno de los dos caminos acabaría con una versión vieja de las reglas que
 * cortan el rebote, y ese fallo no se vería hasta que el calendario empezara
 * a rebotar solo.
 */
import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { sincronizarDesdeGoogle } from '@/lib/services/calendar-sync';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

  try {
    const resumen = await sincronizarDesdeGoogle();

    if (!resumen.ok) {
      // 400 y no 200: la pantalla pintaba un aviso VERDE de éxito con lo que
      // devolviera esta ruta, así que un fallo salía como «Importati
      // undefined eventi». Ahora un fallo es un fallo.
      return NextResponse.json(
        { error: resumen.motivo || 'Sincronizzazione non riuscita' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      totalFromGoogle: resumen.traidos,
      created: resumen.creados,
      updated: resumen.actualizados,
      cancelled: resumen.anulados,
      skipped: resumen.saltados,
      echoesIgnored: resumen.ecosIgnorados,
      fullSync: resumen.fueCompleta,
    });
  } catch (error: any) {
    console.error('[calendar sync]', error?.message);
    return NextResponse.json({ error: 'Sincronizzazione non riuscita' }, { status: 500 });
  }
}
