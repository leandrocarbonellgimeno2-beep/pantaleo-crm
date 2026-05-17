// ═══════════════════════════════════════════════════════════════
// COSTANTI MASTER - Specchio esatto dello schema immobili
// Queste liste sono la FONTE DI VERITÀ condivisa con le proprietà
// ═══════════════════════════════════════════════════════════════

/** Tipologie identiche al <select> di immobili/page.tsx */
export const TIPOLOGIE_IMMOBILE = [
  "Appartamento",
  "Casa/Villa",
  "Locale o Capannone",
  "Terreni",
  "Garage o Posto auto",
  "Edificio",
  "Ufficio",
  "Rustico",
  "Stanza",
  "Cessione Di Attivita",
  "Cantina"
] as const;
export type TipologiaImmobile = typeof TIPOLOGIE_IMMOBILE[number];

/** Zonas de la agencia - extraídas de zonas.json (limpias y normalizadas) */
export const ZONE_AGENCIA = [
  "Centro",
  "Rif. A1 Centro Storico",
  "Rif. A2 Centro",
  "Rif. A7 Tribunale",
  "Rif. B3 Lungomare Boeo",
  "Lungo Mare",
  "Rif. B8 Piazza Del Popolo",
  "Rif. C1 Canottieri",
  "Rif. Porta Mazara",
  "Rif. Stazione",
  "Stazione",
  "Rif. Ospedale",
  "Rif. 1° Periferia Est",
  "Rif. 1° Periferia Nord",
  "Rif. 1° Periferia Sud",
  "Rif. 1° Perif. Sud-est",
  "Rif. 2° Periferia Lato Nord",
  "Rif. 2° Periferia Sud",
  "Rif. 3° Periferia Est",
  "Rif. C4 Periferia Est",
  "Periferia",
  "Rif. Birgi",
  "Petrosino",
  "Porticella",
  "Spagnola",
  "Via Trapani"
] as const;
export type ZonaAgencia = typeof ZONE_AGENCIA[number];

/** Stati Finiture - idénticos al <select> de immobili */
export const STATI_FINITURE = [
  "Nuovo",
  "Ottime",
  "Buono",
  "Abitabile",
  "Da Ristrutturare"
] as const;
export type StatoFinitura = typeof STATI_FINITURE[number];

/** Piano - opciones para el filtro del cliente */
export const PIANI_PREFERENZA = [
  "Qualsiasi",
  "Piano Terra",
  "Piani Intermedi",
  "Attico / Ultimo Piano"
] as const;
export type PianoPreferenza = typeof PIANI_PREFERENZA[number];

/** Arredamento - espejo del select de immobili */
export const ARREDAMENTO_OPZIONI = [
  "Indifferente",
  "Arredato",
  "Non Arredato"
] as const;
export type ArredamentoPreferenza = typeof ARREDAMENTO_OPZIONI[number];

// ═══════════════════════════════════════════════════════════════
// INTERFACES DEL CLIENTE
// ═══════════════════════════════════════════════════════════════

export interface DatiPersonali {
  Nome: string;
  Cognome: string;
  Telefono: string;
  Email: string;
  CodiceFiscale: string;
  IndirizzoResidenza: string;
  CittaResidenza: string;
  /** Uso interno — qualifica creditizia per affitti */
  Professione: string;
  /** Uso interno — reddito annuo lordo (formato libero) */
  RedditoAnnuo: string;
}

export interface Operazione {
  Vendita: boolean;
  Affitto: boolean;
}

/**
 * CaratteristicheRichiesta - Espejo EXACTO de los booleanos
 * que tiene la colección `immobili.Caratteristiche`
 */
export interface CaratteristicheRichiesta {
  [key: string]: boolean;    // Index signature para acceso dinámico
  Ascensore: boolean;
  RiscaldamentoAutonomo: boolean;
  AriaCondizionata: boolean;
  VistaMare: boolean;
  Balcone: boolean;
  Terrazza: boolean;
  Garage: boolean;
  PostoAutoScoperto: boolean;
  PostoAutoCoperto: boolean;
  Giardino: boolean;
  CucinaAbitabile: boolean;
  Cantina: boolean;
}

/** Mapa de labels bonitos para las características */
export const CARATTERISTICHE_LABELS: Record<keyof Omit<CaratteristicheRichiesta, keyof { [key: string]: boolean }>, string> = {
  Ascensore: "Ascensore",
  RiscaldamentoAutonomo: "Riscaldamento Autonomo",
  AriaCondizionata: "Climatizzazione / Aria Cond.",
  VistaMare: "Vista Mare",
  Balcone: "Balcone",
  Terrazza: "Terrazzo",
  Garage: "Garage",
  PostoAutoScoperto: "Posto Auto Scoperto",
  PostoAutoCoperto: "Posto Auto Coperto",
  Giardino: "Giardino",
  CucinaAbitabile: "Cucina Abitabile",
  Cantina: "Cantina"
};

export interface Richiesta {
  Operazione: Operazione;
  Tipologie: TipologiaImmobile[];
  Zone: ZonaAgencia[];
  BudgetAcquistoMin: number | "";
  BudgetAcquistoMax: number | "";
  BudgetAffittoMin: number | "";
  BudgetAffittoMax: number | "";
  SuperficieMin: number | "";
  SuperficieMax: number | "";
  LocaliMin: number | "";
  CamereLettoMin: number | "";
  BagniMin: number | "";
  StatoFinitureAccettati: StatoFinitura[];
  PianoPreferenza: PianoPreferenza;
  ArredamentoPreferenza: ArredamentoPreferenza;
  Caratteristiche: CaratteristicheRichiesta;
  Urgenza: "Alta" | "Media" | "Bassa" | "";
  NoteRichiesta: string;
}

export interface VotoImmobile {
  immobileId: string;
  codice: string;
  dataProposta: string;
  esito: "In Attesa" | "Rifiutato" | "Interessato" | "Visita Fissata";
  note: string;
}

export interface Matching {
  Proposti: VotoImmobile[];
  ListaNera: string[];
  Preferiti: string[];
}

export interface Documentazione {
  DocumentiIdentita: string[];
  ModuliPrivacy: string[];
  AltriDocumenti: string[];
}

export interface FirmaDigitale {
  HasFirma: boolean;
  UrlFirma: string;
  DataFirma: string;
}

export interface Cliente {
  id?: string;
  createdAt?: string | Date | any;
  updatedAt?: string | Date | any;
  status: "Attivo" | "Sospeso" | "Concluso";

  DatiPersonali: DatiPersonali;
  Richiesta: Richiesta;
  Matching: Matching;
  Documentazione: Documentazione;
  FirmaDigitale: FirmaDigitale;
}

// ═══════════════════════════════════════════════════════════════
// FACTORY - Genera un cliente vacío con defaults seguros
// ═══════════════════════════════════════════════════════════════
export const generateEmptyCliente = (): Cliente => ({
  status: "Attivo",
  DatiPersonali: {
    Nome: "",
    Cognome: "",
    Telefono: "",
    Email: "",
    CodiceFiscale: "",
    IndirizzoResidenza: "",
    CittaResidenza: "",
    Professione: "",
    RedditoAnnuo: ""
  },
  Richiesta: {
    Operazione: { Vendita: true, Affitto: false },
    Tipologie: [],
    Zone: [],
    BudgetAcquistoMin: "",
    BudgetAcquistoMax: "",
    BudgetAffittoMin: "",
    BudgetAffittoMax: "",
    SuperficieMin: "",
    SuperficieMax: "",
    LocaliMin: "",
    CamereLettoMin: "",
    BagniMin: "",
    StatoFinitureAccettati: [],
    PianoPreferenza: "Qualsiasi",
    ArredamentoPreferenza: "Indifferente",
    Caratteristiche: {
      Ascensore: false,
      RiscaldamentoAutonomo: false,
      AriaCondizionata: false,
      VistaMare: false,
      Balcone: false,
      Terrazza: false,
      Garage: false,
      PostoAutoScoperto: false,
      PostoAutoCoperto: false,
      Giardino: false,
      CucinaAbitabile: false,
      Cantina: false
    },
    Urgenza: "",
    NoteRichiesta: ""
  },
  Matching: {
    Proposti: [],
    ListaNera: [],
    Preferiti: []
  },
  Documentazione: {
    DocumentiIdentita: [],
    ModuliPrivacy: [],
    AltriDocumenti: []
  },
  FirmaDigitale: {
    HasFirma: false,
    UrlFirma: "",
    DataFirma: ""
  }
});
