import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const { id } = params;
    
    if (!id) {
      return NextResponse.json({ error: 'ID non valido' }, { status: 400 });
    }

    await db.collection('messaggi_web').doc(id).delete();
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting messaggio:", error);
    return NextResponse.json({ error: 'Errore interno nel server' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const { id } = params;
    const body = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: 'ID non valido' }, { status: 400 });
    }

    const updateData: any = {};
    if (body.letto !== undefined) updateData.letto = body.letto;
    if (body.contattato !== undefined) updateData.contattato = body.contattato;

    await db.collection('messaggi_web').doc(id).update(updateData);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating messaggio:", error);
    return NextResponse.json({ error: 'Errore interno nel server' }, { status: 500 });
  }
}
