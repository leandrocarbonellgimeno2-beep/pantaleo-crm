/**
 * Los datos de la agencia que aparecen en las páginas legales.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTO ES LO ÚNICO QUE HAY QUE RELLENAR
 *
 * Están aquí, en un solo sitio, y no repartidos por los dos documentos: así se
 * completan una vez y las dos páginas quedan coherentes. Un dato escrito dos
 * veces es un dato que acaba diciendo dos cosas distintas.
 *
 * Los valores que empiezan por `[` son MARCADORES. Mientras alguno siga ahí,
 * las dos páginas muestran un aviso visible diciendo que el texto está
 * pendiente de completar — porque una política de privacidad con
 * «[RAZÓN SOCIAL]» publicada de verdad es peor que no tenerla.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ADVERTENCIA
 *
 * Estos textos son una BASE redactada siguiendo el RGPD para una agencia
 * inmobiliaria; no son asesoramiento legal. Antes de publicarlos conviene que
 * los revise quien lleve la parte legal de la agencia, sobre todo los plazos
 * de conservación y la lista de encargados del tratamiento, que dependen de
 * los contratos reales que tenga firmados.
 */

export interface DatosTitular {
  /** Denominación completa de la sociedad. */
  razonSocial: string;
  /** Nombre comercial, el que ve el cliente. */
  nombreComercial: string;
  /** Domicilio fiscal completo. */
  direccion: string;
  /** Partita IVA / Codice Fiscale. */
  partitaIva: string;
  /** Correo al que se dirigen las solicitudes de derechos RGPD. */
  emailPrivacidad: string;
  /** Correo general de contacto. */
  emailContacto: string;
  /** Teléfono de la agencia. */
  telefono: string;
  /** Foro competente para los términos (ciudad). */
  foro: string;
}

export const TITULAR: DatosTitular = {
  razonSocial: '[RAGIONE SOCIALE COMPLETA, es. "Immobiliare Pantaleo S.r.l."]',
  nombreComercial: 'Immobiliare Pantaleo',
  direccion: '[INDIRIZZO COMPLETO — via, numero, CAP, Marsala (TP), Italia]',
  partitaIva: '[PARTITA IVA / CODICE FISCALE]',
  emailPrivacidad: '[EMAIL PER LE RICHIESTE PRIVACY, es. privacy@...]',
  emailContacto: '[EMAIL DI CONTATTO]',
  telefono: '[TELEFONO]',
  foro: 'Marsala (TP)',
};

/** Fecha de la última revisión de los textos legales. */
export const ULTIMA_REVISION = '21 settembre 2026';

/** true si queda algún marcador sin rellenar. */
export function faltanDatosPorRellenar(datos: DatosTitular = TITULAR): boolean {
  return Object.values(datos).some((v) => typeof v === 'string' && v.trim().startsWith('['));
}
