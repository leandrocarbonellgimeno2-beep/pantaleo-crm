import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function extractStoragePath(url: string, bucketName: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'storage.googleapis.com') {
      return decodeURIComponent(u.pathname.replace(`/${bucketName}/`, '').split('?')[0]);
    }
    if (u.hostname === 'firebasestorage.googleapis.com') {
      const part = u.pathname.split('/o/')[1];
      return part ? decodeURIComponent(part.split('?')[0]) : null;
    }
    return null;
  } catch { return null; }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = Date.now() - THIRTY_MINUTES_MS;
  const errors: string[] = [];
  const purged = { immobili: 0, proprietari: 0, clienti: 0 };

  // ── 1. Purge immobili ─────────────────────────────────────────────────────
  try {
    const snap = await db.collection('immobili')
      .where('_status', '==', 'pendente_cancellazione')
      .get();

    const expired = snap.docs.filter(d => (d.data()._deletedAt ?? 0) < cutoff);

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET ||
      `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const bucket = admin.storage().bucket(bucketName);

    // Hoist clienti fetch once before the loop — only if there's something to purge.
    // Avoids downloading 453 client docs on nights when nothing is pending.
    const clientiSnap = expired.length > 0
      ? await db.collection('clienti').get()
      : { docs: [] as any[] };

    // Collect affected proprietario IDs for a single batch recount after the loop.
    const affectedProprietariIds = new Set<string>();

    for (const doc of expired) {
      const data = doc.data();

      // Delete Storage images
      const allUrls: string[] = [
        ...(Array.isArray(data.images)          ? data.images          : []),
        ...(Array.isArray(data.Media?.Immagini)  ? data.Media.Immagini  : []),
        ...(Array.isArray(data.Media?.Urls)      ? data.Media.Urls      : []),
        ...(Array.isArray(data.Immagini)         ? data.Immagini        : []),
        ...(Array.isArray(data.DatiBase?.Foto)   ? data.DatiBase.Foto   : []),
        ...(typeof data.thumbnail === 'string' && data.thumbnail ? [data.thumbnail] : []),
      ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'));

      await Promise.allSettled(
        [...new Set(allUrls)].map(async (url) => {
          const path = extractStoragePath(url, bucketName);
          if (!path) return;
          try { await bucket.file(path).delete(); } catch (e: any) {
            if (!e.message?.includes('No such object') && e.code !== 404) {
              errors.push(`Storage delete ${path}: ${e.message}`);
            }
          }
        })
      );

      // Clean orphan refs in clienti.Matching — uses the hoisted snapshot.
      try {
        const matchingUpdates: Promise<any>[] = [];
        for (const c of clientiSnap.docs) {
          const m = c.data().Matching ?? {};
          const proposti  = (m.Proposti  ?? []).filter((p: any) => p.immobileId !== doc.id);
          const listaNera = (m.ListaNera ?? []).filter((id: string) => id !== doc.id);
          const preferiti = (m.Preferiti ?? []).filter((id: string) => id !== doc.id);
          const changed =
            proposti.length  !== (m.Proposti  ?? []).length ||
            listaNera.length !== (m.ListaNera ?? []).length ||
            preferiti.length !== (m.Preferiti ?? []).length;
          if (changed) {
            matchingUpdates.push(
              db.collection('clienti').doc(c.id).update({
                'Matching.Proposti':  proposti,
                'Matching.ListaNera': listaNera,
                'Matching.Preferiti': preferiti,
              })
            );
          }
        }
        await Promise.all(matchingUpdates);
      } catch (e: any) {
        errors.push(`Matching cleanup for ${doc.id}: ${e.message}`);
      }

      // Delete Firestore doc
      await doc.ref.delete();

      if (data.proprietarioId) affectedProprietariIds.add(data.proprietarioId);
      purged.immobili++;
    }

    // Batch recount all affected proprietari in parallel (one query per owner, not per immobile).
    await Promise.all([...affectedProprietariIds].map(async (pid) => {
      try {
        const remainingSnap = await db.collection('immobili')
          .where('proprietarioId', '==', pid)
          .select('_status')
          .get();
        const activeCount = remainingSnap.docs.filter(
          (d: any) => d.data()._status !== 'pendente_cancellazione'
        ).length;
        await db.collection('proprietari').doc(pid).update({ numero_immobili: activeCount });
      } catch (e: any) {
        errors.push(`Proprietario recount ${pid}: ${e.message}`);
      }
    }));
  } catch (e: any) {
    errors.push(`immobili query: ${e.message}`);
  }

  // ── 2. Purge proprietari ──────────────────────────────────────────────────
  try {
    const snap = await db.collection('proprietari')
      .where('_status', '==', 'pendente_cancellazione')
      .get();
    const expired = snap.docs.filter(d => (d.data()._deletedAt ?? 0) < cutoff);
    await Promise.all(expired.map(d => d.ref.delete()));
    purged.proprietari = expired.length;
  } catch (e: any) {
    errors.push(`proprietari query: ${e.message}`);
  }

  // ── 3. Purge clienti ──────────────────────────────────────────────────────
  try {
    const snap = await db.collection('clienti')
      .where('_status', '==', 'pendente_cancellazione')
      .get();
    const expired = snap.docs.filter(d => (d.data()._deletedAt ?? 0) < cutoff);
    await Promise.all(expired.map(d => d.ref.delete()));
    purged.clienti = expired.length;
  } catch (e: any) {
    errors.push(`clienti query: ${e.message}`);
  }

  console.log('[cron/purge-deleted]', purged, errors.length ? errors : 'no errors');
  return NextResponse.json({ purged, errors: errors.length ? errors : [] });
}
