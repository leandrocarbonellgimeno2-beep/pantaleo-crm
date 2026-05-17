export interface Proprietario {
  id?: string;
  ID?: string; // Legacy ID from old DB
  Nome?: string;
  nome?: string; // legacy support
  Cognome?: string;
  cognome?: string; // legacy support
  Email?: string;
  email?: string;

  Telefono?: string;
  telefono?: string;
  telefono_fisso?: string;
  tel1?: string;
  telefono2?: string;

  Cellulare?: string;
  cellulare?: string;
  cellulare2?: string;
  cell1?: string;
  
  Indirizzo?: string;
  indirizzo?: string;
  indirizzo_residenza?: string;
  numero_civico?: string;
  
  Citta?: string;
  citta?: string;
  Provincia?: string;
  provincia?: string;
  cap?: string;
  localita?: string;
  nazione?: string;
  
  note?: string;
  note_riservate?: string;
  numero_immobili?: number;
  
  // commercial flags
  stato?: string | boolean;
  interessato_vendita?: boolean;
  interessato_locazione?: boolean;
  in_esclusiva?: boolean;

  // docs
  privacy_accettata?: boolean;
  firmaDigitale?: string;
  planimetria?: string;
  atto_immobile?: string;
  stato_chiavi?: string;
  documenti?: Record<string, any>;

  immobili_collegati?: string[];
  
  // CRM Metadata
  createdAt?: any;
  updatedAt?: any;
}

