import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { recountManyProprietari } from '@/lib/services/proprietari-counter';
import { extractImageUrls } from '@/lib/imageUtils';

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
  // Esta ruta está exenta del middleware de sesión (el cron de Vercel llega sin
  // cookies), así que esta comprobación es la ÚNICA barrera: sin CRON_SECRET
  // configurado, `Bearer undefined` sería una credencial válida.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron:purge-deleted] CRON_SECRET no configurado — petición rechazada');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
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

    // Set de TODOS los immobili a purgar en esta corrida. Es la clave del fix:
    // limpiamos cada cliente UNA sola vez contra este set, en vez de reescribir
    // sus arrays por cada immobile dentro del loop. Antes, la 2ª iteración usaba
    // el `c.data()` en memoria (stale, ya sin el id de la 1ª iteración) y al
    // reescribir el array completo "resucitaba" la referencia recién quitada.
    const expiredIds = new Set(expired.map(d => d.id));

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET ||
      `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const bucket = admin.storage().bucket(bucketName);

    // Collect affected proprietario IDs for a single batch recount after the loop.
    const affectedProprietariIds = new Set<string>();

    for (const doc of expired) {
      const data = doc.data();

      // Delete Storage images — fonte unica in lib/imageUtils.
      const allUrls = extractImageUrls(data);

      await Promise.allSettled(
        allUrls.map(async (url) => {
          const path = extractStoragePath(url, bucketName);
          if (!path) return;
          try { await bucket.file(path).delete(); } catch (e: any) {
            if (!e.message?.includes('No such object') && e.code !== 404) {
              errors.push(`Storage delete ${path}: ${e.message}`);
            }
          }
        })
      );

      // Delete Firestore doc
      await doc.ref.delete();

      if (data.proprietarioId) affectedProprietariIds.add(data.proprietarioId);
      purged.immobili++;
    }

    // ── Limpieza de referencias huérfanas en clienti.Matching (single-pass) ────
    // Una sola pasada DESPUÉS del loop: cada cliente se evalúa contra `expiredIds`
    // y se reescribe como máximo una vez. arrayRemove para ListaNera/Preferiti
    // (strings) y filter contra el set para Proposti (objetos con immobileId).
    // Idempotente: si no hay cambios, no se escribe.
    if (expired.length > 0) {
      try {
        const clientiSnap = await db.collection('clienti').get();
        const matchingUpdates: Promise<any>[] = [];
        for (const c of clientiSnap.docs) {
          const m = c.data().Matching ?? {};
          const origProposti  = m.Proposti  ?? [];
          const origListaNera = m.ListaNera ?? [];
          const origPreferiti = m.Preferiti ?? [];
          const proposti  = origProposti.filter((p: any) => !expiredIds.has(p.immobileId));
          const listaNera = origListaNera.filter((id: string) => !expiredIds.has(id));
          const preferiti = origPreferiti.filter((id: string) => !expiredIds.has(id));
          const changed =
            proposti.length  !== origProposti.length  ||
            listaNera.length !== origListaNera.length ||
            preferiti.length !== origPreferiti.length;
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
        errors.push(`Matching cleanup: ${e.message}`);
      }
    }

    // Batch recount tramite il service condiviso (fonte unica).
    await recountManyProprietari(affectedProprietariIds);
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

  if (errors.length > 0) {
    console.warn('[cron/purge-deleted] errors:', errors);
  }
  return NextResponse.json({ purged, errors: errors.length ? errors : [] });
}
