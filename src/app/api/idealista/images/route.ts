// ═══════════════════════════════════════════════════════════════
// API Route: /api/idealista/images
// Proxy for Idealista Image management
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { idealistaRequest } from '@/lib/idealista-auth';
import { mapImagesToIdealista } from '@/lib/idealista-mapper';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/idealista/images
 * Upload/update images for a property on Idealista.
 * Body: { 
 *   propertyId: string (Firestore doc ID),
 *   images?: Array<{ url: string, label?: string, order?: number }>,
 *   labels?: string[]
 * }
 * 
 * If images array is not provided, uses the property's existing images from Firestore.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { propertyId, images, labels } = body;

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
        { error: 'Property is not published on Idealista. Publish first.' },
        { status: 400 }
      );
    }

    // Build image payload
    let imagePayload;
    if (images) {
      // Use provided images directly
      imagePayload = images;
    } else {
      // Use images from Firestore
      const propertyImages = property.images || [];
      imagePayload = mapImagesToIdealista(propertyImages, labels);
    }

    const result = await idealistaRequest(
      `/v1/properties/${idealistaId}/images`,
      {
        method: 'PUT',
        body: JSON.stringify(imagePayload),
      }
    );

    return NextResponse.json(result.data, { status: result.status });
  } catch (error: any) {
    console.error('[Idealista Images PUT]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/idealista/images?propertyId=xxx
 * Fetches all images for a property from Idealista.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');

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
      return NextResponse.json({ error: 'Property not published on Idealista' }, { status: 400 });
    }

    const result = await idealistaRequest(
      `/v1/properties/${idealistaId}/images`,
      { method: 'GET' }
    );

    return NextResponse.json(result.data, { status: result.status });
  } catch (error: any) {
    console.error('[Idealista Images GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/idealista/images
 * Deletes all images for a property on Idealista.
 * Body: { propertyId: string (Firestore doc ID) }
 */
export async function DELETE(request: Request) {
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
      return NextResponse.json({ error: 'Property not published on Idealista' }, { status: 400 });
    }

    const result = await idealistaRequest(
      `/v1/properties/${idealistaId}/images`,
      { method: 'DELETE' }
    );

    return NextResponse.json(result.data, { status: result.status });
  } catch (error: any) {
    console.error('[Idealista Images DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
