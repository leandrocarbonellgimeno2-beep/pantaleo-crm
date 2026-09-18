/**
 * Esqueleto de un inmueble nuevo, con los valores por defecto del alta.
 *
 * El `Codice` lo asigna el SERVIDOR al guardar (contador atómico en
 * counters/immobili_codice, base 1000000). Aquí va un marcador visible para que
 * nadie lo confunda con un código real: el definitivo llega en la respuesta del
 * POST.
 */
export const CODICE_PLACEHOLDER = '---';

export function createEmptyProperty(ownerId?: string) {
  return {
    proprietarioId_real: ownerId || '',
    proprietarioId: ownerId || '', // compatibility
    DatiBase: {
      Codice: CODICE_PLACEHOLDER,
      Riferimento: '',
      Tipologia: 'Appartamento',
      Indirizzo: '',
      Citta: '',
      CAP: '',
      Zona: '',
    },
    DettagliFisici: {
      MetriCommerciali: '',
      Vani: '',
      CamereLetto: '',
      Bagni: '',
      Piano: '',
      StatoFiniture: 'Abitabile',
      TipoEdificio: 'Unica Elevazione',
      ClasseEnergetica: 'G',
    },
    Caratteristiche: {
      Ascensore: false,
      RiscaldamentoAutonomo: false,
      AriaCondizionata: false,
      VistaMare: false,
      Balcone: false,
      Garage: false,
      Terrazza: false,
      Giardino: false,
      PostoAutoScoperto: false,
      CucinaAbitabile: false,
    },
    GestioneCommerciale: {
      InVendita: true,
      InAffitto: false,
      PrezzoVendita: '',
      PrezzoAffitto: '',
      PrezzoMinimo: '',
      SpeseCondominio: '',
      Amministratore: '',
      Sospeso: false,
    },
    Documentazione: {
      Planimetria: '-- Non specificato --',
      UrlPlanimetria: '',
      AttoImmobile: '-- Non specificato --',
      UrlAttoImmobile: '',
      StatoChiavi: '-- Non specificato --',
      UrlAltriDocumenti: '',
    },
    Textos: {
      Descrizione: '',
      NoteInterne: '',
    },
    images: [] as string[],
  };
}
