import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { db } from '@/lib/firebase-admin';
import { CALENDAR_CONFIG_ID } from '@/lib/calendar-config';

export async function GET(request: Request) {
  // Lectura, pero con guard: sin el, bloquear a alguien no le cortaba el
  // acceso a los datos. Un ex-empleado con la pestaña abierta seguia listando
  // clientes y descargando documentos durante las ocho horas que le quedaran
  // de sesion, porque ningun GET de negocio pasaba por aqui. «agente» es el
  // nivel mas bajo, asi que ningun rol pierde acceso: lo que se gana es que el
  // bloqueo y la degradacion surtan efecto de verdad.
  const denegado = await guard(request, 'agente');
  if (denegado) return denegado;
  try {
    // Ya no se lee agentId de la query. Aceptarlo permitia consultar cualquier
    // documento de calendar_configs por su id y saber si existe y con que
    // correo de Google esta vinculado. El valor que mandaba el cliente era
    // siempre este mismo, asi que fijarlo no cambia nada de lo que se ve.
    const doc = await db.collection('calendar_configs').doc(CALENDAR_CONFIG_ID).get();
    const datos = doc.exists ? doc.data() : null;

    if (!datos?.tokens?.refresh_token) {
      return NextResponse.json({ connected: false, healthy: false, motivo: 'mai_collegato' });
    }

    // «Hay un refresh_token guardado» NO es lo mismo que «la sincronizacion
    // funciona». Esta ruta decia `connected: true` mirando solo que existiera
    // una cadena, y el enlace llevaba caducado desde el 20 de marzo: la
    // pantalla afirmaba «Sincronizzazione automatica attiva» mientras no
    // llegaba ni una cita.
    //
    // Ahora se distingue lo que consta —hay cuenta vinculada— de lo que se
    // sabe: como fue el ultimo intento de verdad, que es lo que anota
    // `google-calendar.ts` en cada operacion.
    const sync = datos.sync || {};

    return NextResponse.json({
      connected: true,
      email: datos.email ?? null,
      // false solo cuando Google ha RECHAZADO las credenciales. Un fallo de
      // red pasajero no merece un aviso rojo pidiendo reconectar.
      healthy: sync.desconectado !== true,
      desconectado: sync.desconectado === true,
      ultimoIntentoAt: sync.ultimoIntentoAt ?? null,
      ultimoExitoAt: sync.ultimoExitoAt ?? null,
      motivo: sync.motivo ?? null,
      // Si nunca ha corrido la sincronizacion todavia no se sabe nada, y
      // decirlo es mas honesto que dar por bueno el enlace.
      nuncaSincronizado: !sync.ultimoIntentoAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
