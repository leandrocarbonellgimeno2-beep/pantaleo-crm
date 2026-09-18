import { describe, it, expect } from 'vitest';
import {
  buildPropertyWhatsAppMessage,
  sanitizeWhatsAppText,
  normalizeWhatsAppPhone,
} from '@/lib/immobili/whatsapp';

const property = {
  DatiBase: { Codice: '1001', Tipologia: 'Appartamento', Citta: 'Bari', Zona: 'Centro' },
  DettagliFisici: { MetriCommerciali: 90, CamereLetto: 3, Bagni: 2 },
  GestioneCommerciale: { InVendita: true, PrezzoVendita: 250000, InAffitto: true, PrezzoAffitto: 900 },
  Textos: { Descrizione: 'Bellissimo appartamento' },
};

describe('buildPropertyWhatsAppMessage — variante share (header)', () => {
  it('combina venta y alquiler y usa la ciudad con "a"', () => {
    expect(buildPropertyWhatsAppMessage(property, 'share')).toBe(
      [
        'Immobiliare Pantaleo | Nuova Proposta!',
        'Appartamento a Bari',
        'Prezzo: 250.000 - 900/mese - Superficie: 90 mq - Camere: 3 - Bagni: 2',
        'Rif: 1001',
        'Contattaci per maggiori informazioni!',
      ].join('\n'),
    );
  });

  it('sin precios, omite el prefijo Prezzo pero conserva los detalles', () => {
    const msg = buildPropertyWhatsAppMessage(
      { ...property, GestioneCommerciale: {} },
      'share',
    );
    expect(msg).toContain('Superficie: 90 mq');
    expect(msg).not.toContain('Prezzo:');
  });

  it('sin codice cae a N/A', () => {
    expect(buildPropertyWhatsAppMessage({ DatiBase: {} }, 'share')).toContain('Rif: N/A');
  });

  it('no incluye la descripcion', () => {
    expect(buildPropertyWhatsAppMessage(property, 'share')).not.toContain('Bellissimo');
  });
});

describe('buildPropertyWhatsAppMessage — variante proposal (matching inverso)', () => {
  it('usa la zona con "in", un solo precio y anade la descripcion', () => {
    expect(buildPropertyWhatsAppMessage(property, 'proposal')).toBe(
      [
        'Immobiliare Pantaleo | Nuova Proposta!',
        'Appartamento in Centro',
        'Prezzo: 250.000 - Superficie: 90 mq - Camere: 3 - Bagni: 2',
        'Rif: 1001',
        'Bellissimo appartamento',
        'Contattaci per maggiori informazioni!',
      ].join('\n'),
    );
  });

  it('cae a la ciudad si no hay zona', () => {
    const p = { ...property, DatiBase: { ...property.DatiBase, Zona: '' } };
    expect(buildPropertyWhatsAppMessage(p, 'proposal')).toContain('Appartamento in Bari');
  });

  it('sin precio dice "Su richiesta"', () => {
    const p = { ...property, GestioneCommerciale: { InVendita: true, PrezzoVendita: 0 } };
    expect(buildPropertyWhatsAppMessage(p, 'proposal')).toContain('Prezzo: Su richiesta');
  });

  it('alquiler puro anade /mese', () => {
    const p = { ...property, GestioneCommerciale: { InVendita: false, PrezzoAffitto: 900 } };
    expect(buildPropertyWhatsAppMessage(p, 'proposal')).toContain('Prezzo: 900/mese');
  });

  it('trunca la descripcion a 100 caracteres', () => {
    const p = { ...property, Textos: { Descrizione: 'a'.repeat(150) } };
    const msg = buildPropertyWhatsAppMessage(p, 'proposal');
    expect(msg).toContain('a'.repeat(100) + '...');
  });

  it('tolera un inmueble vacio', () => {
    expect(() => buildPropertyWhatsAppMessage(null, 'proposal')).not.toThrow();
    expect(buildPropertyWhatsAppMessage(null, 'proposal')).toContain('immobile');
  });
});

describe('sanitizeWhatsAppText', () => {
  it('elimina lo que no sea ASCII imprimible, incluido el simbolo de euro', () => {
    // Comportamiento preexistente: el euro tambien cae. Se documenta aqui.
    expect(sanitizeWhatsAppText('Prezzo: €100')).toBe('Prezzo: 100');
    expect(sanitizeWhatsAppText('ciao 😀 mondo')).toBe('ciao  mondo');
  });

  it('conserva los saltos de linea', () => {
    expect(sanitizeWhatsAppText('a\nb')).toBe('a\nb');
  });
});

describe('normalizeWhatsAppPhone', () => {
  it('limpia separadores y antepone el prefijo italiano', () => {
    expect(normalizeWhatsAppPhone('333 123-45.67')).toBe('393331234567');
  });

  it('respeta un prefijo internacional existente', () => {
    expect(normalizeWhatsAppPhone('+34 600 000 000')).toBe('34600000000');
  });

  it('devuelve null sin numero', () => {
    expect(normalizeWhatsAppPhone('')).toBeNull();
    expect(normalizeWhatsAppPhone(null)).toBeNull();
  });
});
