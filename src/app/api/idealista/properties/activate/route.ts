// ═══════════════════════════════════════════════════════════════
// API Route: /api/idealista/properties/activate
// Reactivates a property on Idealista
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { idealistaRequest } from '@/lib/idealista-auth';
import { db, admin } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/idealista/properties/activate
 * Body: { propertyId: string (Firestore doc ID) }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { propertyId } = body;

    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    // Fetch property from Firestore to get idealistaPropertyId
    const propDoc = await db.collection('immobili').doc(propertyId).get();
    if (!propDoc.exists) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const property = propDoc.data() as any;
    const idealistaId = property.Idealista?.idealistaPropertyId;

    if (!idealistaId) {
      return NextResponse.json(
        { error: 'Property is not published on Idealista' },
        { status: 400 }
      );
    }

    // Reactivate on Idealista
    const result = await idealistaRequest(
      `/v1/properties/${idealistaId}/activate`,
      { method: 'POST' }
    );

    // Update Firestore status
    if (result.ok) {
      await db.collection('immobili').doc(propertyId).update({
        'Idealista.idealistaStatus': 'active',
        'Idealista.idealistaLastSync': admin.firestore.FieldValue.serverTimestamp(),
        'Idealista.idealistaError': null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json(result.data, { status: result.status });
  } catch (error: any) {
    console.error('[Idealista Activate]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
