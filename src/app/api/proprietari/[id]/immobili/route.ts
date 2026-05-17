import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params;
    if (!clientId) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const clientDoc = await db.collection('proprietari').doc(clientId).get();
    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Proprietario non trovato' }, { status: 404 });
    }

    const client: any = { id: clientDoc.id, ...clientDoc.data() };
    // Nueva consulta directa, rápida y estricta:
    // Traemos de Firestore solo aquellos inmuebles que nuestro script vinculó exitosamente.
    const propertiesRef = db.collection('immobili');
    const qs = await propertiesRef.where('proprietarioId_real', '==', clientId).get();
    
    // Si la migración aún está pendiente para algunos o queremos un fallback súper seguro
    // añadiremos un OR en memoria solo si el primero falla, o directamente lo dejamos puramente como solicitaste.
    // Atendiendo a la instrucción: solo hacer where('proprietarioId_real', '==', params.id)
    
    let immobiliList: any[] = [];
    qs.forEach(doc => immobiliList.push({ id: doc.id, ...doc.data() }));

    // Si resulta que la db aún no se ha migrado para alguien particular, 
    // mantenemos un brevísimo salvavidas con el viejo proprietarioId por las dudas, pero la fuente de verdad es la nueva.
    if (immobiliList.length === 0) {
        const fallQs = await propertiesRef.where('proprietarioId', '==', clientId).get();
        fallQs.forEach(doc => immobiliList.push({ id: doc.id, ...doc.data() }));
    }

    return NextResponse.json(immobiliList);

  } catch (error: any) {
    console.error("Error cargando immobili del cliente:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params;
    const body = await request.json();
    const { codice } = body;

    if (!clientId) return NextResponse.json({ error: 'Missing client ID' }, { status: 400 });
    if (!codice) return NextResponse.json({ error: 'Codice immobile mancante' }, { status: 400 });

    const clientRef = db.collection('proprietari').doc(clientId);
    const clientDoc = await clientRef.get();
    
    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Proprietario non trovato' }, { status: 404 });
    }

    const propertiesRef = db.collection('immobili');
    
    // Attempt to find by ID, codiceImmobile, or rif
    let foundPropertyDoc = null;

    // Check by ID first
    const byIdDoc = await propertiesRef.doc(codice).get();
    if (byIdDoc.exists) foundPropertyDoc = byIdDoc;
    
    if (!foundPropertyDoc) {
      const qsRif = await propertiesRef.where('rif', '==', codice).get();
      if (!qsRif.empty) foundPropertyDoc = qsRif.docs[0];
    }
    
    if (!foundPropertyDoc) {
      const qsCodice = await propertiesRef.where('codiceImmobile', '==', codice).get();
      if (!qsCodice.empty) foundPropertyDoc = qsCodice.docs[0];
    }
    
    if (!foundPropertyDoc) {
      // In old schema, it might be nested
      const qsDatiBaseRif = await propertiesRef.where('DatiBase.Riferimento', '==', codice).get();
      if (!qsDatiBaseRif.empty) foundPropertyDoc = qsDatiBaseRif.docs[0];
    }
    if (!foundPropertyDoc) {
      // Very loose match - note: DatiBase.Codice is also common
      const qsDatiBaseCod = await propertiesRef.where('DatiBase.Codice', '==', codice).get();
      if (!qsDatiBaseCod.empty) foundPropertyDoc = qsDatiBaseCod.docs[0];
    }

    if (!foundPropertyDoc) {
      return NextResponse.json({ error: 'Immobile non trovato con questo codice.' }, { status: 404 });
    }

    const propertyId = foundPropertyDoc.id;

    // Execute updates
    const batch = db.batch();
    
    // 1. Update Property
    batch.update(foundPropertyDoc.ref, {
      proprietarioId_real: clientId,
      proprietarioId: clientId // for legacy compatibility
    });

    // 2. Update Owner record
    const ownerData = clientDoc.data() as any;
    const currentImmobiliCount = ownerData.numero_immobili || 0;
    
    batch.update(clientRef, {
      numero_immobili: currentImmobiliCount + 1,
      // Just in case we want an explicit array later
      immobili_collegati: admin.firestore.FieldValue.arrayUnion(propertyId)
    });

    await batch.commit();

    return NextResponse.json({ success: true, message: 'Immobile collegato con successo!' });
  } catch (error: any) {
    console.error("Error linkando immobile:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await params;
    const body = await request.json();
    const { propertyId } = body;

    if (!clientId) return NextResponse.json({ error: 'Missing client ID' }, { status: 400 });
    if (!propertyId) return NextResponse.json({ error: 'Missing property ID' }, { status: 400 });

    const clientRef = db.collection('proprietari').doc(clientId);
    const clientDoc = await clientRef.get();
    
    const propRef = db.collection('immobili').doc(propertyId);
    const propDoc = await propRef.get();

    if (!propDoc.exists) {
      return NextResponse.json({ error: 'Immobile non trovato' }, { status: 404 });
    }

    const batch = db.batch();

    // 1. Unlink Property
    batch.update(propRef, {
      proprietarioId_real: admin.firestore.FieldValue.delete(),
      proprietarioId: admin.firestore.FieldValue.delete()
    });

    // 2. Update Owner record
    if (clientDoc.exists) {
      const ownerData = clientDoc.data() as any;
      const currentImmobiliCount = Math.max((ownerData.numero_immobili || 1) - 1, 0);
      batch.update(clientRef, {
        numero_immobili: currentImmobiliCount,
        immobili_collegati: admin.firestore.FieldValue.arrayRemove(propertyId)
      });
    }

    await batch.commit();

    return NextResponse.json({ success: true, message: 'Immobile scollegato.' });
  } catch (error: any) {
    console.error("Error scollegando immobile:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
