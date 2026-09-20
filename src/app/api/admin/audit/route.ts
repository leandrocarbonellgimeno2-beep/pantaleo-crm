/**
 * /api/admin/audit — lectura del registro de auditoria.
 *
 * Con paginacion por CURSOR de verdad, no por offset. Esta es la unica tabla
 * del CRM que crece sin tope: cargarla entera dejaria de funcionar sola al cabo
 * de unos meses, y un offset obliga a Firestore a recorrer y facturar todo lo
 * que se salta.
 *
 * Nivel minimo: PROPIETARIO. El registro deja constancia de quien borro que y
 * quien cambio los permisos de quien; leerlo es una capacidad de control, no de
 * uso diario. Antes bastaba con secretaria.
 */
import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

const COLLECTION = '_audit_logs';
const POR_PAGINA = 50;

export async function GET(request: Request) {
  const denegado = await guard(request, 'propietario');
  if (denegado) return denegado;

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action')?.trim() || '';
    const actor = searchParams.get('actor')?.trim().toLowerCase() || '';
    const cursor = searchParams.get('cursor')?.trim() || '';

    const { db } = await import('@/lib/firebase-admin');
    let q: any = db.collection(COLLECTION);

    // Un filtro cada vez. Combinar accion y actor exigiria un tercer indice
    // compuesto para servir una consulta que en la practica nadie hace: se
    // busca "que hizo esta persona" o "quien hizo esto", casi nunca las dos.
    if (action) q = q.where('action', '==', action);
    else if (actor) q = q.where('actorEmail', '==', actor);

    q = q.orderBy('at', 'desc');

    if (cursor) {
      // Se relee el documento del cursor para poder usar startAfter con el
      // snapshot. Es el patron correcto: pasar solo el valor del campo se
      // rompe cuando dos entradas comparten el mismo instante. Cuesta una
      // lectura por pagina, que es nada comparado con un offset.
      const ancla = await db.collection(COLLECTION).doc(cursor).get();
      if (ancla.exists) q = q.startAfter(ancla);
    }

    // Se pide uno de mas para saber si hay pagina siguiente sin contar nada.
    const snap = await q.limit(POR_PAGINA + 1).get();
    const docs = snap.docs.slice(0, POR_PAGINA);
    const hayMas = snap.docs.length > POR_PAGINA;

    const data = docs.map((d: any) => {
      const x = d.data();
      return {
        id: d.id,
        at: x.at?.toMillis?.() ?? 0,
        actorEmail: x.actorEmail ?? '',
        actorRole: x.actorRole ?? '',
        action: x.action ?? '',
        target: x.target ?? null,
        changedFields: x.changedFields ?? [],
        ip: x.ip ?? '',
        outcome: x.outcome ?? 'ok',
      };
    });

    return NextResponse.json({
      data,
      nextCursor: hayMas && docs.length ? docs[docs.length - 1].id : null,
    });
  } catch (error: any) {
    console.error('[admin/audit GET]', error);
    return NextResponse.json({ error: 'Operazione non riuscita. Riprova più tardi.' }, { status: 500 });
  }
}
