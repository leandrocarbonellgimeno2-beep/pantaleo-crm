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

export type SoftDeletableCollection = 'immobili' | 'clienti' | 'proprietari';

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
