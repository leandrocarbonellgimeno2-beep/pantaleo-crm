/**
 * Recount degli immobili attivi per ogni proprietario.
 *
 * Il campo `numero_immobili` può divergere dal vero conteggio se:
 *  - un POST/PATCH atomic fallisce a metà
 *  - un cron purge non aggiorna il counter
 *  - una migrazione legacy lo lascia inconsistente
 *
 * Questo modulo è la fonte di verità: ri-conta partendo da Firestore e
 * scrive il numero corretto sul doc proprietario.
 *
 * Era duplicato in 4 sedi (immobili POST, immobili DELETE, cron/purge-deleted,
 * proprietari/[id]/immobili). Ora vive in un solo posto.
 */

import { db } from '@/lib/firebase-admin';

/**
 * Conta gli immobili attivi (non soft-deleted) di un singolo proprietario.
 * Usa una projection `.select('_status')` per minimizzare il transfer.
 */
export async function countActiveImmobili(proprietarioId: string): Promise<number> {
  if (!proprietarioId) return 0;
  const snap = await db
    .collection('immobili')
    .where('proprietarioId', '==', proprietarioId)
    .select('_status')
    .get();
  return snap.docs.filter(
    (d) => d.data()._status !== 'pendente_cancellazione',
  ).length;
}

/**
 * Ri-conta e scrive `numero_immobili` per il proprietario indicato.
 * Non-throwing: se l'update fallisce ritorna il vecchio comportamento
 * (counter eventualmente stale, rilevabile dal cron di reconciliation).
 */
export async function recountProprietario(proprietarioId: string): Promise<number | null> {
  if (!proprietarioId) return null;
  try {
    const count = await countActiveImmobili(proprietarioId);
    await db.collection('proprietari').doc(proprietarioId).update({
      numero_immobili: count,
    });
    return count;
  } catch (e) {
    console.warn(`[recountProprietario] failed for ${proprietarioId}:`, (e as Error).message);
    return null;
  }
}

/**
 * Bulk variante: ri-conta più proprietari in parallelo. Usata dal cron di
 * purge dopo aver eliminato fisicamente un blocco di immobili.
 */
export async function recountManyProprietari(ids: Iterable<string>): Promise<void> {
  const unique = new Set(ids);
  await Promise.all([...unique].map((id) => recountProprietario(id)));
}
