// ═══════════════════════════════════════════════════════════════
// SMART MATCHING ENGINE v2
// Capa 1 — Criteri strutturali completi + wildcard neutri (0.6)
// Capa 2 — Matching semantico: NoteRichiesta ↔ Textos.Descrizione
// Totale pesi: 100 punti
// ═══════════════════════════════════════════════════════════════

import type { Richiesta } from '@/types/cliente';

// ── Score neutro per criteri non specificati.
//    0.6 invece di 1.0: evita l'inflazione artificiale del punteggio.
//    Un cliente che non specifica nulla ottiene max 60 punti (neutro),
//    non 100 (come se tutto fosse un match perfetto).
const WILDCARD_SCORE = 0.6;

// ── Cluster di zone per adiacenza geografica — O(1) lookups via HashMap ──
const ZONE_CLUSTERS: Record<string, string[]> = {
  centro:          ['Centro', 'Rif. A1 Centro Storico', 'Rif. A2 Centro', 'Rif. B8 Piazza Del Popolo', 'Rif. A7 Tribunale'],
  lungomare:       ['Rif. B3 Lungomare Boeo', 'Lungo Mare', 'Rif. C1 Canottieri'],
  stazione:        ['Rif. Stazione', 'Stazione', 'Rif. Porta Mazara'],
  ospedale:        ['Rif. Ospedale'],
  periferia_nord:  ['Rif. 1° Periferia Nord'],
  periferia_sud:   ['Rif. 1° Periferia Sud', 'Rif. 1° Perif. Sud-est'],
  periferia_est_1: ['Rif. 1° Periferia Est'],
  periferia_est_2: ['Rif. 2° Periferia Lato Nord', 'Rif. 2° Periferia Sud'],
  periferia_est_3: ['Rif. 3° Periferia Est', 'Rif. C4 Periferia Est', 'Periferia'],
  extraurbano:     ['Rif. Birgi', 'Petrosino', 'Porticella', 'Spagnola', 'Via Trapani'],
};

const ZONE_TO_CLUSTER = new Map<string, string>();
for (const [cluster, zones] of Object.entries(ZONE_CLUSTERS)) {
  for (const z of zones) {
    ZONE_TO_CLUSTER.set(z.toLowerCase().trim(), cluster);
  }
}

// ══════════════════════════════════════════════════════════════════
// PESI — 100 punti totali
// ══════════════════════════════════════════════════════════════════
const WEIGHTS = {
  presupuesto:  27, // Budget — fattore #1 assoluto
  zona:         20, // Zona geografica — location is everything
  tipologia:    18, // Tipo di immobile
  superficie:    9, // Metratura
  camere:        6, // Camere da letto
  finiture:      7, // Stato finiture
  semantico:     6, // NoteRichiesta ↔ Textos.Descrizione (Capa 2)
  bagni:         2, // Bagni minimi
  locali:        2, // Vani/locali totali
  piano:         2, // Preferenza piano
  arredamento:   1, // Arredato / non arredato
} as const;
// Verifica: 27+20+18+9+6+7+6+2+2+2+1 = 100 ✓

// ══════════════════════════════════════════════════════════════════
// INTERFACES
// ══════════════════════════════════════════════════════════════════

export interface ScoreBreakdown {
  criterio: string;
  score: number;    // 0.0 – 1.0
  peso: number;
  puntos: number;   // score × peso
  label: string;
  wildcard: boolean;
}

export interface MatchResult {
  immobileId: string;
  codice: string;
  matchPercentage: number;
  breakdown: ScoreBreakdown[];
  semanticMatches: string[];   // Categorie semantiche trovate (per mostrare in UI)
  snippet: {
    indirizzo: string;
    citta: string;
    zona: string;
    tipologia: string;
    prezzo: number;
    mq: number;
    camere: number;
    bagni: number;
    mainImage: string;
    piano: string;
    descrizione: string;       // Prime 200 caratteri di Textos.Descrizione
  };
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

function isEmpty(v: number | '' | undefined | null): boolean {
  return v === undefined || v === null || v === '' || v === 0;
}

// ══════════════════════════════════════════════════════════════════
// CAPA 1 — NORMALIZZAZIONE TIPOLOGIE
// ══════════════════════════════════════════════════════════════════

/**
 * Mappa completa di sinonimi del settore immobiliare italiano.
 * Copre i valori reali trovati in Firestore (incluse varianti legacy).
 * '__sconosciuta__' è usato come flag per "DA SCEGLIERE" — non è un mismatch
 * duro, ma riceve una penalizzazione controllata (0.3).
 */
const TIPOLOGIA_SYNONYMS: Record<string, string> = {
  // Affitti
  'aff. vuoto':           'affitto',
  'aff. arredato':        'affitto',
  'aff. semi-arredato':   'affitto',
  'affitto vuoto':        'affitto',
  'affitto arredato':     'affitto',
  // Residenziale
  'appartamenti':         'appartament',
  'appartamento':         'appartament',
  'attico':               'appartament',
  'ammezzato':            'appartament',
  'bilocale':             'appartament',
  'bivano':               'appartament',
  'abitazione':           'appartament',
  'appartanvilla':        'appartament',
  'casa/villa':           'casa',
  'casa indipendente':    'casa',
  'casa semi indipendente': 'casa',
  'casa con terreno':     'casa',
  'casa':                 'casa',
  'case':                 'casa',
  'ville':                'villa',
  'villetta':             'villa',
  'villa singola':        'villa',
  'villa':                'villa',
  'rustico':              'rustico',
  'rustici siciliani':    'rustico',
  'rudere':               'rustico',
  // Commerciale
  'locale commerciale':   'negozi',
  'locali commerciali':   'negozi',
  'locale o capannone':   'negozi',
  'locale artigianale':   'magazzino',
  'artgianale':           'magazzino',
  "attivita' commerciale": 'negozi',
  'attività commerciale': 'negozi',
  'attivita':             'negozi',
  'attività':             'negozi',
  'negozi':               'negozi',
  'negozio':              'negozi',
  // Uffici
  'uffici':               'ufficio',
  'ufficio':              'ufficio',
  // Garage / Posti auto
  'box/garage':           'garage',
  'garage':               'garage',
  'box':                  'garage',
  // Garage / Posto auto
  'garage o posto auto':  'garage',
  // Commerciale specifico
  'cessione di attivita': 'negozi',
  // Singole unità
  'stanza':               'stanza',
  'cantina':              'cantina',
  'edificio':             'struttura',
  // Terreni
  'terreni 010':          'terreno',
  'terreni b3':           'terreno',
  'terreni e2':           'terreno',
  'terreni 003':          'terreno',
  'terreni':              'terreno',
  'terreno':              'terreno',
  'area edificabile':     'terreno',
  // Strutture
  'struttura':            'struttura',
  'strutture':            'struttura',
  'stabili':              'struttura',
  // Magazzini
  'magazzini':            'magazzino',
  'magazzino':            'magazzino',
  'capannoni':            'magazzino',
  // Tipologia non classificata — penalizzazione parziale, non eliminazione
  'da scegliere':         '__sconosciuta__',
};

// Strict group pairs: only casa ↔ villa are interchangeable (both map from "Casa/Villa").
// Appartamento and Rustico are strict — they do NOT cross-match each other.
const TIPOLOGIA_GROUPS = new Map<string, Set<string>>([
  ['casa',  new Set(['casa', 'villa'])],
  ['villa', new Set(['villa', 'casa'])],
]);

function italianStem(tipologia: string): string {
  const normalized = tipologia.toLowerCase().trim();
  if (TIPOLOGIA_SYNONYMS[normalized]) return TIPOLOGIA_SYNONYMS[normalized];

  let stem = normalized;
  if (stem.length > 4) {
    if (stem.endsWith('io') || stem.endsWith('ia')) stem = stem.slice(0, -1);
    if (stem.length > 4 && /[oaei]$/.test(stem)) stem = stem.slice(0, -1);
  }
  if (TIPOLOGIA_SYNONYMS[stem]) return TIPOLOGIA_SYNONYMS[stem];
  return stem;
}

function tipologiaScore(clienteTipologie: string[], immobileTipologia: string): number {
  // Wildcard: cliente non ha specificato → score neutro
  if (!clienteTipologie || clienteTipologie.length === 0) return WILDCARD_SCORE;

  const immobileStem = italianStem(immobileTipologia || '');

  // Tipologia non classificata: non è un hard fail (potrebbe essere quello che vuole),
  // ma non è un match → penalizzazione parziale
  if (immobileStem === '__sconosciuta__') return 0.3;

  for (const ct of clienteTipologie) {
    const clienteStem = italianStem(ct);
    if (clienteStem === immobileStem) return 1.0;
    // Match per prefisso (copre "terreni 010" vs "terreno", "appartamenti" vs "appartament")
    if (clienteStem.length >= 4 && immobileStem.length >= 4) {
      if (clienteStem.startsWith(immobileStem) || immobileStem.startsWith(clienteStem)) return 1.0;
    }
  }

  // Strict group pairs only (casa ↔ villa): partial match
  const immobileGroup = TIPOLOGIA_GROUPS.get(immobileStem);
  if (immobileGroup) {
    for (const ct of clienteTipologie) {
      if (immobileGroup.has(italianStem(ct))) return 0.5;
    }
  }

  return 0.0;
}

// ══════════════════════════════════════════════════════════════════
// CAPA 1 — FUNZIONI DI SCORING
// ══════════════════════════════════════════════════════════════════

/**
 * Budget con tolleranza fuzzy:
 *   - Dentro il range → 1.0 (perfetto)
 *   - Sopra il massimo fino al 15% → score degradato (0.0–1.0)
 *   - Sotto il minimo fino al 10% → score degradato
 *   - Oltre le tolleranze → 0.0
 * Questo evita che una proprietà a €102k scompaia per un budget max di €100k.
 */
function fuzzyBudgetScore(
  value: number,
  min: number | '' | undefined,
  max: number | '' | undefined,
): number {
  const lo = min ? Number(min) : 0;
  const hi = max ? Number(max) : Infinity;

  if (lo === 0 && hi === Infinity) return 1.0; // wildcard: nessuna preferenza

  // Dentro il range → perfetto
  if ((lo === 0 || value >= lo) && (hi === Infinity || value <= hi)) return 1.0;

  // Sotto il minimo: 10% di tolleranza
  if (lo > 0 && value < lo) {
    const underflow = (lo - value) / lo;
    return Math.max(0, 1 - underflow / 0.10);
  }

  // Sopra il massimo: 15% di tolleranza
  if (hi < Infinity && value > hi) {
    const overflow = (value - hi) / hi;
    return Math.max(0, 1 - overflow / 0.05);
  }

  return 1.0;
}

/** Range stretto per superficie: dentro = 1.0, fuori = 0.0 */
function strictRangeScore(
  value: number,
  min: number | '' | undefined,
  max: number | '' | undefined,
): number {
  const lo = min ? Number(min) : 0;
  const hi = max ? Number(max) : Infinity;
  if (lo === 0 && hi === Infinity) return 1.0;
  if (lo > 0 && value < lo) return 0.0;
  if (hi < Infinity && value > hi) return 0.0;
  return 1.0;
}

/** Score scalato per camere/bagni/vani: tolleranza di ±2 */
function stepScore(immobileValue: number, clienteMin: number | '' | undefined): number {
  if (!clienteMin && clienteMin !== 0) return 1.0;
  const min = Number(clienteMin);
  if (min === 0) return 1.0;
  const diff = immobileValue - min;
  if (diff >= 0) return 1.0;   // ha quello che chiede o di più
  if (diff === -1) return 0.6; // uno in meno: accettabile
  if (diff === -2) return 0.2; // due in meno: scarso
  return 0.0;                  // troppo lontano
}

/** Score zona con match esatto e adiacenza per cluster geografico */
function zonaScore(immobileZona: string, clienteZone: string[]): number {
  if (!clienteZone || clienteZone.length === 0) return WILDCARD_SCORE;

  const zonaLower = (immobileZona || '').toLowerCase().trim();

  // Match esatto
  for (const cz of clienteZone) {
    if (cz.toLowerCase().trim() === zonaLower) return 1.0;
  }

  // Match per cluster (zone adiacenti)
  const immobileCluster = ZONE_TO_CLUSTER.get(zonaLower) ?? null;
  if (immobileCluster) {
    for (const cz of clienteZone) {
      const clienteCluster = ZONE_TO_CLUSTER.get(cz.toLowerCase().trim()) ?? null;
      if (clienteCluster && clienteCluster === immobileCluster) return 0.6;
    }
  }

  return 0.0;
}

/** Score stato finiture con prossimità sulla scala qualitativa */
const FINITURE_SCALA = ['nuovo', 'ottime', 'buono', 'abitabile', 'da ristrutturare'];

function statoFinitureScore(immobileStato: string, clienteAccettati: string[]): number {
  if (!clienteAccettati || clienteAccettati.length === 0) return WILDCARD_SCORE;

  const immobileNorm = (immobileStato || '').toLowerCase().trim();
  const immobileIdx = FINITURE_SCALA.indexOf(immobileNorm);

  // Stato finiture non riconosciuto → neutro
  if (immobileIdx === -1) return 0.5;

  let bestScore = 0;
  for (const accettato of clienteAccettati) {
    const accIdx = FINITURE_SCALA.indexOf(accettato.toLowerCase().trim());
    if (accIdx === -1) continue;
    const distanza = Math.abs(immobileIdx - accIdx);
    const score =
      distanza === 0 ? 1.0 :
      distanza === 1 ? 0.7 :
      distanza === 2 ? 0.3 : 0.0;
    if (score > bestScore) bestScore = score;
  }
  return bestScore;
}

/** Score preferenza piano */
function pianoScore(immobilePiano: string, clientePreferenza: string): number {
  if (!clientePreferenza || clientePreferenza === 'Qualsiasi') return WILDCARD_SCORE;

  const pianoLower = (immobilePiano || '').toLowerCase().trim();
  const pianoNum = parseInt(pianoLower);

  switch (clientePreferenza) {
    case 'Piano Terra':
      return pianoLower.includes('terra') || pianoLower === '0' ? 1.0 : 0.2;

    case 'Piani Intermedi':
      return (
        pianoLower === 'primo' || pianoLower === 'secondo' || pianoLower === 'terzo' ||
        pianoLower === '1' || pianoLower === '2' || pianoLower === '3' ||
        (!isNaN(pianoNum) && pianoNum >= 1 && pianoNum <= 3)
      ) ? 1.0 : 0.3;

    case 'Attico / Ultimo Piano':
      return (
        pianoLower.includes('attico') || pianoLower.includes('ultimo') ||
        (!isNaN(pianoNum) && pianoNum >= 4)
      ) ? 1.0 : 0.2;

    default:
      return WILDCARD_SCORE;
  }
}

/** Score arredamento */
function arredamentoScore(caratteristiche: any, clientePreferenza: string): number {
  if (!clientePreferenza || clientePreferenza === 'Indifferente') return WILDCARD_SCORE;
  const isArredato = caratteristiche?.Arredato === true;
  if (clientePreferenza === 'Arredato') return isArredato ? 1.0 : 0.0;
  if (clientePreferenza === 'Non Arredato') return !isArredato ? 1.0 : 0.0;
  return WILDCARD_SCORE;
}

// ══════════════════════════════════════════════════════════════════
// CAPA 2 — MATCHING SEMANTICO
// NoteRichiesta del cliente ↔ Textos.Descrizione dell'immobile
// ══════════════════════════════════════════════════════════════════

interface SemanticEntry {
  /** Parole che l'agente può scrivere nelle NoteRichiesta del cliente */
  clientePatterns: string[];
  /** Parole che appaiono in Textos.Descrizione dell'immobile */
  proprietaPatterns: string[];
}

/**
 * Mappa semantica del dominio immobiliare italiano.
 * Ogni categoria rappresenta un concetto che il cliente può esprimere
 * in linguaggio naturale e che il sistema cerca nelle descrizioni.
 *
 * Esempi reali:
 *   - Cliente scrive "vista mare" → cerca "mare", "lungomare" in descrizione
 *   - Cliente scrive "silenzioso" → cerca "tranquillo", "quiete" in descrizione
 *   - Cliente scrive "vicino scuole" → cerca "scuola" in descrizione
 */
const SEMANTIC_MAP: Record<string, SemanticEntry> = {
  vista_mare: {
    clientePatterns:   ['mare', 'vista mare', 'vicino al mare', 'sul mare', 'spiaggia', 'lungomare', 'fronte mare'],
    proprietaPatterns: ['mare', 'vista mare', 'lungomare', 'spiaggia', 'fronte mare', 'vista sul mare', 'panorama mare'],
  },
  luminoso: {
    clientePatterns:   ['luminoso', 'luminosa', 'luminosità', 'soleggiato', 'luce', 'luminosa'],
    proprietaPatterns: ['luminoso', 'luminosa', 'luminosità', 'soleggiato', 'ben illuminato', 'luce naturale', 'esposizione'],
  },
  tranquillo: {
    clientePatterns:   ['silenzioso', 'tranquillo', 'tranquilla', 'quieto', 'quiete', 'zona tranquilla', 'silenzio'],
    proprietaPatterns: ['silenzioso', 'silenziosa', 'tranquillo', 'tranquilla', 'quieto', 'quiete', 'zona tranquilla'],
  },
  piano_alto: {
    clientePatterns:   ['piano alto', 'attico', 'panorama', 'ultimo piano', 'vista dall alto', 'in alto'],
    proprietaPatterns: ['piano alto', 'attico', 'panorama', 'panoramica', 'vista panoramica', 'ultimo piano', 'quarto piano', 'quinto piano'],
  },
  scuole: {
    clientePatterns:   ['scuola', 'scuole', 'bambini', 'istruzione', 'vicino scuola'],
    proprietaPatterns: ['scuola', 'scuole', 'vicino alle scuole', 'zona scolastica', 'istituto'],
  },
  terrazza: {
    clientePatterns:   ['terrazza', 'terrazzo', 'terrazza grande', 'ampia terrazza', 'spazio aperto esterno'],
    proprietaPatterns: ['ampia terrazza', 'grande terrazza', 'terrazza panoramica', 'terrazzato', 'terrazza abitabile', 'terrazzo grande'],
  },
  giardino: {
    clientePatterns:   ['giardino', 'verde', 'spazio verde', 'spazio esterno', 'prato', 'area verde'],
    proprietaPatterns: ['giardino', 'giardino privato', 'verde', 'spazio verde', 'prato', 'area verde', 'giardino condominiale'],
  },
  garage: {
    clientePatterns:   ['garage', 'box auto', 'posto auto coperto', 'parcheggio coperto', 'autorimessa'],
    proprietaPatterns: ['garage', 'box auto', 'posto auto coperto', 'autorimessa', 'box privato'],
  },
  piscina: {
    clientePatterns:   ['piscina', 'nuotare'],
    proprietaPatterns: ['piscina', 'piscina privata', 'piscina condominiale'],
  },
  centro: {
    clientePatterns:   ['centro', 'centrale', 'centro storico', 'in centro', 'vicino centro', 'zona centrale'],
    proprietaPatterns: ['centro', 'centrale', 'centro storico', 'pieno centro', 'zona centrale', 'cuore della città'],
  },
  ristrutturato: {
    clientePatterns:   ['ristrutturato', 'ristrutturata', 'nuovo', 'nuova costruzione', 'moderno', 'moderna', 'appena ristrutturato'],
    proprietaPatterns: ['ristrutturato', 'ristrutturata', 'nuovo', 'nuova costruzione', 'appena ristrutturato', 'completamente ristrutturato', 'recente ristrutturazione'],
  },
  investimento: {
    clientePatterns:   ['investimento', 'rendita', 'reddito', 'investire', 'rendimento', 'affittare'],
    proprietaPatterns: ['investimento', 'ottimo investimento', 'reddito', 'rendita', 'già affittato', 'affittato', 'rendimento', 'buon investimento'],
  },
  aria_condizionata: {
    clientePatterns:   ['aria condizionata', 'climatizzazione', 'climatizzato', 'fresco', 'clima'],
    proprietaPatterns: ['aria condizionata', 'climatizzazione', 'climatizzato', 'split', 'clima'],
  },
  ascensore: {
    clientePatterns:   ['ascensore', 'senza scale', 'accessibile', 'elevatore'],
    proprietaPatterns: ['ascensore', 'con ascensore', 'ascensore presente', 'elevatore'],
  },
  cantina: {
    clientePatterns:   ['cantina', 'ripostiglio', 'deposito', 'sgombero'],
    proprietaPatterns: ['cantina', 'ripostiglio', 'deposito', 'sgombero', 'locale di servizio'],
  },
  parcheggio: {
    clientePatterns:   ['parcheggio', 'posto auto', 'posteggio', 'parchegggio privato'],
    proprietaPatterns: ['parcheggio', 'posto auto', 'posteggio', 'posto macchina', 'parcheggio privato'],
  },
};

/**
 * Calcola il punteggio semantico confrontando NoteRichiesta del cliente
 * con Textos.Descrizione dell'immobile.
 *
 * Logica:
 * 1. Cerca categorie richieste dal cliente nelle sue note
 * 2. Per ogni categoria richiesta, verifica se la descrizione le menziona
 * 3. Score = categorie_trovate / categorie_richieste
 *
 * Se il cliente non ha note → WILDCARD_SCORE (neutro, non premia né penalizza)
 */
function semanticScore(
  noteRichiesta: string,
  descrizione: string,
): { score: number; matched: string[] } {
  if (!noteRichiesta || noteRichiesta.trim() === '') {
    return { score: WILDCARD_SCORE, matched: [] };
  }

  const noteNorm = noteRichiesta.toLowerCase();
  const descNorm = (descrizione || '').toLowerCase();

  const requested: string[] = [];
  const matched: string[] = [];

  for (const [category, entry] of Object.entries(SEMANTIC_MAP)) {
    const clienteWants = entry.clientePatterns.some(p => noteNorm.includes(p));
    if (!clienteWants) continue;

    requested.push(category);
    const propertyHasIt = entry.proprietaPatterns.some(p => descNorm.includes(p));
    if (propertyHasIt) matched.push(category);
  }

  // Nessuna categoria riconosciuta nelle note → neutro
  if (requested.length === 0) return { score: WILDCARD_SCORE, matched: [] };

  const score = matched.length / requested.length;
  return { score, matched };
}

// ══════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL DE MATCHING
// ══════════════════════════════════════════════════════════════════

export function calculateMatch(richiesta: Richiesta, immobile: any): MatchResult | null {
  const gc  = immobile.GestioneCommerciale || {};
  const db  = immobile.DatiBase            || {};
  const df  = immobile.DettagliFisici      || {};
  const car = immobile.Caratteristiche     || {};
  const tex = immobile.Textos              || {};

  // ── GATE 1: Operazione (Vendita / Affitto) ──────────────────────
  const wantsVendita = richiesta.Operazione?.Vendita;
  const wantsAffitto = richiesta.Operazione?.Affitto;
  const operazioneWildcard = !wantsVendita && !wantsAffitto;

  if (!operazioneWildcard) {
    if (wantsVendita && !wantsAffitto && !gc.InVendita) return null;
    if (wantsAffitto && !wantsVendita && !gc.InAffitto) return null;
    if (wantsVendita && wantsAffitto && !gc.InVendita && !gc.InAffitto) return null;
  }

  // ── GATE 2: Caratteristiche obbligatorie (hard filter) ──────────
  // Solo le caratteristiche esplicitamente richieste (true) sono gate.
  // Campi assenti → trattati come false (sicuro per doc legacy).
  const carRichieste = richiesta.Caratteristiche;
  if (carRichieste) {
    for (const key of Object.keys(carRichieste)) {
      if (carRichieste[key] === true && !car[key]) return null;
    }
  }

  // ── GATE 3: Tipologia incompatibile (hard filter) ─────────────────
  // Se il cliente ha specificato delle tipologie E la proprietà appartiene
  // a una categoria completamente diversa (score 0.0), viene esclusa.
  // Casi NON esclusi: stessa famiglia residenziale (0.5) o DA SCEGLIERE (0.3).
  // Questo evita che un locale commerciale appaia per chi cerca appartamenti.
  if (richiesta.Tipologie && richiesta.Tipologie.length > 0) {
    const tipoCheck = tipologiaScore(richiesta.Tipologie, db.Tipologia || '');
    if (tipoCheck === 0.0) return null;
  }

  // ── Prezzo rilevante per l'operazione richiesta ──────────────────
  let precio = 0;
  let budgetMin: number | '' | undefined;
  let budgetMax: number | '' | undefined;

  if (operazioneWildcard) {
    precio = Number(gc.PrezzoVendita || gc.PrezzoAffitto || 0);
  } else if (wantsVendita && gc.InVendita) {
    precio = Number(gc.PrezzoVendita || 0);
    budgetMin = richiesta.BudgetAcquistoMin;
    budgetMax = richiesta.BudgetAcquistoMax;
  } else if (wantsAffitto && gc.InAffitto) {
    precio = Number(gc.PrezzoAffitto || 0);
    budgetMin = richiesta.BudgetAffittoMin;
    budgetMax = richiesta.BudgetAffittoMax;
  }

  // ── Helper per aggiungere un criterio al breakdown ───────────────
  const breakdown: ScoreBreakdown[] = [];
  const push = (
    criterio: string,
    score: number,
    peso: number,
    label: string,
    wildcard: boolean,
  ) => {
    breakdown.push({
      criterio,
      score,
      peso,
      puntos: +(score * peso).toFixed(1),
      label: wildcard ? `${label} (auto)` : label,
      wildcard,
    });
  };

  // ── 1. PRESUPUESTO (27 pts) — Fuzzy: 15% sopra, 10% sotto ───────
  const budgetWildcard = isEmpty(budgetMin) && isEmpty(budgetMax);
  const presupuestoS = budgetWildcard
    ? WILDCARD_SCORE
    : fuzzyBudgetScore(precio, budgetMin, budgetMax);
  push('presupuesto', presupuestoS, WEIGHTS.presupuesto, 'Prezzo', budgetWildcard);

  // ── 2. ZONA (20 pts) — Esatto + adiacenza cluster ───────────────
  const zonaWildcard = !richiesta.Zone || richiesta.Zone.length === 0;
  const zonaS = zonaScore(db.Zona || '', richiesta.Zone || []);
  push('zona', zonaS, WEIGHTS.zona, 'Zona', zonaWildcard);

  // ── 3. TIPOLOGIA (18 pts) — Stemming + sinonimi + DA SCEGLIERE ──
  const tipoWildcard = !richiesta.Tipologie || richiesta.Tipologie.length === 0;
  const tipoS = tipologiaScore(richiesta.Tipologie || [], db.Tipologia || '');
  push('tipologia', tipoS, WEIGHTS.tipologia, 'Tipologia', tipoWildcard);

  // ── 4. STATO FINITURE (7 pts) — Prossimità scala qualitativa ────
  const finitureWildcard = !richiesta.StatoFinitureAccettati || richiesta.StatoFinitureAccettati.length === 0;
  const finitureS = statoFinitureScore(df.StatoFiniture || '', richiesta.StatoFinitureAccettati || []);
  push('finiture', finitureS, WEIGHTS.finiture, 'Finiture', finitureWildcard);

  // ── 5. SUPERFICIE (9 pts) — Range stretto ────────────────────────
  const supWildcard = isEmpty(richiesta.SuperficieMin) && isEmpty(richiesta.SuperficieMax);
  const mq = Number(df.MetriCommerciali || 0);
  const superficieS = supWildcard
    ? WILDCARD_SCORE
    : strictRangeScore(mq, richiesta.SuperficieMin, richiesta.SuperficieMax);
  push('superficie', superficieS, WEIGHTS.superficie, 'Superficie', supWildcard);

  // ── 6. CAMERE DA LETTO (6 pts) — Scalato ±2 ─────────────────────
  const camWildcard = isEmpty(richiesta.CamereLettoMin);
  const camere = Number(df.CamereLetto || 0);
  const camereS = camWildcard ? WILDCARD_SCORE : stepScore(camere, richiesta.CamereLettoMin);
  push('camere', camereS, WEIGHTS.camere, 'Camere', camWildcard);

  // ── 7. BAGNI (2 pts) — Scalato ±2 ───────────────────────────────
  const bagniWildcard = isEmpty(richiesta.BagniMin);
  const bagni = Number(df.Bagni || 0);
  const bagniS = bagniWildcard ? WILDCARD_SCORE : stepScore(bagni, richiesta.BagniMin);
  push('bagni', bagniS, WEIGHTS.bagni, 'Bagni', bagniWildcard);

  // ── 8. LOCALI / VANI (2 pts) — Scalato ±2 ───────────────────────
  const localiWildcard = isEmpty(richiesta.LocaliMin);
  const vani = Number(df.Vani || 0);
  const localiS = localiWildcard ? WILDCARD_SCORE : stepScore(vani, richiesta.LocaliMin);
  push('locali', localiS, WEIGHTS.locali, 'Locali', localiWildcard);

  // ── 9. PIANO (2 pts) ─────────────────────────────────────────────
  const pianoWildcard = !richiesta.PianoPreferenza || richiesta.PianoPreferenza === 'Qualsiasi';
  const pianoS = pianoScore(df.Piano || '', richiesta.PianoPreferenza || '');
  push('piano', pianoS, WEIGHTS.piano, 'Piano', pianoWildcard);

  // ── 10. ARREDAMENTO (1 pt) ───────────────────────────────────────
  const arredWildcard = !richiesta.ArredamentoPreferenza || richiesta.ArredamentoPreferenza === 'Indifferente';
  const arredS = arredamentoScore(car, richiesta.ArredamentoPreferenza || '');
  push('arredamento', arredS, WEIGHTS.arredamento, 'Arredamento', arredWildcard);

  // ── 11. SEMANTICO (6 pts) — NoteRichiesta ↔ Textos.Descrizione ──
  const noteRichiesta = richiesta.NoteRichiesta || '';
  const descrizione   = tex.Descrizione || '';
  const { score: semanticoS, matched: semanticMatches } = semanticScore(noteRichiesta, descrizione);
  const semanticoWildcard = !noteRichiesta || noteRichiesta.trim() === '';
  push('semantico', semanticoS, WEIGHTS.semantico, 'Note & Descrizione', semanticoWildcard);

  // ── PUNTEGGIO TOTALE ─────────────────────────────────────────────
  const totalScore = Math.round(breakdown.reduce((sum, b) => sum + b.puntos, 0));

  return {
    immobileId: immobile.id,
    codice:     db.Codice || '',
    matchPercentage: Math.min(100, Math.max(0, totalScore)),
    breakdown,
    semanticMatches,
    snippet: {
      indirizzo: db.Indirizzo || '',
      citta:     db.Citta    || '',
      zona:      db.Zona     || '',
      tipologia: db.Tipologia || '',
      prezzo:    precio,
      mq,
      camere,
      bagni,
      mainImage: Array.isArray(immobile.images) && immobile.images.length > 0
        ? immobile.images[0]
        : '',
      piano:      df.Piano || '',
      descrizione: descrizione.slice(0, 200),
    },
  };
}

// ══════════════════════════════════════════════════════════════════
// SUMMARY — Testo leggibile per le card di matching
// ══════════════════════════════════════════════════════════════════

export function generateMatchSummary(breakdown: ScoreBreakdown[]): string {
  const highlights: string[] = [];
  const lowPoints: string[] = [];

  for (const b of breakdown) {
    if (b.wildcard) continue; // i wildcard non sono traguardi, non si mostrano

    if (b.score >= 0.9 && b.peso >= 5) {
      highlights.push(b.label);
    } else if (b.score < 0.5 && b.peso >= 5) {
      lowPoints.push(b.score === 0 ? `${b.label} ✗` : `${b.label} parziale`);
    }
  }

  const parts: string[] = [];
  if (highlights.length > 0) parts.push(`✓ ${highlights.join(', ')}`);
  if (lowPoints.length > 0) parts.push(`⚠ ${lowPoints.join(', ')}`);
  return parts.join(' · ') || 'Match calcolato';
}
