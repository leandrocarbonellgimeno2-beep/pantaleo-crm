// ═══════════════════════════════════════════════════════════════
// IDEALISTA REAL-TIME API — Type Definitions
// ═══════════════════════════════════════════════════════════════

// ── Sync status stored in Firestore (immobili.Idealista) ──
export interface IdealistaSync {
  idealistaPropertyId: string | null;
  idealistaContactId: string | null;
  idealistaStatus: 'none' | 'active' | 'deactivated' | 'error';
  idealistaLastSync: any | null; // Firestore Timestamp
  idealistaError: string | null;
}

// ── OAuth Token ──
export interface IdealistaToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  fetchedAt: number; // Date.now() when fetched
}

// ── Contact Payload ──
export interface IdealistaContactPayload {
  name: string;
  email: string;
  phone?: string;
}

// ── Address ──
export interface IdealistaAddress {
  street: string;
  streetNumber?: string;
  postalCode: string;
  town: string;
  province: string;
  country: string;
  visibility: 'full' | 'street' | 'hidden';
  latitude?: number;
  longitude?: number;
}

// ── Features (varies by type, this covers flat/house/general) ──
export interface IdealistaFeatures {
  type: IdealistaPropertyType;
  areaConstructed?: number;
  areaUsable?: number;
  areaPlot?: number;
  bedRoomNumber?: number;
  bathRoomNumber?: number;
  conservation?: 'newdevelopment' | 'good' | 'toberestored';
  floorNumber?: string;
  hasLift?: boolean;
  hasAirConditioning?: boolean;
  hasGarden?: boolean;
  hasTerrace?: boolean;
  hasBalcony?: boolean;
  hasSwimmingPool?: boolean;
  hasParking?: boolean;
  parkingAvailable?: boolean;
  parkingIncludedInPrice?: boolean;
  isFurnished?: boolean;
  energyCertificateRating?: string;
  // Land-specific
  landType?: 'urban' | 'countrybuildable' | 'countrynonbuildable';
  electricity?: boolean;
  roadAccess?: boolean;
  accessType?: string;
  // Commercial-specific
  isATransfer?: boolean;
  commercialMainActivity?: string;
  // Building-specific
  classificationResidential?: boolean;
  classificationCommercial?: boolean;
  classificationIndustrial?: boolean;
  classificationPublic?: boolean;
  // Room-specific (operation can only be rent)
  [key: string]: any;
}

// ── Price ──
export interface IdealistaPrice {
  amount: number;
  communityFees?: number;
}

// ── Description ──
export interface IdealistaDescription {
  it?: string;
  en?: string;
  [lang: string]: string | undefined;
}

// ── Full Property Payload ──
export interface IdealistaPropertyPayload {
  scope: 'idealista' | 'microsite';
  operation: 'sale' | 'rent';
  /** Required by Idealista IT to make the listing publicly visible */
  propertyVisibility: 'full' | 'street' | 'hidden';
  /** Required by Idealista IT to activate the listing */
  propertyStatus: 'active' | 'inactive';
  address: IdealistaAddress;
  contact: { contactId: string };
  description?: IdealistaDescription;
  features: IdealistaFeatures;
  price: IdealistaPrice;
  /** Optional multimedia items (e.g. 3D tours) */
  multimedia?: IdealistaMultimediaItem[];
}

// ── Multimedia Payload (videos, 3D tours, etc.) ──
export interface IdealistaMultimediaItem {
  /** The public URL of the multimedia content */
  url: string;
  /**
   * Type of multimedia:
   * - 'video'     → YouTube / direct video link
   * - '3d-tour'   → Matterport or similar immersive 3D tour
   */
  type: 'video' | '3d-tour';
}

// ── Property Types ──
export type IdealistaPropertyType =
  | 'flat'
  | 'house'
  | 'countryhouse'
  | 'garage'
  | 'office'
  | 'commercial'
  | 'land'
  | 'storage'
  | 'building'
  | 'room';

// ── Mapping Constants ──

/** CRM Tipologia → Idealista type */
export const TIPOLOGIA_TO_IDEALISTA: Record<string, IdealistaPropertyType> = {
  'Appartamento': 'flat',
  'Casa/Villa': 'house',
  'Rustico': 'countryhouse',
  'Garage o Posto auto': 'garage',
  'Ufficio': 'office',
  'Locale o Capannone': 'commercial',
  'Terreni': 'land',
  'Cantina': 'storage',
  'Edificio': 'building',
  'Stanza': 'room',
  'Cessione Di Attivita': 'commercial',
};

/** CRM StatoFiniture → Idealista conservation */
export const STATO_FINITURE_TO_CONSERVATION: Record<string, 'newdevelopment' | 'good' | 'toberestored'> = {
  'Nuovo': 'newdevelopment',
  'Ottime': 'good',
  'Buono': 'good',
  'Abitabile': 'good',
  'Da Ristrutturare': 'toberestored',
};

// ── Config ──
export const IDEALISTA_CONFIG = {
  SANDBOX_BASE_URL: 'https://partners-sandbox.idealista.it',
  PRODUCTION_BASE_URL: 'https://partners.idealista.it',
  CLIENT_ID: 'immobiliarepantaleo',
  DEFAULT_PROVINCE: 'TP',
  DEFAULT_COUNTRY: 'IT',
  USE_SANDBOX: false, // ✅ PRODUCTION MODE — Certified 2026-03-21
} as const;
// Secrets are read exclusively from environment variables:
// IDEALISTA_CLIENT_SECRET — OAuth2 client secret
// IDEALISTA_FEED_KEY     — Feed access key
