import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { createCalendarEvent } from '@/lib/google-calendar';

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
  try {
    const body = await request.json();
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
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

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
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const docRef = db.collection('appointments').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });

    const googleEventId = doc.data()?.googleEventId;
    await docRef.delete();

    // Best-effort GCal deletion — no delete function in google-calendar.ts yet, log for visibility
    if (googleEventId) {
      console.info(`[appointments] Deleted Firestore doc ${id}; GCal event ${googleEventId} requires manual removal.`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[appointments DELETE]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
