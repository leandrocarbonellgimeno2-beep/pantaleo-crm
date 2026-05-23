import { describe, it, expect } from 'vitest';
import {
  sanitizeBody,
  sanitizeStoragePath,
  IMMOBILI_ALLOWED,
  CLIENTI_ALLOWED,
  PROPRIETARI_ALLOWED,
} from '@/lib/sanitize';

// ── sanitizeStoragePath ───────────────────────────────────────────────────────

describe('sanitizeStoragePath — prefissi consentiti', () => {
  const validPaths = [
    'immobili/P001/foto/FotoN_1234567890.webp',
    'inmuebles/P001/foto/legacy.jpg',
    'propiedades/abc/doc.pdf',
    'proprietari_docs/ownerId123/firma_1234567890.png',
    'clienti/clientId456/documenti/passaporto.pdf',
    'documenti/template_incarico.pdf',
    'documenti_generati/Foglio_Visita_1234567890.pdf',
    'documenti_generati/Incarico_Locazione_1234567890.pdf',
    'documenti_generati/Incarico_Stagionale_1234567890.pdf',
    'documenti_generati/Incarico_Acquisto_1234567890.pdf',
    'documenti_generati/Incarico_Esclusiva_1234567890.pdf',
    'templates/1234567890_incarico_vendita.pdf',
    'temp/upload_staging.pdf',
  ];

  it.each(validPaths)('accetta path legittimo: %s', (path) => {
    expect(() => sanitizeStoragePath(path)).not.toThrow();
    expect(sanitizeStoragePath(path)).toBe(path);
  });

  it('normalizza leading slash', () => {
    expect(sanitizeStoragePath('/immobili/P001/foto.jpg')).toBe('immobili/P001/foto.jpg');
  });
});

describe('sanitizeStoragePath — attacchi bloccati', () => {
  it('blocca path traversal con ..', () => {
    expect(() => sanitizeStoragePath('documenti_generati/../../../etc/passwd')).toThrow('Path traversal');
  });

  it('blocca prefisso arbitrario', () => {
    expect(() => sanitizeStoragePath('hacker/evil.pdf')).toThrow('Prefisso path non consentito');
  });

  it('blocca file in radice del bucket', () => {
    expect(() => sanitizeStoragePath('evil.pdf')).toThrow('Prefisso path non consentito');
  });

  it('blocca null byte', () => {
    expect(() => sanitizeStoragePath('documenti_generati/test\x00.pdf')).toThrow('caratteri non validi');
  });

  it('blocca path vuoto', () => {
    expect(() => sanitizeStoragePath('')).toThrow('vuoto');
  });

  it('blocca path oltre 500 caratteri', () => {
    expect(() => sanitizeStoragePath('immobili/' + 'a'.repeat(495))).toThrow('troppo lungo');
  });

  it('blocca segmenti vuoti (doppio slash)', () => {
    expect(() => sanitizeStoragePath('immobili//foto.jpg')).toThrow('malformato');
  });

  it('blocca input non-stringa', () => {
    expect(() => sanitizeStoragePath(null as any)).toThrow('non valido');
  });
});

// ── sanitizeBody ──────────────────────────────────────────────────────────────

describe('sanitizeBody — immobili', () => {
  it('accetta tutti i campi della whitelist', () => {
    const body = {
      DatiBase: { Codice: 'P001', Indirizzo: 'Via Roma 1' },
      GestioneCommerciale: { InVendita: true, PrezzoVendita: 250000 },
      DettagliFisici: { MetriCommerciali: 90 },
      images: ['https://example.com/img.jpg'],
      proprietarioId: 'owner123',
      note: 'Vista mare',
    };
    const result = sanitizeBody(body, IMMOBILI_ALLOWED, 'test');
    expect(result).toMatchObject(body);
  });

  it('rimuove _status (forbidden)', () => {
    const body = { DatiBase: { Codice: 'P001' }, _status: 'admin' };
    const result = sanitizeBody(body, IMMOBILI_ALLOWED, 'test');
    expect(result).not.toHaveProperty('_status');
    expect(result).toHaveProperty('DatiBase');
  });

  it('rimuove _deletedAt (forbidden)', () => {
    const body = { DatiBase: { Codice: 'P001' }, _deletedAt: 0 };
    const result = sanitizeBody(body, IMMOBILI_ALLOWED, 'test');
    expect(result).not.toHaveProperty('_deletedAt');
  });

  it('rimuove createdAt e updatedAt (forbidden — gestiti dal server)', () => {
    const body = { DatiBase: { Codice: 'P001' }, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const result = sanitizeBody(body, IMMOBILI_ALLOWED, 'test');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('updatedAt');
  });

  it('rimuove campi completamente arbitrari', () => {
    const body = { DatiBase: { Codice: 'P001' }, campoInventato: 'valore', __proto__: {} };
    const result = sanitizeBody(body, IMMOBILI_ALLOWED, 'test');
    expect(result).not.toHaveProperty('campoInventato');
  });
});

describe('sanitizeBody — clienti', () => {
  it('accetta strutture annidate DatiPersonali e Richiesta', () => {
    const body = {
      DatiPersonali: { Nome: 'Mario', Cognome: 'Rossi', Telefono: '3331234567' },
      Richiesta: { Operazione: { Vendita: true }, Budget: 200000 },
      note: 'Cliente prioritario',
    };
    const result = sanitizeBody(body, CLIENTI_ALLOWED, 'test');
    expect(result).toMatchObject(body);
  });

  it('blocca iniezione di _status nel documento cliente', () => {
    const body = { DatiPersonali: { Nome: 'Mario' }, _status: 'pendente_cancellazione' };
    const result = sanitizeBody(body, CLIENTI_ALLOWED, 'test');
    expect(result).not.toHaveProperty('_status');
  });
});

describe('sanitizeBody — proprietari', () => {
  it('accetta i campi di identità e contatto', () => {
    const body = {
      nome: 'Francesco',
      cognome: 'Pantaleo',
      email: 'f.pantaleo@example.com',
      cellulare: '3331234567',
      indirizzo: 'Via Etnea 1',
      citta: 'Catania',
    };
    const result = sanitizeBody(body, PROPRIETARI_ALLOWED, 'test');
    expect(result).toMatchObject(body);
  });

  it('rimuove id (il server lo gestisce)', () => {
    const body = { nome: 'Francesco', id: 'faked-id-123' };
    const result = sanitizeBody(body, PROPRIETARI_ALLOWED, 'test');
    expect(result).not.toHaveProperty('id');
  });
});

describe('sanitizeBody — edge cases', () => {
  it('restituisce {} per input non-oggetto', () => {
    expect(sanitizeBody(null as any, IMMOBILI_ALLOWED, 'test')).toEqual({});
    expect(sanitizeBody('stringa' as any, IMMOBILI_ALLOWED, 'test')).toEqual({});
  });

  it('restituisce {} per body vuoto', () => {
    expect(sanitizeBody({}, IMMOBILI_ALLOWED, 'test')).toEqual({});
  });
});
