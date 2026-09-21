import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { buildUpdateArgs } from '@/lib/firestore-update';
import { sanitizeFirestoreId } from '@/lib/sanitize';
import { db, admin } from '@/lib/firebase-admin';
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar';
import { sanitizeBody, APPOINTMENTS_ALLOWED } from '@/lib/sanitize';

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
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const limitCount = parseInt(searchParams.get('limit') || '500');

    let query: any = db.collection('appointments');

    if (date) {
      query = query.where('date', '==', date);
    } else if (dateFrom && dateTo) {
      query = query.where('date', '>=', dateFrom).where('date', '<=', dateTo);
    }

    // Ocho campos y el id. Hasta 500 documentos completos por cada cambio de
    // mes en la agenda es lo que costaba antes.
    const snapshot = await query
      .select(
        'clientName', 'propertyAddress', 'date', 'time',
        'duration', 'tipo', 'status', 'googleEventLink',
      )
      .limit(limitCount)
      .get();
    const data = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[appointments GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

  try {
    const raw = await request.json();
    const body = sanitizeBody(raw, APPOINTMENTS_ALLOWED, 'appointments.POST') as any;
    const agentId = body.agentName || 'default_admin';

    // Reject appointments in the past (date is 'yyyy-MM-dd' string)
    if (body.date) {
      const today = new Date().toISOString().split('T')[0];
      if (body.date < today) {
        return NextResponse.json(
          { error: `Non è possibile creare appuntamenti nel passato. Data ricevuta: ${body.date}.` },
          { status: 400 }
        );
      }
    }

    const newAppointment = {
      ...body,
      status: body.status || 'Confermato',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('appointments').add(newAppointment);

    // Si Google falla, la cita SI queda guardada en el CRM y eso esta bien: la
    // agenda del CRM es la fuente. Lo que estaba mal es que la respuesta dijera
    // `success` a secas, sin distinguir los dos casos, asi que nadie se
    // enteraba nunca de que la cita no habia llegado al calendario compartido.
    // Con el enlace caducado desde marzo, eso es TODAS las citas.
    let enGoogle = false;
    try {
      const gcalRes = await createCalendarEvent(agentId, newAppointment);
      if (gcalRes) {
        await ref.update({ googleEventId: gcalRes.id, googleEventLink: gcalRes.htmlLink });
        enGoogle = true;
      }
    } catch (gcalError) {
      console.error('Failed to sync with Google Calendar, but saved in CRM.', gcalError);
    }

    return NextResponse.json({ success: true, id: ref.id, sincronizzatoConGoogle: enGoogle });
  } catch (error: any) {
    console.error('[appointments POST]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

  try {
    const raw = await request.json();
    const { id } = raw; // id da raw (ALWAYS_FORBIDDEN lo strappa dal sanitized)

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const updates = sanitizeBody(raw, APPOINTMENTS_ALLOWED, 'appointments.PATCH');

    // `id` viene del cuerpo EN CRUDO, igual que pasaba en /api/documenti: sin
    // sanear, un id con barras escribe en una subcoleccion arbitraria.
    let idSeguro: string;
    try {
      idSeguro = sanitizeFirestoreId(id);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    // update({ ...updates }) REEMPLAZA cualquier mapa que venga en el payload,
    // borrando los subcampos que no lleguen. Era la unica ruta de escritura sin
    // migrar a rutas de campo, y es el mismo patron que ya causo tres perdidas
    // de datos en inmuebles y clientes. buildUpdateArgs aplana a FieldPath, de
    // modo que Firestore solo toca las hojas recibidas.
    await (db.collection('appointments').doc(idSeguro).update as any)(
      ...buildUpdateArgs({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[appointments PATCH]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    // El PATCH de este mismo fichero ya saneaba el id y el DELETE no. Un id con
    // barras no apunta a un documento de `appointments`: apunta a una
    // subcoleccion arbitraria, y aqui se BORRA.
    let idSeguro: string;
    try {
      idSeguro = sanitizeFirestoreId(id);
    } catch (e: any) {
      console.warn('[appointments DELETE] id rechazado:', id, '→', e.message);
      return NextResponse.json({ error: 'ID non valido' }, { status: 400 });
    }

    const docRef = db.collection('appointments').doc(idSeguro);
    const doc = await docRef.get();

    if (!doc.exists) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });

    const apptData = doc.data() || {};
    const googleEventId = apptData.googleEventId;
    const agentId = apptData.agentName || 'default_admin';
    await docRef.delete();

    // Best-effort GCal deletion — non blocca la cancellazione CRM se fallisce.
    if (googleEventId) {
      try {
        const removed = await deleteCalendarEvent(agentId, googleEventId);
        if (!removed) {
          console.warn(`[appointments] GCal event ${googleEventId} not removed for agent ${agentId}.`);
        }
      } catch (gcalError) {
        console.error('[appointments] Failed to delete Google Calendar event:', gcalError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[appointments DELETE]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
