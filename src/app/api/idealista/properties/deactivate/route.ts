// ═══════════════════════════════════════════════════════════════
// API Route: /api/idealista/properties/deactivate
// Deactivates a property on Idealista
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { deactivateOnIdealista } from '@/lib/services/idealista-deactivate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/idealista/properties/deactivate
 * Body: { propertyId: string (Firestore doc ID) }
 *
 * La lógica vive en src/lib/services/idealista-deactivate.ts porque el borrado
 * de un inmueble y el cron de purga necesitan despublicar sin pasar por HTTP.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { propertyId } = body;

    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const result = await deactivateOnIdealista(propertyId);

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 502 });
    }

    if (!result.changed) {
      // Se conserva el 404 y el 400 que el frontend ya distinguía.
      if (result.reason === 'not-found') {
        return NextResponse.json({ error: 'Property not found' }, { status: 404 });
      }
      if (result.reason === 'not-published') {
        return NextResponse.json(
          { error: 'Property is not published on Idealista' },
          { status: 400 },
        );
      }
      // already-deactivated: no es un error, ya está en el estado deseado.
      return NextResponse.json({ success: true, alreadyDeactivated: true });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Idealista Deactivate]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
