import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { db } from '@/lib/firebase-admin';
import { sanitizeBody, sanitizeFirestoreId, DOCUMENTI_TEMPLATE_ALLOWED } from '@/lib/sanitize';

const COLLECTION_NAME = 'documenti_template';

export async function GET(request: Request) {
  try {
    const snapshot = await db.collection(COLLECTION_NAME).orderBy('dataCreazione', 'desc').limit(200).get();
    // Esclude i soft-deleted per coerenza con immobili/clienti/proprietari.
    const data = snapshot.docs
      .filter((doc: any) => doc.data()._status !== 'pendente_cancellazione')
      .map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[documenti]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denegado = await guard(request, 'vendedor');
  if (denegado) return denegado;

  try {
    const raw = await request.json();
    const body = sanitizeBody(raw, DOCUMENTI_TEMPLATE_ALLOWED, 'documenti.POST');
    const docRef = db.collection(COLLECTION_NAME).doc();

    // id viene da raw (ALWAYS_FORBIDDEN lo strappa dal body sanitizzato), e
    // per questo era il solo valore della richiesta che arrivava a .doc()
    // senza passare da nessun controllo.
    //
    // Si conserva il fallback sui valori falsy: prima "" o 0 generavano un ID
    // automatico e devono continuare a farlo. Si valida solo quello che il
    // client manda davvero.
    let idToUse: string;
    try {
      idToUse = raw.id ? sanitizeFirestoreId(raw.id) : docRef.id;
    } catch (e: any) {
      // 400, non il 500 generico del catch esterno: il problema e nella
      // richiesta e chi la manda deve poterlo sapere.
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const finalData: any = { ...body, id: idToUse };
    if (!finalData.dataCreazione) finalData.dataCreazione = new Date().toISOString();

    await db.collection(COLLECTION_NAME).doc(idToUse).set(finalData, { merge: true });

    return NextResponse.json({ success: true, id: idToUse, data: finalData });
  } catch (error: any) {
    console.error('[documenti]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Stessa falla del POST, per una porta diversa: ?id=a/b/c cancellava un
    // documento dentro una sottocollezione arbitraria.
    let idSicuro: string;
    try {
      idSicuro = sanitizeFirestoreId(id);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    await db.collection(COLLECTION_NAME).doc(idSicuro).delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[documenti]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
