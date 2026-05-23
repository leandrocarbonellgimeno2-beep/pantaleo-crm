/**
 * Sanitizzazione body per route PATCH/POST.
 * Doppia difesa:
 *  1. ALWAYS_FORBIDDEN — campi che il server gestisce in autonomia; un client
 *     che li invia viene silenziosamente strippato (mai un 400, per non rompere
 *     il frontend, ma il warning resta in log).
 *  2. Whitelist per collezione — solo le chiavi top-level note sono accettate.
 *     Tutto il resto viene scartato con un console.warn che ci dice quale
 *     campo ha provato ad entrare.
 *
 * NOTA: la whitelist è solo sul TOP LEVEL del payload. La forma annidata di
 * `DatiBase`, `Richiesta`, ecc. resta sotto responsabilità del frontend — qui
 * blocchiamo solo l'attacco di iniezione di metadati di sistema (_status,
 * _deletedAt) o di campi completamente arbitrari.
 */

const ALWAYS_FORBIDDEN = ['_status', '_deletedAt', 'createdAt', 'updatedAt', 'id'] as const;

export function sanitizeBody<T extends Record<string, any>>(
  body: T,
  allowedKeys: readonly string[],
  context: string,
): Partial<T> {
  if (!body || typeof body !== 'object') return {};
  const out: Record<string, any> = {};
  const rejected: string[] = [];

  for (const key of Object.keys(body)) {
    if ((ALWAYS_FORBIDDEN as readonly string[]).includes(key)) {
      rejected.push(`${key}(forbidden)`);
      continue;
    }
    if (!allowedKeys.includes(key)) {
      rejected.push(key);
      continue;
    }
    out[key] = body[key];
  }

  if (rejected.length > 0) {
    console.warn(`[sanitize:${context}] rejected keys:`, rejected);
  }

  return out as Partial<T>;
}

// ── Whitelist per collezione ─────────────────────────────────────────────────

export const IMMOBILI_ALLOWED = [
  'DatiBase', 'GestioneCommerciale', 'DettagliFisici', 'Media', 'Idealista',
  'images', 'thumbnail',
  'proprietarioId', 'proprietarioId_real',
  'note',
  // legacy
  'Immagini', 'imageCount',
] as const;

export const CLIENTI_ALLOWED = [
  'DatiPersonali', 'Richiesta', 'Matching', 'Caratteristiche',
  'status', 'dataCreazione',
  'note', 'note_riservate',
  'firmaDigitale',
  // legacy top-level
  'nome', 'cognome', 'cell1',
] as const;

// ── Storage path sanitizer ───────────────────────────────────────────────────

/**
 * Prefissi consentiti per Firebase Storage. Qualunque upload deve iniziare con
 * uno di questi — chiude path traversal e scritture in posizioni arbitrarie
 * (es. radice del bucket, /.well-known, ecc).
 */
const STORAGE_PREFIX_ALLOWLIST = [
  'immobili/',          // path attuale per foto/planimetrie immobili
  'inmuebles/',         // legacy (nome spagnolo)
  'propiedades/',       // legacy
  'proprietari_docs/',
  'clienti/',
  'documenti/',
  'documenti_generati/',
  'templates/',
  'temp/',
] as const;

/**
 * Sanitizza un path destinato a Firebase Storage. Rilancia se trova:
 *  - segmenti `..` (path traversal)
 *  - leading `/` o `\` (uscita dal namespace)
 *  - null bytes o control chars (smuggling)
 *  - prefisso fuori dall'allowlist
 *  - più di 500 caratteri (deny-of-service via path enorme)
 */
export function sanitizeStoragePath(rawPath: string): string {
  if (typeof rawPath !== 'string') {
    throw new Error('Path mancante o non valido');
  }
  if (rawPath.length === 0 || rawPath.length > 500) {
    throw new Error('Path vuoto o troppo lungo');
  }

  // Normalizza separatori Windows → Unix
  let p = rawPath.replace(/\\/g, '/');

  // Rimuovi leading slashes (qualunque numero)
  p = p.replace(/^\/+/, '');

  // Blocca caratteri di controllo e null bytes
  if (/[\x00-\x1f]/.test(p)) {
    throw new Error('Path contiene caratteri non validi');
  }

  // Blocca path traversal (qualsiasi segmento ".." sia all'inizio, in mezzo o alla fine)
  const segments = p.split('/');
  if (segments.some(s => s === '..' || s === '.')) {
    throw new Error('Path traversal non consentito');
  }

  // Blocca segmenti vuoti (es. "a//b") — sintomo di manipolazione
  if (segments.some(s => s.length === 0)) {
    throw new Error('Path malformato');
  }

  // Verifica prefisso allowlist
  const allowed = STORAGE_PREFIX_ALLOWLIST.some(prefix => p.startsWith(prefix));
  if (!allowed) {
    throw new Error(`Prefisso path non consentito. Permessi: ${STORAGE_PREFIX_ALLOWLIST.join(', ')}`);
  }

  return p;
}

export const PROPRIETARI_ALLOWED = [
  // identità
  'nome', 'Nome', 'cognome', 'Cognome',
  'ragione_sociale', 'tipo', 'codice_fiscale', 'partita_iva',
  'data_nascita', 'luogo_nascita',
  // residenza
  'nazione', 'indirizzo_residenza', 'indirizzo', 'numero_civico',
  'citta_residenza', 'citta', 'cap', 'provincia',
  // contatti
  'email',
  'cellulare', 'telefono', 'cell1', 'Cellulare',
  'cellulare2', 'telefono2',
  'telefono_fisso', 'tel1',
  // note & flag commerciali
  'note', 'note_riservate',
  'interessato_vendita', 'interessato_locazione', 'in_esclusiva',
  'privacy_accettata',
  // stato amministrativo (questo è lo stato di business "Attivo/Disattivato",
  // NON il flag _status del soft-delete che resta forbidden)
  'stato', 'stato_chiavi',
  // firma e documenti
  'firmaDigitale', 'documenti',
  // contatori vetrina (vengono ricalcolati lato server ma li accettiamo per
  // compat retro — se arrivano stantii, vengono sovrascritti dal GET)
  'numero_immobili', 'immobili_collegati',
] as const;
