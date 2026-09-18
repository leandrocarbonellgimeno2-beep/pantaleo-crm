/**
 * Construcción de mensajes de WhatsApp para un inmueble.
 *
 * Había dos implementaciones casi idénticas en immobili/page.tsx (el botón
 * Compartir del header y el envío desde el matching inverso) que ya habían
 * divergido entre sí. Se unifican aquí conservando la salida EXACTA de cada
 * una: la diferencia queda explícita en la variante, no dispersa en dos
 * copias que se van separando.
 *
 * Diferencias reales entre variantes:
 *   share    — ciudad con preposición "a", combina precio de venta y alquiler
 *              si ambos están activos, sin descripción, Rif por defecto "N/A".
 *   proposal — zona o ciudad con preposición "in", un solo precio según
 *              InVendita (o "Su richiesta"), incluye extracto de descripción,
 *              Rif por defecto vacío.
 */

type AnyProperty = Record<string, any> | null | undefined;

export type WhatsAppVariant = 'share' | 'proposal';

const MAX_DESCRIPTION = 100;

/**
 * Quita todo lo que no sea ASCII imprimible o salto de línea. WhatsApp recibe
 * el texto por URL y los emojis y surrogates llegaban como rombos.
 */
export function sanitizeWhatsAppText(text: string): string {
  return text.replace(/[^\x20-\x7E\n]/g, '');
}

/** "Superficie: 90 mq - Camere: 3 - Bagni: 2", omitiendo lo que sea 0. */
function buildDetails(property: AnyProperty): string {
  const mq = Number(property?.DettagliFisici?.MetriCommerciali || 0);
  const camere = Number(property?.DettagliFisici?.CamereLetto || 0);
  const bagni = Number(property?.DettagliFisici?.Bagni || 0);
  return [
    mq > 0 ? `Superficie: ${mq} mq` : '',
    camere > 0 ? `Camere: ${camere}` : '',
    bagni > 0 ? `Bagni: ${bagni}` : '',
  ].filter(Boolean).join(' - ');
}

const euro = (value: number) => `€${value.toLocaleString('it-IT')}`;

export function buildPropertyWhatsAppMessage(
  property: AnyProperty,
  variant: WhatsAppVariant,
): string {
  const codice = String(property?.DatiBase?.Codice || (variant === 'share' ? 'N/A' : ''));
  const dettagli = buildDetails(property);

  if (variant === 'share') {
    const tipo = String(property?.DatiBase?.Tipologia || 'Immobile');
    const citta = String(property?.DatiBase?.Citta || '');

    let prezzoStr = '';
    if (property?.GestioneCommerciale?.InVendita) {
      const v = Number(property.GestioneCommerciale?.PrezzoVendita || 0);
      if (v > 0) prezzoStr = euro(v);
    }
    if (property?.GestioneCommerciale?.InAffitto) {
      const a = Number(property.GestioneCommerciale?.PrezzoAffitto || 0);
      if (a > 0) {
        const aStr = `${euro(a)}/mese`;
        prezzoStr = prezzoStr ? `${prezzoStr} - ${aStr}` : aStr;
      }
    }

    const lines = [
      `Immobiliare Pantaleo | Nuova Proposta!`,
      `${tipo}${citta ? ' a ' + citta : ''}`,
      `${prezzoStr ? 'Prezzo: ' + prezzoStr : ''}${dettagli ? (prezzoStr ? ' - ' : '') + dettagli : ''}`,
      `Rif: ${codice}`,
      `Contattaci per maggiori informazioni!`,
    ].filter(Boolean);

    return sanitizeWhatsAppText(lines.join('\n'));
  }

  // proposal
  const tipologia = String(property?.DatiBase?.Tipologia || 'immobile');
  const localita = property?.DatiBase?.Zona || property?.DatiBase?.Citta || '';

  const isVendita = property?.GestioneCommerciale?.InVendita;
  const rawPrezzo = Number(
    isVendita
      ? property?.GestioneCommerciale?.PrezzoVendita || 0
      : property?.GestioneCommerciale?.PrezzoAffitto || 0,
  );
  const prezzoStr = rawPrezzo > 0
    ? `${euro(rawPrezzo)}${isVendita ? '' : '/mese'}`
    : 'Su richiesta';

  const descrizioneFull = String(property?.Textos?.Descrizione || '');
  const descrizioneExt = descrizioneFull.length > MAX_DESCRIPTION
    ? descrizioneFull.slice(0, MAX_DESCRIPTION).trimEnd() + '...'
    : descrizioneFull;

  const lines = [
    `Immobiliare Pantaleo | Nuova Proposta!`,
    `${tipologia}${localita ? ' in ' + localita : ''}`,
    `Prezzo: ${prezzoStr}${dettagli ? ' - ' + dettagli : ''}`,
    `Rif: ${codice}`,
    descrizioneExt ? descrizioneExt : '',
    `Contattaci per maggiori informazioni!`,
  ].filter(Boolean);

  return sanitizeWhatsAppText(lines.join('\n'));
}

/**
 * Normaliza un teléfono italiano al formato que espera wa.me.
 * Devuelve null si no hay número utilizable.
 */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  let phone = (raw || '').replace(/[\s\-\.\(\)]/g, '');
  if (!phone) return null;
  if (!phone.startsWith('+')) phone = '+39' + phone;
  return phone.replace('+', '');
}

/** Abre wa.me. Sin número, WhatsApp muestra su propio selector de contacto. */
export function openWhatsApp(waNumber: string | null, message: string): void {
  const base = waNumber ? `https://wa.me/${waNumber}` : 'https://wa.me/';
  window.open(`${base}?text=${encodeURIComponent(message)}`, '_blank');
}
