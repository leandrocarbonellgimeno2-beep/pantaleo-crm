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

export type SoftDeletableCollection = 'immobili' | 'clienti' | 'proprietari';

/**
 * Marca un documento come "in attesa di cancellazione". Il documento resta
 * presente in Firestore per ~30 minuti (TTL del cron) per permettere undo.
 */
export async function markForSoftDelete(
  collection: SoftDeletableCollection,
  docId: string,
): Promise<void> {
  await db.collection(collection).doc(docId).update({
    _status: 'pendente_cancellazione',
    _deletedAt: Date.now(),
  });
}
