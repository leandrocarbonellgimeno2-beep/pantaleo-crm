// ═══════════════════════════════════════════════════════════════
// IDEALISTA — Data Mapper
// Transforms CRM Firestore documents → Idealista API payloads
// ═══════════════════════════════════════════════════════════════

import {
  IdealistaPropertyPayload,
  IdealistaContactPayload,
  IdealistaFeatures,
  IdealistaAddress,
  IdealistaPrice,
  IdealistaPropertyType,
  IdealistaMultimediaItem,
  TIPOLOGIA_TO_IDEALISTA,
  STATO_FINITURE_TO_CONSERVATION,
  IDEALISTA_CONFIG,
} from '@/types/idealista';

// ── Helper: safely parse a number ──
function toNum(val: any): number | undefined {
  if (val === '' || val === null || val === undefined) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

// ── Helper: extract street name and number from address string ──
function parseAddress(indirizzo: string): { street: string; streetNumber?: string } {
  if (!indirizzo) return { street: '' };
  // Pattern: "Via Roma 10" or "Via Roma, 10" or "Via Roma n. 10"
  const match = indirizzo.match(/^(.+?)\s*[,\s]+(?:n\.?\s*)?(\d+\w*)$/);
  if (match) {
    return { street: match[1].trim(), streetNumber: match[2] };
  }
  return { street: indirizzo.trim() };
}

// ═══════════════════════════════════════════════════════════════
// CONTACT MAPPER
// ═══════════════════════════════════════════════════════════════

/**
 * Maps a CRM Proprietario document to an Idealista Contact payload.
 */
export function mapProprietarioToContact(owner: any): IdealistaContactPayload {
  const name = [
    owner.Nome || owner.nome || '',
    owner.Cognome || owner.cognome || '',
  ].filter(Boolean).join(' ').trim() || 'Agenzia Pantaleo';

  const email = owner.Email || owner.email || '';
  const phone = owner.Telefono || owner.telefono || owner.Cellulare || owner.cellulare || '';

  return {
    name,
    email,
    ...(phone ? { phone } : {}),
  };
}

/**
 * Returns a fallback agency contact (used when no owner is linked).
 */
export function getAgencyFallbackContact(): IdealistaContactPayload {
  return {
    name: 'Immobiliare Pantaleo',
    email: 'info@immobiliarepantaleo.it',
    phone: '+39 0923 951398',
  };
}

// ═══════════════════════════════════════════════════════════════
// PROPERTY MAPPER
// ═══════════════════════════════════════════════════════════════

/**
 * Maps a CRM Firestore immobile document to a full Idealista property payload.
 *
 * @param property  - The Firestore immobile document
 * @param contactId - The Idealista contactId (must be created first)
 * @param options   - Optional overrides (scope, visibility)
 */
export function mapPropertyToIdealista(
  property: any,
  contactId: string,
  options: {
    scope?: 'idealista' | 'microsite';
    visibility?: 'full' | 'street' | 'hidden';
  } = {}
): IdealistaPropertyPayload {
  const db = property.DatiBase || {};
  const df = property.DettagliFisici || {};
  const gc = property.GestioneCommerciale || {};
  const car = property.Caratteristiche || {};
  const tex = property.Textos || {};

  // ── Operation ──
  const operation: 'sale' | 'rent' = gc.InAffitto && !gc.InVendita ? 'rent' : 'sale';

  // ── Address ──
  // NUNCA inventamos datos catastrales. Antes había fallbacks falsos
  // ('Via Non Specificata' / CAP '91025' / 'Marsala') que publicaban una
  // dirección irreal en Idealista. Ahora exigimos los campos mínimos y, si
  // faltan, abortamos el mapeo con un error claro: mejor no publicar que
  // publicar datos falsos. Los callers (POST/PUT/dry-run) ya capturan y
  // devuelven el message.
  const parsed = parseAddress(db.Indirizzo || '');
  const town = (db.Citta || '').trim();
  const postalCode = (db.CAP || '').toString().trim();
  const missing: string[] = [];
  if (!parsed.street) missing.push('Indirizzo');
  if (!town) missing.push('Città');
  if (!postalCode) missing.push('CAP');
  if (missing.length > 0) {
    throw new Error(
      `Pubblicazione Idealista annullata: dati indirizzo mancanti (${missing.join(', ')}). ` +
      `Completa l'indirizzo dell'immobile prima di pubblicarlo.`
    );
  }
  const address: IdealistaAddress = {
    street: parsed.street,
    ...(parsed.streetNumber ? { streetNumber: parsed.streetNumber } : {}),
    postalCode,
    town,
    province: IDEALISTA_CONFIG.DEFAULT_PROVINCE,
    country: IDEALISTA_CONFIG.DEFAULT_COUNTRY,
    visibility: options.visibility || 'full',
  };

  // ── Type mapping ──
  const type: IdealistaPropertyType = TIPOLOGIA_TO_IDEALISTA[db.Tipologia] || 'flat';

  // ── Features ──
  const features: IdealistaFeatures = {
    type,
  };

  // Area
  const area = toNum(df.MetriCommerciali);
  if (area && area >= 10) {
    features.areaConstructed = area;
  }

  // Rooms
  const bedrooms = toNum(df.CamereLetto);
  if (bedrooms !== undefined) features.bedRoomNumber = bedrooms;

  const bathrooms = toNum(df.Bagni);
  if (bathrooms !== undefined) features.bathRoomNumber = bathrooms;

  // Conservation
  const conservation = STATO_FINITURE_TO_CONSERVATION[df.StatoFiniture];
  if (conservation) features.conservation = conservation;

  // Floor
  if (df.Piano && df.Piano !== '') {
    features.floorNumber = String(df.Piano);
  }

  // Boolean amenities
  if (car.Ascensore) features.hasLift = true;
  if (car.AriaCondizionata) features.hasAirConditioning = true;
  if (car.Giardino) features.hasGarden = true;
  if (car.Terrazza) features.hasTerrace = true;
  if (car.Balcone) features.hasBalcony = true;

  // Parking logic (must be consistent to avoid validation errors)
  const hasParking = !!(car.Garage || car.PostoAutoScoperto);
  if (hasParking) {
    features.hasParking = true;
    features.parkingAvailable = true;
    features.parkingIncludedInPrice = false;
  }

  // Energy certificate
  if (df.ClasseEnergetica && df.ClasseEnergetica !== '') {
    features.energyCertificateRating = df.ClasseEnergetica.toLowerCase();
  }

  // Cessione di attivita → commercial transfer
  if (db.Tipologia === 'Cessione Di Attivita') {
    features.isATransfer = true;
    features.commercialMainActivity = 'other';
  }

  // ── Price ──
  const priceAmount = operation === 'sale'
    ? toNum(gc.PrezzoVendita)
    : toNum(gc.PrezzoAffitto);

  const price: IdealistaPrice = {
    amount: priceAmount || 0,
  };

  const communityFees = toNum(gc.SpeseCondominio);
  if (communityFees && communityFees > 0) {
    price.communityFees = communityFees;
  }

  // ── Description ──
  const description = tex.Descrizione
    ? { it: tex.Descrizione }
    : undefined;

  // ── Multimedia (3D Tour) ──
  // NOTE: The CRM Firestore schema does not yet have a dedicated VirtualTour field.
  // When the field `DatiBase.TourVirtuale3D` (string URL) is added to the property
  // documents in Firestore, remove the comment below and this block will activate.
  //
  // Idealista IT requires: { url: "<matterport-or-similar-url>", type: "3d-tour" }
  //
  const multimedia: IdealistaMultimediaItem[] = [];
  /* ── ACTIVATE WHEN CRM FIELD IS READY ──
  const tourUrl = db.TourVirtuale3D as string | undefined;
  if (tourUrl && tourUrl.startsWith('http')) {
    multimedia.push({ url: tourUrl, type: '3d-tour' });
  }
  */

  return {
    scope: options.scope || 'idealista',
    operation,
    // ── REQUIRED by Idealista IT to activate and publish the listing ──
    propertyVisibility: (options.visibility || 'full') as 'full' | 'street' | 'hidden',
    propertyStatus: 'active' as const,
    address,
    contact: { contactId },
    ...(description ? { description } : {}),
    features,
    price,
    ...(multimedia.length > 0 ? { multimedia } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════
// IMAGE MAPPER
// ═══════════════════════════════════════════════════════════════

/**
 * Maps CRM image URLs to Idealista image payload format.
 * Each image gets an order index and optional label.
 */
export function mapImagesToIdealista(
  imageUrls: string[],
  labels?: string[]
): Array<{ url: string; order: number; label?: string }> {
  return imageUrls
    .filter(url => typeof url === 'string' && url.startsWith('http'))
    .map((url, index) => ({
      url,
      order: index + 1,
      ...(labels && labels[index] ? { label: labels[index] } : {}),
    }));
}
