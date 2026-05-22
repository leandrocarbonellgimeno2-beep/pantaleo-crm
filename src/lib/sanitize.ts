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
