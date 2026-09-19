import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { CALENDAR_CONFIG_ID } from '@/lib/calendar-config';

export async function GET() {
  try {
    // Ya no se lee agentId de la query. Aceptarlo permitia consultar cualquier
    // documento de calendar_configs por su id y saber si existe y con que
    // correo de Google esta vinculado. El valor que mandaba el cliente era
    // siempre este mismo, asi que fijarlo no cambia nada de lo que se ve.
    const doc = await db.collection('calendar_configs').doc(CALENDAR_CONFIG_ID).get();

    if (doc.exists && doc.data()?.tokens?.refresh_token) {
      return NextResponse.json({
        connected: true,
        email: doc.data()?.email
      });
    }

    return NextResponse.json({ connected: false });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
