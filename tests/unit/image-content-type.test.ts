import { describe, it, expect } from 'vitest';
import { normalizeImageContentType } from '@/lib/image-content-type';

describe('normalizeImageContentType — tipos permitidos', () => {
  it('acepta los formatos que se suben de verdad al CRM', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']) {
      expect(normalizeImageContentType(t)).toBe(t);
    }
  });

  it('ignora mayusculas', () => {
    expect(normalizeImageContentType('IMAGE/JPEG')).toBe('image/jpeg');
    expect(normalizeImageContentType('Image/Png')).toBe('image/png');
  });

  it('descarta los parametros y los espacios', () => {
    expect(normalizeImageContentType('image/jpeg; charset=utf-8')).toBe('image/jpeg');
    expect(normalizeImageContentType('  image/webp  ')).toBe('image/webp');
    expect(normalizeImageContentType('image/png;q=0.9')).toBe('image/png');
  });
});

describe('normalizeImageContentType — el ataque que cierra', () => {
  it('rechaza text/html, que es el XSS de mismo origen', () => {
    expect(normalizeImageContentType('text/html')).toBeNull();
    expect(normalizeImageContentType('text/html; charset=utf-8')).toBeNull();
  });

  it('rechaza SVG aunque sea una imagen: es un documento y ejecuta JavaScript', () => {
    expect(normalizeImageContentType('image/svg+xml')).toBeNull();
    expect(normalizeImageContentType('IMAGE/SVG+XML')).toBeNull();
  });

  it('rechaza otros tipos ejecutables o ambiguos', () => {
    for (const t of [
      'application/javascript',
      'text/javascript',
      'application/xhtml+xml',
      'text/xml',
      'application/pdf',
      'application/octet-stream',
    ]) {
      expect(normalizeImageContentType(t)).toBeNull();
    }
  });

  it('no se deja colar un tipo permitido como parametro de uno prohibido', () => {
    // El primer segmento es lo unico que cuenta: aqui es text/html.
    expect(normalizeImageContentType('text/html; x=image/jpeg')).toBeNull();
  });

  it('rechaza la ausencia de Content-Type en vez de suponer que es una imagen', () => {
    expect(normalizeImageContentType(null)).toBeNull();
    expect(normalizeImageContentType(undefined)).toBeNull();
    expect(normalizeImageContentType('')).toBeNull();
    expect(normalizeImageContentType('   ')).toBeNull();
    expect(normalizeImageContentType(';charset=utf-8')).toBeNull();
  });

  it('rechaza un prefijo image/ que no este en la lista', () => {
    expect(normalizeImageContentType('image/x-icon')).toBeNull();
    expect(normalizeImageContentType('image/')).toBeNull();
  });
});
