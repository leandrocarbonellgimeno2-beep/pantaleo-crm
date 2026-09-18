/**
 * Despublicación de un inmueble en Idealista.
 *
 * La lógica vivía atrapada dentro de POST /api/idealista/properties/deactivate,
 * así que solo se podía disparar desde el botón de la ficha. El borrado de un
 * inmueble no la tocaba: el anuncio seguía publicado —y cobrándose— después de
 * que el inmueble desapareciera del CRM.
 *
 * Aquí queda como servicio para que lo usen tanto la route como el borrado y el
 * cron de purga.
 *
 * NUNCA LANZA. El borrado del CRM no debe quedar bloqueado porque el portal
 * esté caído; quien llama decide qué hacer con el resultado.
 */
import { db, admin } from '@/lib/firebase-admin';
import { idealistaRequest } from '@/lib/idealista-auth';

export type DeactivateOutcome =
  /** Despublicado correctamente en el portal. */
  | { ok: true; changed: true }
  /** No hacía falta: nunca se publicó, o ya estaba despublicado. */
  | { ok: true; changed: false; reason: 'not-published' | 'already-deactivated' | 'not-found' }
  /** El portal falló. El inmueble SIGUE publicado. */
  | { ok: false; reason: string };

/**
 * @param propertyId  id del documento en `immobili`
 * @param propertyData datos ya leídos, para ahorrar una lectura de Firestore
 */
export async function deactivateOnIdealista(
  propertyId: string,
  propertyData?: Record<string, any>,
): Promise<DeactivateOutcome> {
  try {
    let data = propertyData;

    if (!data) {
      const snap = await db.collection('immobili').doc(propertyId).get();
      if (!snap.exists) return { ok: true, changed: false, reason: 'not-found' };
      data = snap.data() as Record<string, any>;
    }

    const idealistaId = data?.Idealista?.idealistaPropertyId;
    if (!idealistaId) return { ok: true, changed: false, reason: 'not-published' };

    if (data?.Idealista?.idealistaStatus === 'deactivated') {
      return { ok: true, changed: false, reason: 'already-deactivated' };
    }

    const result = await idealistaRequest(
      `/v1/properties/${idealistaId}/deactivate`,
      { method: 'POST' },
    );

    if (!result.ok) {
      const detail = typeof result.data === 'string'
        ? result.data.slice(0, 200)
        : JSON.stringify(result.data ?? {}).slice(0, 200);
      return { ok: false, reason: `Idealista respondió ${result.status}: ${detail}` };
    }

    // Por dot-paths, para no reemplazar el mapa Idealista entero.
    await db.collection('immobili').doc(propertyId).update({
      'Idealista.idealistaStatus': 'deactivated',
      'Idealista.idealistaLastSync': admin.firestore.FieldValue.serverTimestamp(),
      'Idealista.idealistaError': null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true, changed: true };
  } catch (error: any) {
    return { ok: false, reason: error?.message || 'Error desconocido' };
  }
}
