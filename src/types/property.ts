/**
 * Property / Immobile — schema canonico Firestore.
 *
 * Nota: la collezione `immobili` ha campi che convivono fra schema "nuovo"
 * (DatiBase / GestioneCommerciale / DettagliFisici nested) e schema legacy
 * (proprietà al top-level). Marchio tutti i campi opzionali perché un documento
 * reale potrebbe averne solo una parte.
 */

// ── Sotto-strutture ──────────────────────────────────────────────────────────

export interface PropertyDatiBase {
  Codice?: string;
  Indirizzo?: string;
  Citta?: string;
  Zona?: string;
  Tipologia?: string;
  Riferimento?: string;
  SortKey?: string;
  Foto?: string[]; // legacy
}

export interface PropertyGestioneCommerciale {
  InVendita?: boolean;
  InAffitto?: boolean;
  Sospeso?: boolean;
  PrezzoVendita?: number | string;
  PrezzoAffitto?: number | string;
}

export interface PropertyDettagliFisici {
  MetriCommerciali?: number | string;
  CamereLetto?: number | string;
  Bagni?: number | string;
  Piano?: number | string;
}

export interface PropertyMedia {
  Immagini?: string[]; // legacy
  Urls?: string[];     // legacy
}

export interface PropertyIdealista {
  idealistaPropertyId?: string;
  idealistaContactId?: string;
  idealistaStatus?: 'active' | 'deactivated' | 'error' | 'pending';
  idealistaError?: string | null;
  idealistaLastSync?: any; // Firestore Timestamp
}

// ── Schema canonico ──────────────────────────────────────────────────────────

export type SoftDeleteStatus = 'pendente_cancellazione';

export interface Property {
  id?: string;
  DatiBase?: PropertyDatiBase;
  GestioneCommerciale?: PropertyGestioneCommerciale;
  DettagliFisici?: PropertyDettagliFisici;
  Media?: PropertyMedia;
  Idealista?: PropertyIdealista;

  /** Array canonico di URL immagini (popolato post-migrazione). */
  images?: string[];
  /** Prima immagine dell'array — usata come anteprima nelle card. */
  thumbnail?: string | null;
  /** Conteggio cached delle immagini disponibili. */
  imageCount?: number;

  /** Link al proprietario (campo canonico). */
  proprietarioId?: string;
  /** Alias dopo la migrazione del 2026-05-23 (vedi project_crm_pantaleo). */
  proprietarioId_real?: string;

  note?: string;

  // legacy top-level
  Immagini?: string[];

  // soft-delete
  _status?: SoftDeleteStatus;
  _deletedAt?: number;

  // server-managed
  createdAt?: any; // FirebaseFirestore.Timestamp
  updatedAt?: any;
}
