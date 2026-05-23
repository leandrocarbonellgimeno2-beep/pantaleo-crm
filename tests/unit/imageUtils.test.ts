import { describe, it, expect } from 'vitest';
import { extractImageUrls } from '@/lib/imageUtils';

const FIREBASE_URL = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/foto.jpg?alt=media&token=abc';
const STORAGE_URL  = 'https://storage.googleapis.com/bucket/foto2.jpg';
const INVALID_URL  = 'not-a-url';

describe('extractImageUrls', () => {
  it('estrae da images (schema canonico)', () => {
    const data = { images: [FIREBASE_URL, STORAGE_URL] };
    expect(extractImageUrls(data)).toEqual([FIREBASE_URL, STORAGE_URL]);
  });

  it('estrae da Immagini (legacy top-level)', () => {
    const data = { Immagini: [FIREBASE_URL] };
    expect(extractImageUrls(data)).toContain(FIREBASE_URL);
  });

  it('estrae da Media.Immagini (schema nidificato)', () => {
    const data = { Media: { Immagini: [FIREBASE_URL] } };
    expect(extractImageUrls(data)).toContain(FIREBASE_URL);
  });

  it('estrae da Media.Urls', () => {
    const data = { Media: { Urls: [STORAGE_URL] } };
    expect(extractImageUrls(data)).toContain(STORAGE_URL);
  });

  it('estrae da DatiBase.Foto (legacy)', () => {
    const data = { DatiBase: { Foto: [FIREBASE_URL] } };
    expect(extractImageUrls(data)).toContain(FIREBASE_URL);
  });

  it('deduplica URL identici da più fonti', () => {
    const data = {
      images: [FIREBASE_URL],
      Immagini: [FIREBASE_URL],
      Media: { Immagini: [FIREBASE_URL] },
    };
    const result = extractImageUrls(data);
    expect(result.filter(u => u === FIREBASE_URL)).toHaveLength(1);
  });

  it('ignora URL non validi', () => {
    const data = { images: [FIREBASE_URL, INVALID_URL, '', null as any] };
    const result = extractImageUrls(data);
    expect(result).toContain(FIREBASE_URL);
    expect(result).not.toContain(INVALID_URL);
    expect(result).not.toContain('');
  });

  it('restituisce [] per documento senza immagini', () => {
    expect(extractImageUrls({})).toEqual([]);
    expect(extractImageUrls({ DatiBase: {} })).toEqual([]);
  });

  it('restituisce [] per input null/undefined', () => {
    expect(extractImageUrls(null as any)).toEqual([]);
    expect(extractImageUrls(undefined as any)).toEqual([]);
  });
});
