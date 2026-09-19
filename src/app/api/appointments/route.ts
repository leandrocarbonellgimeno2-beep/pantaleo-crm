import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { db, admin } from '@/lib/firebase-admin';
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar';
import { sanitizeBody, APPOINTMENTS_ALLOWED } from '@/lib/sanitize';

export async function GET(request: Request) {
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

    const snapshot = await query.limit(limitCount).get();
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

    try {
      const gcalRes = await createCalendarEvent(agentId, newAppointment);
      if (gcalRes) {
        await ref.update({ googleEventId: gcalRes.id, googleEventLink: gcalRes.htmlLink });
      }
    } catch (gcalError) {
      console.error('Failed to sync with Google Calendar, but saved in CRM.', gcalError);
    }

    return NextResponse.json({ success: true, id: ref.id });
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

    await db.collection('appointments').doc(id).update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

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

    const docRef = db.collection('appointments').doc(id);
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
