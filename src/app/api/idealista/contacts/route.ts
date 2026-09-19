// ═══════════════════════════════════════════════════════════════
// API Route: /api/idealista/contacts
// Proxy for Idealista Contact CRUD
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { guard } from '@/lib/api-guard';
import { idealistaRequest } from '@/lib/idealista-auth';
import { mapProprietarioToContact, getAgencyFallbackContact } from '@/lib/idealista-mapper';
import { db, admin } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/idealista/contacts
 * Creates a contact on Idealista from a Proprietario document.
 * Body: { proprietarioId: string } OR { contact: { name, email, phone } }
 */
export async function POST(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    const body = await request.json();
    let contactPayload;

    if (body.proprietarioId) {
      // Fetch owner from Firestore
      const ownerDoc = await db.collection('proprietari').doc(body.proprietarioId).get();
      if (!ownerDoc.exists) {
        // Fallback to agency contact
        contactPayload = getAgencyFallbackContact();
      } else {
        contactPayload = mapProprietarioToContact(ownerDoc.data());
      }
    } else if (body.contact) {
      contactPayload = body.contact;
    } else {
      contactPayload = getAgencyFallbackContact();
    }

    // Validate email
    if (!contactPayload.email) {
      return NextResponse.json(
        { error: 'Email is required for Idealista contact' },
        { status: 400 }
      );
    }

    const result = await idealistaRequest('/v1/contacts', {
      method: 'POST',
      body: JSON.stringify(contactPayload),
    });

    // Save contactId back to Proprietario if available
    if (result.ok && result.data?.contactId && body.proprietarioId) {
      await db.collection('proprietari').doc(body.proprietarioId).update({
        idealistaContactId: result.data.contactId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json(result.data, { status: result.status });
  } catch (error: any) {
    console.error('[Idealista Contacts POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/idealista/contacts
 * Updates a contact on Idealista.
 * Body: { contactId: string, contact: { name, email, phone } }
 */
export async function PUT(request: Request) {
  const denegado = await guard(request, 'secretaria');
  if (denegado) return denegado;

  try {
    const body = await request.json();
    const { contactId, ...contactData } = body;

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
    }

    let payload = contactData;
    if (contactData.proprietarioId) {
      const ownerDoc = await db.collection('proprietari').doc(contactData.proprietarioId).get();
      payload = ownerDoc.exists
        ? mapProprietarioToContact(ownerDoc.data())
        : getAgencyFallbackContact();
    }

    const result = await idealistaRequest(`/v1/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    return NextResponse.json(result.data, { status: result.status });
  } catch (error: any) {
    console.error('[Idealista Contacts PUT]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/idealista/contacts?contactId=xxx OR ?page=0&size=20
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');
    const page = searchParams.get('page') || '0';
    const size = searchParams.get('size') || '20';

    const path = contactId
      ? `/v1/contacts/${contactId}`
      : `/v1/contacts?page=${page}&size=${size}`;

    const result = await idealistaRequest(path, { method: 'GET' });
    return NextResponse.json(result.data, { status: result.status });
  } catch (error: any) {
    console.error('[Idealista Contacts GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
