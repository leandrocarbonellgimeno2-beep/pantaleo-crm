/**
 * Soft-delete service: pattern unificato per immobili, clienti, proprietari.
 *
 * Marca un documento come `_status: 'pendente_cancellazione'` e setta il
 * timestamp `_deletedAt`. Il cron `/api/cron/purge-deleted` a mezzanotte
 * elimina fisicamente i doc che superano i 30 minuti dalla marcatura.
 *
 * Era duplicato in 3 routes (immobili DELETE, clienti DELETE, proprietari DELETE).
 */

import { db } from '@/lib/firebase-admin';
import { audit } from '@/lib/services/audit';

/**
 * `documenti_generati` entra aqui, pero NO en el cron de purga, y eso es
 * deliberado.
 *
 * Para las otras tres colecciones «soft-delete» significa «treinta minutos
 * para deshacer y luego se borra de verdad». Para un folio de visita firmado
 * no puede significar eso: es un documento con la firma manuscrita del
 * cliente, respalda una provvigione y no debe desaparecer nunca.
 *
 * Asi que aqui marcar es el final del camino: el documento deja de verse en la
 * pantalla —los dos GET ya filtran `pendente_cancellazione`— y se queda en
 * Firestore, con su PDF intacto en Storage.
 *
 * SI ALGUIEN AÑADE ESTA COLECCION AL CRON DE PURGA, ROMPE ESA GARANTIA.
 * Purgar aqui borraria folios firmados a los treinta minutos, que es
 * exactamente lo que este cambio vino a impedir.
 */
export type SoftDeletableCollection =
  | 'immobili'
  | 'clienti'
  | 'proprietari'
  | 'documenti_generati';

/**
 * Quien borra. El parametro es OBLIGATORIO a proposito.
 *
 * Esta funcion es el unico cuello de botella real de los borrados de
 * negocio: los tres pasan por aqui. Si la identidad fuera opcional, bastaria
 * con que alguien se la dejara para que ese borrado no quedara registrado en
 * ninguna parte, y un registro de auditoria con agujeros no es un registro.
 */
export interface ActorBorrado {
  email: string;
  role: string;
  ip?: string;
  /** Etiqueta legible del documento; sobrevive al borrado fisico. */
  label?: string;
}

/**
 * Marca un documento come "in attesa di cancellazione". Il documento resta
 * presente in Firestore per ~30 minuti (TTL del cron) per permettere undo.
 */
export async function markForSoftDelete(
  collection: SoftDeletableCollection,
  docId: string,
  actor: ActorBorrado,
): Promise<void> {
  await db.collection(collection).doc(docId).update({
    _status: 'pendente_cancellazione',
    _deletedAt: Date.now(),
  });

  audit({
    actorEmail: actor.email,
    actorRole: actor.role,
    action: `${collection}.delete`,
    target: { collection, id: docId, label: actor.label },
    ip: actor.ip,
  });
}
