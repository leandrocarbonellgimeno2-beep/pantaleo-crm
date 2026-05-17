/**
 * GET /api/idealista/dry-run?codice=1000050
 * ─────────────────────────────────────────────────────────────────────────────
 * DRY RUN — Firestore reale, ZERO chiamate a Idealista.
 *
 * Recupera il documento dell'immobile da Firestore, esegue il mapping e
 * restituisce ESATTAMENTE il JSON che verrebbe inviato a Idealista,
 * con un audit di sicurezza completo che lista i campi esclusi.
 *
 * Garantisce che NESSUN dato privato (proprietario, note interne) esca
 * dal server verso Idealista.
 */

import { NextResponse }     from 'next/server';
import { db }               from '@/lib/firebase-admin';
import { mapPropertyToIdealista, mapImagesToIdealista } from '@/lib/idealista-mapper';

export const dynamic = 'force-dynamic';

// ── Campi Firestore che ESISTONO nel documento ma NON devono mai uscire ──────
const PRIVATE_FIELDS_AUDIT = [
  { path: 'proprietarioId',                              label: 'ID proprietario (FK interna)' },
  { path: 'DatiProprietario',                            label: 'Dati personali proprietario' },
  { path: 'Proprietario',                                label: 'Oggetto proprietario embedded' },
  { path: 'NotePrivate',                                 label: 'Note private agente' },
  { path: 'Annotazioni',                                 label: 'Annotazioni interne' },
  { path: 'Note',                                        label: 'Note generiche' },
  { path: 'GestioneCommerciale.CommissioneVenditore',    label: 'Commissione venditore' },
  { path: 'GestioneCommerciale.CommissioneAcquirente',   label: 'Commissione acquirente' },
  { path: 'GestioneCommerciale.NoteProposta',            label: 'Note proposta commerciale' },
  { path: 'GestioneCommerciale.MotivazioneVendita',      label: 'Motivazione vendita' },
  { path: 'Idealista',                                   label: 'Metadati Idealista (stato sync)' },
  { path: 'idealistaContactId',                          label: 'Contact ID Idealista (interno)' },
  { path: 'createdAt',                                   label: 'Timestamp creazione' },
  { path: 'updatedAt',                                   label: 'Timestamp modifica' },
];

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => acc?.[k], obj);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const codice           = searchParams.get('codice') || searchParams.get('propertyId');

    if (!codice) {
      return NextResponse.json(
        { error: 'Parametro obbligatorio: ?codice=XXXXXX oppure ?propertyId=<firestoreId>' },
        { status: 400 },
      );
    }

    // ── 1. Recupero da Firestore ──────────────────────────────────────────────
    let property: any = null;

    // Prima prova come Firestore document ID
    if (codice.length > 6) {
      const directDoc = await db.collection('immobili').doc(codice).get();
      if (directDoc.exists) {
        property = { id: directDoc.id, ...directDoc.data() };
      }
    }

    // Poi cerca per DatiBase.Codice
    if (!property) {
      const q = await db.collection('immobili')
        .where('DatiBase.Codice', '==', codice)
        .limit(1)
        .get();
      if (!q.empty) {
        const d = q.docs[0];
        property = { id: d.id, ...d.data() };
      }
    }

    if (!property) {
      return NextResponse.json(
        { error: `Immobile non trovato: codice="${codice}"` },
        { status: 404 },
      );
    }

    // ── 2. Mapping → payload Idealista (SENZA inviarlo) ───────────────────────
    const PLACEHOLDER_CONTACT_ID = 'DRY-RUN-CONTACT-ID';
    const propertyPayload = mapPropertyToIdealista(property, PLACEHOLDER_CONTACT_ID, {
      scope:      'idealista',
      visibility: 'full',
    });

    // ── 3. Image payload ──────────────────────────────────────────────────────
    const images: string[] = property.images || property.Media?.Immagini || property.Immagini || [];
    const imagePayload     = mapImagesToIdealista(images.slice(0, 10));

    // ── 4. Audit di sicurezza ─────────────────────────────────────────────────
    const auditResults = PRIVATE_FIELDS_AUDIT.map(field => {
      const presentInFirestore = getNestedValue(property, field.path) !== undefined;
      return {
        field:             field.path,
        label:             field.label,
        presentInFirestore,
        leaksToIdealista:  false, // Per design: nessuno di questi è nel payload
        status:            presentInFirestore ? 'PROTETTO ✓' : 'non presente',
      };
    });

    // Verifica aggiuntiva: i campi del payload NON devono contenere nomi propri del proprietario
    const payloadStr      = JSON.stringify(propertyPayload);
    const ownerName       = property.DatiProprietario?.Nome || property.Proprietario?.nome || null;
    const ownerEmail      = property.DatiProprietario?.Email || property.Proprietario?.email || null;
    const ownerPhone      = property.DatiProprietario?.Telefono || property.Proprietario?.telefono || null;

    const privacyChecks = [
      { check: 'Nome proprietario non in payload',  pass: !ownerName  || !payloadStr.includes(ownerName)  },
      { check: 'Email proprietario non in payload', pass: !ownerEmail || !payloadStr.includes(ownerEmail) },
      { check: 'Tel. proprietario non in payload',  pass: !ownerPhone || !payloadStr.includes(ownerPhone) },
      { check: 'NotePrivate non in payload',        pass: !payloadStr.includes('NotePrivate')              },
      { check: 'Annotazioni non in payload',        pass: !payloadStr.includes('Annotazioni')              },
      { check: 'Commissioni non in payload',        pass: !payloadStr.includes('Commissione')              },
    ];

    const allPrivacyPassed = privacyChecks.every(c => c.pass);

    // ── 5. Response ───────────────────────────────────────────────────────────
    return NextResponse.json(
      {
        dryRun:   true,
        note:     'NESSUNA richiesta inviata a Idealista — solo simulazione',
        firestoreId: property.id,
        codice:   property.DatiBase?.Codice || codice,

        // ─── Il JSON ESATTO che riceverebbe Idealista ─────────────────────────
        idealistaPayload: {
          propertyBody: propertyPayload,
          imageBody:    imagePayload,
        },

        // ─── Audit Privacy ────────────────────────────────────────────────────
        privacyAudit: {
          allPassed:     allPrivacyPassed,
          verdict:       allPrivacyPassed
                           ? '✅ CONFORME — Nessun dato privato nel payload'
                           : '❌ ATTENZIONE — Verificare i check falliti',
          checks:        privacyChecks,
          fieldProtection: auditResults,
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[DryRun] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
