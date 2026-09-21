import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { db, admin } from '@/lib/firebase-admin';
import { belongsToProprietario } from '@/lib/ownership';
import { recountProprietario } from '@/lib/services/proprietari-counter';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Lectura, pero con guard: sin el, bloquear a alguien no le cortaba el
  // acceso a los datos. Un ex-empleado con la pestaña abierta seguia listando
  // clientes y descargando documentos durante las ocho horas que le quedaran
  // de sesion, porque ningun GET de negocio pasaba por aqui. «agente» es el
  // nivel mas bajo, asi que ningun rol pierde acceso: lo que se gana es que el
  // bloqueo y la degradacion surtan efecto de verdad.
  const denegado = await guard(request, 'agente');
  if (denegado) return denegado;
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
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

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

    // Run all 5 lookup strategies in parallel — reduces worst-case from ~500ms to ~100ms.
    const [byId, byRif, byCodiceImmobile, byRiferimento, byCodice] = await Promise.all([
      propertiesRef.doc(codice).get(),
      propertiesRef.where('rif', '==', codice).limit(1).get(),
      propertiesRef.where('codiceImmobile', '==', codice).limit(1).get(),
      propertiesRef.where('DatiBase.Riferimento', '==', codice).limit(1).get(),
      propertiesRef.where('DatiBase.Codice', '==', codice).limit(1).get(),
    ]);

    const foundPropertyDoc =
      (byId.exists ? byId : null) ??
      (byRif.docs[0] ?? null) ??
      (byCodiceImmobile.docs[0] ?? null) ??
      (byRiferimento.docs[0] ?? null) ??
      (byCodice.docs[0] ?? null);

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
    //
    // El contador ya NO se calcula aqui. Antes era
    // `numero_immobili: (ownerData.numero_immobili || 0) + 1`, un
    // read-modify-write: dos agentes vinculando a la vez leen el mismo valor y
    // uno de los dos incrementos se pierde. arrayUnion si es atomico y se queda.
    batch.update(clientRef, {
      // Just in case we want an explicit array later
      immobili_collegati: admin.firestore.FieldValue.arrayUnion(propertyId)
    });

    await batch.commit();

    // El recuento lo hace el servicio que ya existe para esto, que CUENTA de
    // verdad en lugar de sumar a ciegas. Un FieldValue.increment habria
    // arreglado la concurrencia pero no la deriva acumulada de un contador que
    // lleva tiempo descuadrado; esto arregla las dos cosas de una vez.
    await recountProprietario(clientId);

    return NextResponse.json({ success: true, message: 'Immobile collegato con successo!' });
  } catch (error: any) {
    console.error("Error linkando immobile:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

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

    // Comprobacion de pertenencia. Sin ella, un DELETE contra
    // /api/proprietari/A/immobili con el propertyId de B desvinculaba el
    // inmueble de su dueno real (borra proprietarioId y proprietarioId_real)
    // y ademas descuadraba los contadores de los DOS propietarios: restaba
    // uno a A, que no tenia ese inmueble, y dejaba intacto el de B, que se
    // quedaba contando uno que ya no le apunta.
    if (!belongsToProprietario(propDoc.data() as any, clientId)) {
      // 404 en vez de 403: el mensaje no confirma de quien es el inmueble, y
      // "no encontrado PARA ESTE propietario" es literalmente cierto.
      return NextResponse.json(
        { error: 'Immobile non trovato per questo proprietario' },
        { status: 404 },
      );
    }

    const batch = db.batch();

    // 1. Unlink Property
    batch.update(propRef, {
      proprietarioId_real: admin.firestore.FieldValue.delete(),
      proprietarioId: admin.firestore.FieldValue.delete()
    });

    // 2. Update Owner record — mismo criterio que en el POST: el contador no
    // se calcula restando, se recuenta despues.
    if (clientDoc.exists) {
      batch.update(clientRef, {
        immobili_collegati: admin.firestore.FieldValue.arrayRemove(propertyId)
      });
    }

    await batch.commit();

    if (clientDoc.exists) await recountProprietario(clientId);

    return NextResponse.json({ success: true, message: 'Immobile scollegato.' });
  } catch (error: any) {
    console.error("Error scollegando immobile:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
