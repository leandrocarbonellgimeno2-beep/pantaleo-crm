import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { recountManyProprietari } from '@/lib/services/proprietari-counter';
import { extractImageUrls } from '@/lib/imageUtils';
import { deactivateOnIdealista } from '@/lib/services/idealista-deactivate';
import { extraerRutaDeUrl } from '@/lib/storage-urls';
import { audit } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

// La lectura de rutas vive ahora en lib/storage-urls.ts y entiende tambien la
// forma privada /api/files?path=. Es imprescindible aqui: esta funcion es la
// que decide que fichero se borra del bucket al purgar un inmueble, y una URL
// que no sepa leer deja el fichero huerfano para siempre.
const extractStoragePath = extraerRutaDeUrl;

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
  // Inmuebles que NO se purgan porque Idealista no los pudo despublicar.
  let skippedByIdealista = 0;

  // ── 1. Purge immobili ─────────────────────────────────────────────────────
  try {
    const snap = await db.collection('immobili')
      .where('_status', '==', 'pendente_cancellazione')
      .get();

    const expired = snap.docs.filter(d => (d.data()._deletedAt ?? 0) < cutoff);

    // Set de los immobili REALMENTE purgados en esta corrida. Con él limpiamos
    // cada cliente UNA sola vez, en vez de reescribir sus arrays por cada
    // immobile dentro del loop: antes, la 2ª iteración usaba el `c.data()` en
    // memoria (stale, ya sin el id de la 1ª) y al reescribir el array completo
    // "resucitaba" la referencia recién quitada.
    //
    // Se rellena DENTRO del loop, no desde `expired`: ahora un documento puede
    // saltarse si Idealista no lo despublica, y limpiar las referencias de un
    // inmueble que sigue existiendo lo dejaría huérfano en los Matching.
    const expiredIds = new Set<string>();

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET ||
      `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    const bucket = admin.storage().bucket(bucketName);

    // Collect affected proprietario IDs for a single batch recount after the loop.
    const affectedProprietariIds = new Set<string>();

    for (const doc of expired) {
      const data = doc.data();

      // Último punto en el que existe idealistaPropertyId: al borrar el
      // documento se pierde y el anuncio queda huérfano para siempre, sin
      // forma de bajarlo desde el CRM. Si el portal falla, se salta este
      // documento entero —ni fotos ni doc— y el cron de mañana lo reintenta.
      // Va antes de borrar las imágenes: despublicar después dejaría un
      // anuncio vivo con las fotos rotas.
      const idealista = await deactivateOnIdealista(doc.id, data);
      if (!idealista.ok) {
        errors.push(`Idealista deactivate ${doc.id}: ${idealista.reason}`);
        skippedByIdealista++;
        continue;
      }

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

      expiredIds.add(doc.id);
      if (data.proprietarioId) affectedProprietariIds.add(data.proprietarioId);
      purged.immobili++;
    }

    // ── Limpieza de referencias huérfanas en clienti.Matching (single-pass) ────
    // Una sola pasada DESPUÉS del loop: cada cliente se evalúa contra `expiredIds`
    // y se reescribe como máximo una vez. arrayRemove para ListaNera/Preferiti
    // (strings) y filter contra el set para Proposti (objetos con immobileId).
    // Idempotente: si no hay cambios, no se escribe.
    if (expiredIds.size > 0) {
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
  if (skippedByIdealista > 0) {
    console.warn(
      `[cron/purge-deleted] ${skippedByIdealista} immobili NO purgados: Idealista no los despublicó. ` +
      'Siguen pendientes y se reintentarán en la próxima ejecución.',
    );
  }

  // Rastro auditable en los logs de Vercel. La respuesta HTTP no vale para
  // esto: cuando invoca el cron programado, Vercel descarta el cuerpo, y sus
  // logs de petición tampoco lo capturan. Sin esta línea, un borrado
  // irreversible de documentos y de ficheros de Storage no deja constancia
  // ninguna de cuánto se llevó por delante.
  //
  // Se emite SIEMPRE, incluso con todo a cero: saber que el cron corrió y no
  // encontró nada que purgar es tan informativo como saber que borró 40 cosas.
  console.log(
    '[cron/purge-deleted] resultado:',
    JSON.stringify({
      purged,
      totalPurged: purged.immobili + purged.proprietari + purged.clienti,
      skippedByIdealista,
      errorCount: errors.length,
    }),
  );

  // El cron borra FISICAMENTE y lo hace en un GET: es una de las dos
  // operaciones mas destructivas del sistema y no tiene sesion detras, asi
  // que el actor es el propio cron. Sin este registro, un borrado
  // irreversible no deja constancia en ninguna parte.
  audit({
    actorEmail: 'cron@sistema',
    actorRole: 'sistema',
    action: 'cron.purge',
    changedFields: [
      `immobili:${purged.immobili}`,
      `proprietari:${purged.proprietari}`,
      `clienti:${purged.clienti}`,
      `skippedByIdealista:${skippedByIdealista}`,
    ],
    outcome: errors.length ? 'error' : 'ok',
  });

  return NextResponse.json({
    purged,
    skippedByIdealista,
    errors: errors.length ? errors : [],
  });
}
