import { describe, it, expect } from 'vitest';
import { esRutaPublica, urlPrivada, extraerRutaDeUrl } from '@/lib/storage-urls';

describe('esRutaPublica — lo que Idealista tiene que poder descargar', () => {
  it('las fotos de un inmueble siguen siendo publicas', () => {
    expect(esRutaPublica('immobili/P001/foto/FotoN_1234567890.webp')).toBe(true);
    expect(esRutaPublica('immobili/1042/foto/a.jpg')).toBe(true);
  });

  it('los prefijos legacy de fotos se conservan publicos', () => {
    expect(esRutaPublica('inmuebles/P001/foto/legacy.jpg')).toBe(true);
    expect(esRutaPublica('propiedades/abc/foto.jpg')).toBe(true);
  });
});

describe('esRutaPublica — lo que deja de ser publico', () => {
  it('EL PUNTO DEL ARREGLO: los documentos de un inmueble comparten prefijo con las fotos', () => {
    // Mirar solo el prefijo "immobili/" habria dejado publicos la planimetria
    // y el atto. Por eso la clasificacion es por forma completa de ruta.
    expect(esRutaPublica('immobili/P001/documenti/planimetria.pdf')).toBe(false);
    expect(esRutaPublica('immobili/P001/documenti/atto.pdf')).toBe(false);
  });

  it('documentos de propietarios y clientes', () => {
    expect(esRutaPublica('proprietari_docs/owner1/firma_123.png')).toBe(false);
    expect(esRutaPublica('clienti/cli1/documenti/passaporto.pdf')).toBe(false);
  });

  it('contratos generados y plantillas', () => {
    expect(esRutaPublica('documenti_generati/Incarico_Vendita_123.pdf')).toBe(false);
    expect(esRutaPublica('documenti/template_incarico.pdf')).toBe(false);
    expect(esRutaPublica('templates/123_incarico.pdf')).toBe(false);
    expect(esRutaPublica('temp/algo.pdf')).toBe(false);
  });

  it('por defecto privado: un prefijo nuevo nace protegido', () => {
    expect(esRutaPublica('coleccion_futura/x.pdf')).toBe(false);
    expect(esRutaPublica('')).toBe(false);
  });

  it('no se puede colar un documento imitando la forma de una foto', () => {
    // "foto" tiene que ser el tercer segmento, no aparecer en cualquier sitio.
    expect(esRutaPublica('immobili/P001/documenti/foto/contrato.pdf')).toBe(false);
    expect(esRutaPublica('immobili/foto/x.pdf')).toBe(false);
    expect(esRutaPublica('otra/immobili/P001/foto/x.jpg')).toBe(false);
  });
});

describe('extraerRutaDeUrl — los dos formatos tienen que funcionar', () => {
  const BUCKET = 'crm-pantaleo-propio.firebasestorage.app';

  it('URL publica con token', () => {
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent('immobili/P001/foto/a.webp')}?alt=media&token=abc-123`;
    expect(extraerRutaDeUrl(url, BUCKET)).toBe('immobili/P001/foto/a.webp');
  });

  it('URL privada nueva', () => {
    expect(extraerRutaDeUrl('/api/files?path=immobili%2FP001%2Fdocumenti%2Fatto.pdf', BUCKET))
      .toBe('immobili/P001/documenti/atto.pdf');
  });

  it('la que genera urlPrivada se lee de vuelta sin perder nada', () => {
    // Ida y vuelta: es lo que garantiza que un documento subido hoy se pueda
    // borrar manana.
    for (const p of [
      'immobili/P001/documenti/atto.pdf',
      'clienti/cli 1/documenti/con espacios.pdf',
      'proprietari_docs/o1/firma_1.png',
    ]) {
      expect(extraerRutaDeUrl(urlPrivada(p), BUCKET)).toBe(p);
    }
  });

  it('formato legacy de storage.googleapis.com', () => {
    expect(extraerRutaDeUrl(`https://storage.googleapis.com/${BUCKET}/immobili/P001/foto/a.jpg`, BUCKET))
      .toBe('immobili/P001/foto/a.jpg');
  });

  it('devuelve null ante lo que no reconoce, en vez de inventarse una ruta', () => {
    // Importante: un null hace que el borrado devuelva 400 en vez de borrar
    // un fichero equivocado.
    expect(extraerRutaDeUrl('https://evil.example.com/immobili/x.jpg', BUCKET)).toBeNull();
    expect(extraerRutaDeUrl('no-es-una-url', BUCKET)).toBeNull();
    expect(extraerRutaDeUrl('', BUCKET)).toBeNull();
    expect(extraerRutaDeUrl('/api/files?sin=path', BUCKET)).toBeNull();
  });
});
