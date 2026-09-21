import { describe, it, expect } from 'vitest';
import { urlDeDescarga, esRutaPublica, extraerRutaDeUrl } from '@/lib/storage-urls';

const BUCKET = 'crm-pantaleo-propio.firebasestorage.app';
const publica = (ruta: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(ruta)}?alt=media&token=e162684a-e9f1-4ffc-9565-3fbc7226a2f8`;

describe('urlDeDescarga — por dónde se pide cada fichero', () => {
  it('un folio de visita firmado se pide por el proxy autenticado', () => {
    // Es el caso que importa: 320 de estos son hoy descargables sin sesión.
    const guardada = publica('documenti_generati/Foglio_Visita_-_ROSSI_1789121171774.pdf');
    expect(urlDeDescarga(guardada)).toBe(
      '/api/files?path=documenti_generati%2FFoglio_Visita_-_ROSSI_1789121171774.pdf',
    );
  });

  it('un contrato o una planimetría de un inmueble, también', () => {
    const guardada = publica('immobili/abc123/documenti/contratto.pdf');
    expect(urlDeDescarga(guardada)).toContain('/api/files?path=');
    expect(urlDeDescarga(guardada)).toContain('immobili');
  });

  it('LAS FOTOS DE INMUEBLES SE QUEDAN PÚBLICAS: Idealista las descarga sin sesión', () => {
    // Romper esto despublicaría el escaparate de la agencia.
    const foto = publica('immobili/abc123/foto/imagen1.jpg');
    expect(urlDeDescarga(foto)).toBe(foto);
    expect(esRutaPublica('immobili/abc123/foto/imagen1.jpg')).toBe(true);
  });

  it('propiedades_fotos/ TAMBIÉN es pública: son las fotos de 110 inmuebles vivos', () => {
    // El caso que casi se revoca. Este prefijo no aparecía en ninguna lista del
    // proyecto —ni aquí ni en la allowlist de sanitize.ts— y sin embargo es el
    // ÚNICO prefijo heredado con ficheros de verdad: 443 image/jpeg contados en
    // el bucket. El guion bajo hace que `/^propiedades\//` no lo reconozca, así
    // que se clasificaba como documento privado.
    const ruta = 'propiedades_fotos/10532/Rif.10532+imagen1.jpg';
    expect(esRutaPublica(ruta)).toBe(true);
    const u = publica(ruta);
    expect(urlDeDescarga(u)).toBe(u);
  });

  it('y el guion bajo no se cuela al revés: propiedades_docs/ NO es pública', () => {
    // Que el arreglo no se haya pasado de ancho con un `startsWith`.
    expect(esRutaPublica('propiedades_docs/1/contrato.pdf')).toBe(false);
  });

  it('las dos rutas de fotos heredadas también siguen públicas', () => {
    for (const ruta of ['inmuebles/x/1.jpg', 'propiedades/y/2.jpg']) {
      const u = publica(ruta);
      expect(urlDeDescarga(u)).toBe(u);
    }
  });

  it('una URL que ya es privada se queda como está: la función es idempotente', () => {
    const ya = '/api/files?path=documenti_generati%2Fx.pdf';
    expect(urlDeDescarga(ya)).toBe(ya);
    expect(urlDeDescarga(urlDeDescarga(ya))).toBe(ya);
  });

  it('aplicarla dos veces sobre una pública da lo mismo que una', () => {
    const guardada = publica('documenti_generati/x.pdf');
    expect(urlDeDescarga(urlDeDescarga(guardada))).toBe(urlDeDescarga(guardada));
  });

  it('también entiende la otra forma de URL de Storage', () => {
    const otra = `https://storage.googleapis.com/${BUCKET}/documenti_generati/x.pdf`;
    expect(urlDeDescarga(otra)).toContain('/api/files?path=');
  });

  it('lo que no se sabe interpretar se devuelve TAL CUAL', () => {
    // Romper un enlace que hoy funciona sería peor que dejarlo pasar.
    for (const v of ['https://ejemplo.com/algo.pdf', 'no-es-una-url', 'data:application/pdf;base64,AAA']) {
      expect(urlDeDescarga(v)).toBe(v);
    }
  });

  it('vacío, nulo o indefinido dan cadena vacía y no revientan', () => {
    for (const v of ['', null, undefined, 0 as any, {} as any]) {
      expect(urlDeDescarga(v as any)).toBe('');
    }
  });

  it('la ruta se puede recuperar de la URL que devuelve, que es lo que necesita el borrado', () => {
    // El DELETE de /api/upload y el cron de purga localizan el fichero del
    // bucket a partir de la URL guardada: si la nueva forma no se pudiera
    // interpretar, se quedarían huérfanos pagando sitio.
    const ruta = 'documenti_generati/x.pdf';
    expect(extraerRutaDeUrl(urlDeDescarga(publica(ruta)))).toBe(ruta);
  });
});
