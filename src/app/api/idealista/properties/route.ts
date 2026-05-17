// ═══════════════════════════════════════════════════════════════
// API Route: /api/idealista/properties
// Proxy for Idealista Property CRUD
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { idealistaRequest } from '@/lib/idealista-auth';
import { mapPropertyToIdealista, mapProprietarioToContact, getAgencyFallbackContact } from '@/lib/idealista-mapper';
import { db, admin } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/idealista/properties
 * Publishes a CRM property to Idealista.
 * 
 * Body: { 
 *   propertyId: string (Firestore doc ID),
 *   scope?: 'idealista' | 'microsite',
 *   visibility?: 'full' | 'street' | 'hidden'
 * }
 * 
 * Flow:
 * 1. Fetch property + owner from Firestore
 * 2. Ensure contact exists on Idealista (create if needed)
 * 3. Map property data to Idealista payload
 * 4. POST to Idealista API
 * 5. Save idealistaPropertyId back to Firestore
 */
// ── Helper: Parse Idealista error responses into human-readable messages ──
function parseIdealistaError(data: any): string {
  if (!data) return 'Errore sconosciuto dalla API Idealista';
  
  // Idealista sometimes returns validation errors as an array
  if (Array.isArray(data)) {
    return data
      .map((e: any) => e.message || e.error || JSON.stringify(e))
      .join('; ');
  }
  
  // Standard error object: { error: "...", error_description: "..." }
  if (data.error_description) return data.error_description;
  if (data.error && typeof data.error === 'string') return data.error;
  
  // Validation errors: { errors: [{ field: "...", message: "..." }] }
  if (data.errors && Array.isArray(data.errors)) {
    return data.errors
      .map((e: any) => `${e.field || 'campo'}: ${e.message || e.defaultMessage || 'non valido'}`)
      .join('; ');
  }
  
  // Message field
  if (data.message) return data.message;
  
  // Fallback: stringify the whole thing
  return JSON.stringify(data);
}

/**
 * POST /api/idealista/properties
 * Publishes a CRM property to Idealista.
 * 
 * Body: { 
 *   propertyId: string (Firestore doc ID),
 *   scope?: 'idealista' | 'microsite',
 *   visibility?: 'full' | 'street' | 'hidden'
 * }
 * 
 * Flow:
 * 1. Fetch property + owner from Firestore
 * 2. Ensure contact exists on Idealista (create if needed)
 * 3. Map property data to Idealista payload
 * 4. POST to Idealista API
 * 5. Save idealistaPropertyId back to Firestore
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { propertyId, scope, visibility } = body;

    if (!propertyId) {
      return NextResponse.json(
        { error: 'propertyId è obbligatorio', idealistaStatus: 'error' },
        { status: 400 }
      );
    }

    // 1. Fetch property from Firestore
    const propDoc = await db.collection('immobili').doc(propertyId).get();
    if (!propDoc.exists) {
      return NextResponse.json(
        { error: 'Immobile non trovato nel database', idealistaStatus: 'error' },
        { status: 404 }
      );
    }
    const property = { id: propDoc.id, ...propDoc.data() } as any;

    // 2. Ensure contact exists on Idealista
    let contactId: string | null = null;

    // Check if owner already has an Idealista contact
    if (property.proprietarioId) {
      const ownerDoc = await db.collection('proprietari').doc(property.proprietarioId).get();
      if (ownerDoc.exists) {
        const ownerData = ownerDoc.data() as any;
        
        if (ownerData.idealistaContactId) {
          // Contact already exists
          contactId = ownerData.idealistaContactId;
        } else {
          // Create new contact on Idealista
          const contactPayload = mapProprietarioToContact(ownerData);
          
          if (!contactPayload.email) {
            // Owner has no email — use agency fallback
            const fallback = getAgencyFallbackContact();
            const contactRes = await idealistaRequest('/v1/contacts', {
              method: 'POST',
              body: JSON.stringify(fallback),
            });
            if (!contactRes.ok) {
              const errMsg = parseIdealistaError(contactRes.data);
              return NextResponse.json(
                { error: `Errore creazione contatto agenzia: ${errMsg}`, details: contactRes.data, idealistaStatus: 'error' },
                { status: contactRes.status }
              );
            }
            contactId = contactRes.data.contactId;
          } else {
            const contactRes = await idealistaRequest('/v1/contacts', {
              method: 'POST',
              body: JSON.stringify(contactPayload),
            });
            if (!contactRes.ok) {
              const errMsg = parseIdealistaError(contactRes.data);
              return NextResponse.json(
                { error: `Errore creazione contatto proprietario: ${errMsg}`, details: contactRes.data, idealistaStatus: 'error' },
                { status: contactRes.status }
              );
            }
            contactId = contactRes.data.contactId;

            // Save contactId to owner
            await db.collection('proprietari').doc(property.proprietarioId).update({
              idealistaContactId: contactId,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      }
    }

    // If still no contact (no owner linked), create agency fallback
    if (!contactId) {
      const fallback = getAgencyFallbackContact();
      const contactRes = await idealistaRequest('/v1/contacts', {
        method: 'POST',
        body: JSON.stringify(fallback),
      });
      if (!contactRes.ok) {
        const errMsg = parseIdealistaError(contactRes.data);
        return NextResponse.json(
          { error: `Errore creazione contatto agenzia: ${errMsg}`, details: contactRes.data, idealistaStatus: 'error' },
          { status: contactRes.status }
        );
      }
      contactId = contactRes.data.contactId;
    }

    // 3. Map property to Idealista payload
    const payload = mapPropertyToIdealista(property, contactId!, { scope, visibility });

    // 4. POST to Idealista
    const result = await idealistaRequest('/v1/properties', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    // 5. Handle response and update Firestore
    if (result.ok && result.data?.propertyId) {
      await db.collection('immobili').doc(propertyId).update({
        'Idealista.idealistaPropertyId': result.data.propertyId,
        'Idealista.idealistaContactId': contactId,
        'Idealista.idealistaStatus': 'active',
        'Idealista.idealistaLastSync': admin.firestore.FieldValue.serverTimestamp(),
        'Idealista.idealistaError': null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return NextResponse.json(
        {
          idealistaPropertyId: result.data.propertyId,
          idealistaStatus: 'active',
          message: 'Immobile pubblicato su Idealista con successo',
        },
        { status: result.status }
      );
    } else {
      // Parse the error and save to Firestore
      const errMsg = parseIdealistaError(result.data);
      
      await db.collection('immobili').doc(propertyId).update({
        'Idealista.idealistaStatus': 'error',
        'Idealista.idealistaError': errMsg,
        'Idealista.idealistaLastSync': admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return NextResponse.json(
        {
          error: `Idealista ha rifiutato la pubblicazione: ${errMsg}`,
          details: result.data,
          idealistaStatus: 'error',
          payloadSent: payload,
        },
        { status: result.status }
      );
    }
  } catch (error: any) {
    console.error('[Idealista Properties POST]', error);
    return NextResponse.json(
      { error: `Errore del server: ${error.message}`, idealistaStatus: 'error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/idealista/properties
 * Updates a property on Idealista.
 * Body: { propertyId: string (Firestore doc ID) }
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { propertyId, scope, visibility } = body;

    if (!propertyId) {
      return NextResponse.json(
        { error: 'propertyId è obbligatorio', idealistaStatus: 'error' },
        { status: 400 }
      );
    }

    // Fetch property from Firestore
    const propDoc = await db.collection('immobili').doc(propertyId).get();
    if (!propDoc.exists) {
      return NextResponse.json(
        { error: 'Immobile non trovato nel database', idealistaStatus: 'error' },
        { status: 404 }
      );
    }
    const property = { id: propDoc.id, ...propDoc.data() } as any;
    const idealistaId = property.Idealista?.idealistaPropertyId;
    const contactId = property.Idealista?.idealistaContactId;

    if (!idealistaId) {
      return NextResponse.json(
        { error: 'Immobile non ancora pubblicato su Idealista — pubblicalo prima', idealistaStatus: 'error' },
        { status: 400 }
      );
    }

    if (!contactId) {
      return NextResponse.json(
        { error: 'Contatto Idealista mancante — ripubblica l\'immobile', idealistaStatus: 'error' },
        { status: 400 }
      );
    }

    // Map and send update
    const payload = mapPropertyToIdealista(property, contactId, { scope, visibility });

    const result = await idealistaRequest(`/v1/properties/${idealistaId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    // Update sync status
    const errMsg = result.ok ? null : parseIdealistaError(result.data);
    
    await db.collection('immobili').doc(propertyId).update({
      'Idealista.idealistaLastSync': admin.firestore.FieldValue.serverTimestamp(),
      'Idealista.idealistaStatus': result.ok ? 'active' : 'error',
      'Idealista.idealistaError': errMsg,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (result.ok) {
      return NextResponse.json(
        { message: 'Immobile aggiornato su Idealista con successo', idealistaStatus: 'active' },
        { status: result.status }
      );
    } else {
      return NextResponse.json(
        { error: `Errore aggiornamento Idealista: ${errMsg}`, details: result.data, idealistaStatus: 'error' },
        { status: result.status }
      );
    }
  } catch (error: any) {
    console.error('[Idealista Properties PUT]', error);
    return NextResponse.json(
      { error: `Errore del server: ${error.message}`, idealistaStatus: 'error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/idealista/properties?idealistaPropertyId=xxx OR ?page=0&size=20
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idealistaPropertyId = searchParams.get('idealistaPropertyId');
    const page = searchParams.get('page') || '0';
    const size = searchParams.get('size') || '20';

    const path = idealistaPropertyId
      ? `/v1/properties/${idealistaPropertyId}`
      : `/v1/properties?page=${page}&size=${size}`;

    const result = await idealistaRequest(path, { method: 'GET' });
    return NextResponse.json(result.data, { status: result.status });
  } catch (error: any) {
    console.error('[Idealista Properties GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
