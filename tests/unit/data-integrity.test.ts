/**
 * DATA INTEGRITY TEST SUITE — QA Bot Automatizado
 *
 * Estos tests replican los objetos EXACTOS que el frontend envía a las APIs
 * y verifican que sanitizeBody() los preserva al 100%. Si un campo del
 * frontend no está en la whitelist, el test falla ANTES de llegar a producción.
 *
 * Cubre: Immobili, Clienti, Proprietari, Documenti, Appointments
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeBody,
  IMMOBILI_ALLOWED,
  CLIENTI_ALLOWED,
  PROPRIETARI_ALLOWED,
  DOCUMENTI_TEMPLATE_ALLOWED,
  DOCUMENTI_GENERATI_ALLOWED,
  APPOINTMENTS_ALLOWED,
} from '@/lib/sanitize';

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 1: IMMOBILE FULL — 100% de campos del frontend
// Basado en la plantilla vacía (immobili/page.tsx L852-909) + updateNested()
// ═══════════════════════════════════════════════════════════════════════════════

const FULL_IMMOBILE = {
  DatiBase: {
    Codice: '1000042',
    Riferimento: 'APP-TP-001',
    Tipologia: 'Appartamento',
    Indirizzo: 'Via Roma 15',
    Citta: 'Trapani',
    CAP: '91100',
    Zona: 'Centro Storico',
    Provincia: 'TP',
    DistanzaMare: '200m',
  },
  DettagliFisici: {
    MetriCommerciali: 120,
    Vani: 5,
    CamereLetto: 3,
    Bagni: 2,
    Piano: 'Terzo',
    StatoFiniture: 'Abitabile',
    TipoEdificio: 'Unica Elevazione',
    ClasseEnergetica: 'C',
  },
  Caratteristiche: {
    Ascensore: true,
    RiscaldamentoAutonomo: true,
    AriaCondizionata: false,
    VistaMare: true,
    Balcone: true,
    Garage: false,
    Terrazza: false,
    Giardino: false,
    PostoAutoScoperto: true,
    CucinaAbitabile: true,
    ZonaMare: true,
    ArredamentoDesc: 'Arredato',
    Arredato: true,
    Terreno: false,
    Cantina: true,
    PostoAutoCoperto: false,
  },
  GestioneCommerciale: {
    InVendita: true,
    InAffitto: false,
    PrezzoVendita: 185000,
    PrezzoAffitto: '',
    PrezzoMinimo: 170000,
    SpeseCondominio: 80,
    Amministratore: 'Studio Rossi',
    Sospeso: false,
    PresenzaCartello: 'Si — Con Cartello',
  },
  Documentazione: {
    Planimetria: 'Disponibile',
    UrlPlanimetria: 'https://storage.example.com/planimetria.pdf',
    AttoImmobile: 'Disponibile',
    UrlAttoImmobile: 'https://storage.example.com/atto.pdf',
    StatoChiavi: 'In Ufficio',
    UrlAltriDocumenti: 'https://storage.example.com/extra.pdf',
  },
  Textos: {
    Descrizione: 'Bellissimo appartamento con vista mare nel centro storico.',
    NoteInterne: 'Proprietario disponibile a trattare. Motivato.',
  },
  images: [
    'https://storage.example.com/img1.webp',
    'https://storage.example.com/img2.webp',
  ],
  thumbnail: 'https://storage.example.com/img1.webp',
  proprietarioId: 'owner_abc123',
  proprietarioId_real: 'owner_abc123',
  note: 'Immobile di pregio, ottima posizione.',
};

describe('Immobile Full — persistencia completa', () => {
  it('preserva el 100% de campos tras sanitizeBody()', () => {
    const result = sanitizeBody(FULL_IMMOBILE, IMMOBILI_ALLOWED, 'test.immobile');
    for (const key of Object.keys(FULL_IMMOBILE)) {
      expect(result, `Campo '${key}' fue eliminado por sanitizeBody`).toHaveProperty(key);
    }
    expect(result).toMatchObject(FULL_IMMOBILE);
  });

  it('preserva la estructura nested completa de DatiBase', () => {
    const result = sanitizeBody(FULL_IMMOBILE, IMMOBILI_ALLOWED, 'test');
    expect((result as any).DatiBase).toMatchObject(FULL_IMMOBILE.DatiBase);
  });

  it('preserva las 16 Caratteristiche booleanas', () => {
    const result = sanitizeBody(FULL_IMMOBILE, IMMOBILI_ALLOWED, 'test');
    const chars = (result as any).Caratteristiche;
    expect(chars.Ascensore).toBe(true);
    expect(chars.VistaMare).toBe(true);
    expect(chars.ZonaMare).toBe(true);
    expect(chars.Cantina).toBe(true);
    expect(chars.ArredamentoDesc).toBe('Arredato');
  });

  it('preserva Documentazione completa', () => {
    const result = sanitizeBody(FULL_IMMOBILE, IMMOBILI_ALLOWED, 'test');
    expect((result as any).Documentazione.StatoChiavi).toBe('In Ufficio');
    expect((result as any).Documentazione.UrlPlanimetria).toContain('planimetria');
  });

  it('preserva Textos (Descrizione + NoteInterne)', () => {
    const result = sanitizeBody(FULL_IMMOBILE, IMMOBILI_ALLOWED, 'test');
    expect((result as any).Textos.Descrizione).toContain('vista mare');
    expect((result as any).Textos.NoteInterne).toContain('Motivato');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 2: CLIENTE FULL
// Basado en generateEmptyCliente() de clienti/page.tsx
// ═══════════════════════════════════════════════════════════════════════════════

const FULL_CLIENTE = {
  DatiPersonali: {
    Nome: 'Maria',
    Cognome: 'Bianchi',
    Telefono: '3331234567',
    Email: 'maria.bianchi@email.com',
    CodiceFiscale: 'BNCMRA85A41H501Z',
    IndirizzoResidenza: 'Via Garibaldi 10',
    CittaResidenza: 'Palermo',
    Professione: 'Avvocato',
    RedditoAnnuo: '45000',
  },
  Richiesta: {
    Operazione: { Vendita: true, Affitto: false },
    Tipologie: ['Appartamento', 'Casa/Villa'],
    Zone: ['Centro Storico', 'Lungomare'],
    BudgetAcquistoMin: 100000,
    BudgetAcquistoMax: 250000,
    BudgetAffittoMin: '',
    BudgetAffittoMax: '',
    SuperficieMin: 80,
    SuperficieMax: 150,
    LocaliMin: 3,
    CamereLettoMin: 2,
    BagniMin: 1,
    StatoFinitureAccettati: ['Abitabile', 'Buono'],
    PianoPreferenza: 'Piani Intermedi',
    ArredamentoPreferenza: 'Indifferente',
    Caratteristiche: {
      Ascensore: true,
      RiscaldamentoAutonomo: false,
      AriaCondizionata: false,
      VistaMare: true,
      Balcone: true,
      Terrazza: false,
      Garage: false,
      PostoAutoScoperto: false,
      PostoAutoCoperto: false,
      Giardino: false,
      CucinaAbitabile: false,
      Cantina: false,
    },
    Urgenza: 'Media',
    NoteRichiesta: 'Preferisce zona tranquilla.',
  },
  Matching: {
    Proposti: [
      { immobileId: 'imm001', codice: '1000001', dataProposta: '2026-05-01', esito: 'Interessato', note: 'Ha visitato' },
    ],
    ListaNera: ['imm999'],
    Preferiti: ['imm001', 'imm002'],
  },
  Caratteristiche: {
    Ascensore: true,
    VistaMare: true,
    Balcone: true,
  },
  Documentazione: {
    DocumentiIdentita: ['https://storage.example.com/ci.pdf'],
    ModuliPrivacy: ['https://storage.example.com/privacy.pdf'],
    AltriDocumenti: ['https://storage.example.com/extra.pdf'],
  },
  status: 'Attivo',
  note: 'Cliente prioritario, budget confermato.',
  note_riservate: 'Presentata da agenzia partner.',
  firmaDigitale: {
    HasFirma: true,
    UrlFirma: 'data:image/png;base64,iVBOR...',
    DataFirma: '2026-05-20',
  },
};

describe('Cliente Full — persistencia completa', () => {
  it('preserva el 100% de campos tras sanitizeBody()', () => {
    const result = sanitizeBody(FULL_CLIENTE, CLIENTI_ALLOWED, 'test.cliente');
    for (const key of Object.keys(FULL_CLIENTE)) {
      expect(result, `Campo '${key}' fue eliminado por sanitizeBody`).toHaveProperty(key);
    }
    expect(result).toMatchObject(FULL_CLIENTE);
  });

  it('preserva DatiPersonali completo', () => {
    const result = sanitizeBody(FULL_CLIENTE, CLIENTI_ALLOWED, 'test') as any;
    expect(result.DatiPersonali.Nome).toBe('Maria');
    expect(result.DatiPersonali.Professione).toBe('Avvocato');
    expect(result.DatiPersonali.RedditoAnnuo).toBe('45000');
  });

  it('preserva Richiesta con Caratteristiche anidadas', () => {
    const result = sanitizeBody(FULL_CLIENTE, CLIENTI_ALLOWED, 'test') as any;
    expect(result.Richiesta.Caratteristiche.Ascensore).toBe(true);
    expect(result.Richiesta.Tipologie).toContain('Appartamento');
    expect(result.Richiesta.Urgenza).toBe('Media');
  });

  it('preserva Matching (Proposti, ListaNera, Preferiti)', () => {
    const result = sanitizeBody(FULL_CLIENTE, CLIENTI_ALLOWED, 'test') as any;
    expect(result.Matching.Proposti).toHaveLength(1);
    expect(result.Matching.ListaNera).toContain('imm999');
    expect(result.Matching.Preferiti).toHaveLength(2);
  });

  it('preserva Documentazione de cliente', () => {
    const result = sanitizeBody(FULL_CLIENTE, CLIENTI_ALLOWED, 'test') as any;
    expect(result.Documentazione.AltriDocumenti).toHaveLength(1);
    expect(result.Documentazione.DocumentiIdentita[0]).toContain('ci.pdf');
  });

  it('preserva firmaDigitale', () => {
    const result = sanitizeBody(FULL_CLIENTE, CLIENTI_ALLOWED, 'test') as any;
    expect(result.firmaDigitale.HasFirma).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 3: PROPRIETARIO FULL (campos canonicos + legacy)
// ═══════════════════════════════════════════════════════════════════════════════

const FULL_PROPRIETARIO = {
  // Identidad (canonico + legacy)
  nome: 'Francesco',
  Nome: 'Francesco',
  cognome: 'Pantaleo',
  Cognome: 'Pantaleo',
  ragione_sociale: '',
  tipo: 'Persona Fisica',
  codice_fiscale: 'PNTFNC70A01H501X',
  partita_iva: '',
  data_nascita: '1970-01-01',
  luogo_nascita: 'Trapani',
  // Residenza
  nazione: 'Italia',
  indirizzo_residenza: 'Corso Vittorio Emanuele 42',
  indirizzo: 'Corso Vittorio Emanuele 42',
  numero_civico: '42',
  citta_residenza: 'Trapani',
  citta: 'Trapani',
  cap: '91100',
  provincia: 'TP',
  // Contatti (canonico + legacy)
  email: 'f.pantaleo@example.com',
  cellulare: '3339876543',
  telefono: '3339876543',
  cell1: '3339876543',
  Cellulare: '3339876543',
  cellulare2: '3281111111',
  telefono2: '',
  telefono_fisso: '0923555555',
  tel1: '0923555555',
  // Note
  note: 'Proprietario storico, collaborativo.',
  note_riservate: 'CF: PNTFNC70A01H501X',
  // Flags commerciali
  interessato_vendita: true,
  interessato_locazione: false,
  in_esclusiva: true,
  privacy_accettata: true,
  // Estado
  stato: 'Attivo',
  stato_chiavi: 'In Ufficio',
  // Firma y documentos
  firmaDigitale: 'data:image/png;base64,iVBOR...',
  documenti: {
    identita: [{ url: 'https://storage.example.com/ci.pdf', name: 'CI_Pantaleo.pdf' }],
    planimetria: [{ url: 'https://storage.example.com/plan.pdf', name: 'Planimetria.pdf' }],
    atto: [],
    extra: [{ url: 'https://storage.example.com/doc.pdf', name: 'Altro.pdf' }],
  },
  // Contadores (server los recalcula, pero se aceptan por retro-compat)
  numero_immobili: 3,
  immobili_collegati: ['imm001', 'imm002', 'imm003'],
};

describe('Proprietario Full — persistencia completa', () => {
  it('preserva el 100% de campos tras sanitizeBody()', () => {
    const result = sanitizeBody(FULL_PROPRIETARIO, PROPRIETARI_ALLOWED, 'test.proprietario');
    for (const key of Object.keys(FULL_PROPRIETARIO)) {
      expect(result, `Campo '${key}' fue eliminado por sanitizeBody`).toHaveProperty(key);
    }
    expect(result).toMatchObject(FULL_PROPRIETARIO);
  });

  it('preserva campos legacy duplicados (nome/Nome, cognome/Cognome)', () => {
    const result = sanitizeBody(FULL_PROPRIETARIO, PROPRIETARI_ALLOWED, 'test') as any;
    expect(result.nome).toBe('Francesco');
    expect(result.Nome).toBe('Francesco');
    expect(result.cognome).toBe('Pantaleo');
    expect(result.Cognome).toBe('Pantaleo');
  });

  it('preserva documenti con estructura nested', () => {
    const result = sanitizeBody(FULL_PROPRIETARIO, PROPRIETARI_ALLOWED, 'test') as any;
    expect(result.documenti.identita).toHaveLength(1);
    expect(result.documenti.identita[0].url).toContain('ci.pdf');
  });

  it('preserva flags commerciali', () => {
    const result = sanitizeBody(FULL_PROPRIETARIO, PROPRIETARI_ALLOWED, 'test') as any;
    expect(result.interessato_vendita).toBe(true);
    expect(result.in_esclusiva).toBe(true);
    expect(result.privacy_accettata).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 4: DOCUMENTI Y APPOINTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

const FULL_DOCUMENTO_TEMPLATE = {
  titolo: 'Incarico di Vendita Esclusiva',
  categoria: 'incarico',
  url: 'https://storage.example.com/templates/incarico_vendita.pdf',
  dataCreazione: '2026-05-20T10:00:00.000Z',
  fileName: 'incarico_vendita.pdf',
  size: 245000,
};

const FULL_DOCUMENTO_GENERATO = {
  nomeFile: 'Foglio_Visita_Bianchi_2026-05-20.pdf',
  categoria: 'foglio_visita',
  urlDownload: 'https://storage.example.com/documenti_generati/fv_123.pdf',
  dataCreazione: '2026-05-20T10:30:00.000Z',
  clienteNome: 'Maria Bianchi',
  clienteId: 'client_xyz789',
  sezione: 'Clienti',
  azione: 'Foglio Visita',
  fileName: 'fv_123.pdf',
  size: 180000,
  formData: {
    cliente: { nome: 'Maria', cognome: 'Bianchi' },
    immobile: { codice: '1000042', indirizzo: 'Via Roma 15' },
    firma: 'data:image/png;base64,iVBOR...',
  },
};

const FULL_APPOINTMENT = {
  clientName: 'Maria Bianchi',
  propertyAddress: 'Via Roma 15, Trapani',
  date: '2026-06-01',
  time: '10:00',
  duration: 30,
  tipo: 'Visita',
  clientPhone: '3331234567',
  agentName: 'Francesco',
  notes: 'Portare le chiavi del secondo piano.',
  contactRole: 'cliente',
  status: 'Confermato',
};

describe('Documenti Template — persistencia completa', () => {
  it('preserva el 100% de campos', () => {
    const result = sanitizeBody(FULL_DOCUMENTO_TEMPLATE, DOCUMENTI_TEMPLATE_ALLOWED, 'test');
    for (const key of Object.keys(FULL_DOCUMENTO_TEMPLATE)) {
      expect(result, `Campo '${key}' fue eliminado`).toHaveProperty(key);
    }
    expect(result).toMatchObject(FULL_DOCUMENTO_TEMPLATE);
  });
});

describe('Documenti Generati — persistencia completa', () => {
  it('preserva el 100% de campos incluyendo formData nested', () => {
    const result = sanitizeBody(FULL_DOCUMENTO_GENERATO, DOCUMENTI_GENERATI_ALLOWED, 'test');
    for (const key of Object.keys(FULL_DOCUMENTO_GENERATO)) {
      expect(result, `Campo '${key}' fue eliminado`).toHaveProperty(key);
    }
    expect(result).toMatchObject(FULL_DOCUMENTO_GENERATO);
  });

  it('formData pasa intacto (snapshot del form completo)', () => {
    const result = sanitizeBody(FULL_DOCUMENTO_GENERATO, DOCUMENTI_GENERATI_ALLOWED, 'test') as any;
    expect(result.formData.cliente.nome).toBe('Maria');
    expect(result.formData.firma).toContain('base64');
  });
});

describe('Appointments — persistencia completa', () => {
  it('preserva el 100% de campos', () => {
    const result = sanitizeBody(FULL_APPOINTMENT, APPOINTMENTS_ALLOWED, 'test');
    for (const key of Object.keys(FULL_APPOINTMENT)) {
      expect(result, `Campo '${key}' fue eliminado`).toHaveProperty(key);
    }
    expect(result).toMatchObject(FULL_APPOINTMENT);
  });

  it('acepta googleEventId y googleEventLink en PATCH', () => {
    const patchBody = {
      ...FULL_APPOINTMENT,
      googleEventId: 'gcal_abc123',
      googleEventLink: 'https://calendar.google.com/event/abc123',
    };
    const result = sanitizeBody(patchBody, APPOINTMENTS_ALLOWED, 'test') as any;
    expect(result.googleEventId).toBe('gcal_abc123');
    expect(result.googleEventLink).toContain('calendar.google.com');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 5: DETECCION DE CAMPOS HUERFANOS
// Si el frontend envia un campo que no esta en la whitelist, este test falla
// ═══════════════════════════════════════════════════════════════════════════════

describe('Campos Huerfanos — frontend vs whitelist', () => {
  it('immobili: todos los top-level keys del frontend estan en IMMOBILI_ALLOWED', () => {
    const frontendKeys = [
      'DatiBase', 'DettagliFisici', 'Caratteristiche', 'GestioneCommerciale',
      'Documentazione', 'Textos', 'images', 'thumbnail',
      'proprietarioId', 'proprietarioId_real', 'note',
    ];
    const allowed = IMMOBILI_ALLOWED as readonly string[];
    const orphans = frontendKeys.filter(k => !allowed.includes(k));
    expect(orphans, `Campos del frontend NO en whitelist: ${orphans.join(', ')}`).toEqual([]);
  });

  it('clienti: todos los top-level keys del frontend estan en CLIENTI_ALLOWED', () => {
    const frontendKeys = [
      'DatiPersonali', 'Richiesta', 'Matching', 'Caratteristiche',
      'Documentazione', 'status', 'note', 'note_riservate', 'firmaDigitale',
    ];
    const allowed = CLIENTI_ALLOWED as readonly string[];
    const orphans = frontendKeys.filter(k => !allowed.includes(k));
    expect(orphans, `Campos del frontend NO en whitelist: ${orphans.join(', ')}`).toEqual([]);
  });

  it('proprietari: todos los top-level keys del frontend estan en PROPRIETARI_ALLOWED', () => {
    const frontendKeys = [
      'nome', 'Nome', 'cognome', 'Cognome',
      'email', 'cellulare', 'telefono', 'cell1', 'Cellulare',
      'cellulare2', 'telefono2', 'telefono_fisso', 'tel1',
      'indirizzo', 'indirizzo_residenza', 'numero_civico',
      'citta', 'citta_residenza', 'cap', 'provincia', 'nazione',
      'ragione_sociale', 'tipo', 'codice_fiscale', 'partita_iva',
      'data_nascita', 'luogo_nascita',
      'note', 'note_riservate',
      'interessato_vendita', 'interessato_locazione', 'in_esclusiva', 'privacy_accettata',
      'stato', 'stato_chiavi',
      'firmaDigitale', 'documenti',
      'numero_immobili', 'immobili_collegati',
    ];
    const allowed = PROPRIETARI_ALLOWED as readonly string[];
    const orphans = frontendKeys.filter(k => !allowed.includes(k));
    expect(orphans, `Campos del frontend NO en whitelist: ${orphans.join(', ')}`).toEqual([]);
  });

  it('documenti template: todos los campos estan en DOCUMENTI_TEMPLATE_ALLOWED', () => {
    const frontendKeys = ['titolo', 'categoria', 'url', 'dataCreazione', 'fileName', 'size'];
    const allowed = DOCUMENTI_TEMPLATE_ALLOWED as readonly string[];
    const orphans = frontendKeys.filter(k => !allowed.includes(k));
    expect(orphans, `Campos NO en whitelist: ${orphans.join(', ')}`).toEqual([]);
  });

  it('documenti generati: todos los campos estan en DOCUMENTI_GENERATI_ALLOWED', () => {
    const frontendKeys = [
      'nomeFile', 'categoria', 'urlDownload', 'dataCreazione',
      'clienteNome', 'clienteId', 'sezione', 'azione',
      'fileName', 'size', 'formData',
    ];
    const allowed = DOCUMENTI_GENERATI_ALLOWED as readonly string[];
    const orphans = frontendKeys.filter(k => !allowed.includes(k));
    expect(orphans, `Campos NO en whitelist: ${orphans.join(', ')}`).toEqual([]);
  });

  it('appointments: todos los campos estan en APPOINTMENTS_ALLOWED', () => {
    const frontendKeys = [
      'clientName', 'propertyAddress', 'date', 'time', 'duration',
      'tipo', 'clientPhone', 'agentName', 'notes', 'contactRole',
      'status', 'googleEventId', 'googleEventLink',
    ];
    const allowed = APPOINTMENTS_ALLOWED as readonly string[];
    const orphans = frontendKeys.filter(k => !allowed.includes(k));
    expect(orphans, `Campos NO en whitelist: ${orphans.join(', ')}`).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 6: ALWAYS_FORBIDDEN nunca pasa (en NINGUNA coleccion)
// ═══════════════════════════════════════════════════════════════════════════════

const FORBIDDEN_KEYS = ['_status', '_deletedAt', 'createdAt', 'updatedAt', 'id'];

const ALL_WHITELISTS = [
  { name: 'IMMOBILI', allowed: IMMOBILI_ALLOWED },
  { name: 'CLIENTI', allowed: CLIENTI_ALLOWED },
  { name: 'PROPRIETARI', allowed: PROPRIETARI_ALLOWED },
  { name: 'DOCUMENTI_TEMPLATE', allowed: DOCUMENTI_TEMPLATE_ALLOWED },
  { name: 'DOCUMENTI_GENERATI', allowed: DOCUMENTI_GENERATI_ALLOWED },
  { name: 'APPOINTMENTS', allowed: APPOINTMENTS_ALLOWED },
];

describe('ALWAYS_FORBIDDEN — bloqueados en todas las colecciones', () => {
  for (const { name, allowed } of ALL_WHITELISTS) {
    for (const forbiddenKey of FORBIDDEN_KEYS) {
      it(`${name}: '${forbiddenKey}' es eliminado`, () => {
        const body: Record<string, any> = { [forbiddenKey]: 'INJECTED_VALUE' };
        // Agregar al menos un campo valido para que el body no sea vacio
        if ((allowed as readonly string[]).length > 0) {
          body[(allowed as readonly string[])[0]] = 'valid_data';
        }
        const result = sanitizeBody(body, allowed, `test.${name}`);
        expect(result).not.toHaveProperty(forbiddenKey);
      });
    }
  }
});
