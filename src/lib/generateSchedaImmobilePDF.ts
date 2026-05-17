/**
 * generateSchedaImmobilePDF — Scheda Tecnica Interna v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Diseño: UNA sola página A4, sin fondos negros/grises, mínimo tóner.
 * Márgenes: 20mm superior/inferior, 15mm laterales.
 * Fuente base: 10pt (+43% vs v2). Legible a simple vista.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Constantes de layout ──────────────────────────────────────────────────────
const M   = 15;          // margen izquierdo/derecho (mm) — 1.5 cm
const FS  = 10;          // font size base (pt)
const LS  = 5.5;         // line spacing texto libre (mm por línea)
const CP  = { top: 2, bottom: 2, left: 4, right: 4 }; // cell padding
const MAX_DESC_LINES = 4; // máximo líneas descripción (conservador para 1 página)

// ── Helpers ───────────────────────────────────────────────────────────────────

function s(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v).replace(/[^\x20-\x7E]/g, '').replace(/  +/g, ' ').trim() || '—';
}

function currency(v: unknown): string {
  const n = Number(v);
  return (!n || n === 0) ? '—' : `EUR ${n.toLocaleString('it-IT')}`;
}

function yesNo(v: unknown): string {
  return v === true ? 'Si' : v === false ? 'No' : '—';
}

/**
 * Separador de sección: línea fina + etiqueta en negrita. Sin relleno.
 */
function section(doc: jsPDF, title: string, y: number, W: number): number {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(M, y, W - M, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(title.toUpperCase(), M, y + 5.5);
  return y + 9;
}

/**
 * Tabla de 4 columnas: [label, value, label, value] — sin rellenos.
 */
function table4(
  doc: jsPDF,
  startY: number,
  W: number,
  rows: [string, string, string, string][],
): number {
  const iw = W - M * 2;
  autoTable(doc, {
    startY,
    margin: { left: M, right: M },
    head: [],
    body: rows,
    theme: 'plain',
    styles: {
      fontSize: FS,
      cellPadding: CP,
      lineColor: [180, 180, 180],
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [60, 60, 60],  cellWidth: iw * 0.22 },
      1: { textColor: [0, 0, 0],                         cellWidth: iw * 0.28 },
      2: { fontStyle: 'bold', textColor: [60, 60, 60],  cellWidth: iw * 0.22 },
      3: { textColor: [0, 0, 0] },
    },
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.3,
  });
  return (doc as any).lastAutoTable.finalY + 4;
}

// ── Interfaz de datos ─────────────────────────────────────────────────────────

export interface SchedaImmobileData {
  property: any;  // Documento Firestore completo
  owner: any;     // Documento propietario (puede ser null)
}

// ── Generador principal ───────────────────────────────────────────────────────

export function generateSchedaImmobilePDF({ property, owner }: SchedaImmobileData): void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W   = doc.internal.pageSize.getWidth();   // 210mm
  const H   = doc.internal.pageSize.getHeight();  // 297mm

  const db  = property?.DatiBase            || {};
  const df  = property?.DettagliFisici      || {};
  const gc  = property?.GestioneCommerciale || {};
  const car = property?.Caratteristiche     || {};
  const tex = property?.Textos              || {};

  const codice = s(db.Codice || property?.codice);
  const today  = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // ═══ HEADER ══════════════════════════════════════════════════════
  doc.setDrawColor(185, 146, 60);
  doc.setLineWidth(0.8);
  doc.line(0, 0, W, 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text('IMMOBILIARE PANTALEO', M, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 100, 100);
  doc.text('Scheda Tecnica Interna — Uso Riservato', M, 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(`Rif. ${codice}`, W - M, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 100, 100);
  doc.text(today, W - M, 17, { align: 'right' });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(M, 20, W - M, 20);

  let y = 24;

  // ═══ 1. PROPRIETARIO ═════════════════════════════════════════════
  y = section(doc, '1. Dati Proprietario', y, W);

  if (owner && Object.keys(owner).length > 0) {
    const nomeCompleto = [
      owner.Nome || owner.nome || owner.DatiPersonali?.Nome,
      owner.Cognome || owner.cognome || owner.DatiPersonali?.Cognome,
    ].filter(Boolean).join(' ');

    const telefoni = [
      owner.Telefono || owner.telefono || owner.DatiPersonali?.Telefono,
      owner.Cellulare || owner.cellulare || owner.Telefono2,
    ].filter(Boolean).join(' / ');

    const email = owner.Email || owner.email || owner.DatiPersonali?.Email || '';
    const cf    = owner.CodiceFiscale || owner.codice_fiscale || owner.CF || '';
    const indir = [
      owner.Indirizzo || owner.indirizzo,
      owner.Citta || owner.citta,
      owner.CAP || owner.cap,
    ].filter(Boolean).join(', ');

    const ownerRows: [string, string, string, string][] = [
      ['Nome Completo', s(nomeCompleto), 'Tel / Cell',     s(telefoni)],
      ['Email',         s(email),         'Codice Fiscale', s(cf)],
      ['Indirizzo',     s(indir),          'Note',           s(owner.Note || owner.note || '')],
    ];
    y = table4(doc, y, W, ownerRows);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(FS);
    doc.setTextColor(120, 120, 120);
    doc.text('Proprietario non collegato al sistema.', M + 2, y + 5);
    y += 11;
  }

  // ═══ 2. IMMOBILE — Dati Base + Fisici ════════════════════════════
  y = section(doc, '2. Dati Immobile', y, W);

  y = table4(doc, y, W, [
    ['Codice',        s(codice),                                          'Tipologia',         s(db.Tipologia)],
    ['Indirizzo',     s(db.Indirizzo),                                    'Zona',              s(db.Zona)],
    ['Citta',         s(db.Citta),                                        'Provincia / CAP',   `${s(db.Provincia)} ${s(db.CAP)}`.replace('— —','—')],
    ['Metratura',     s(df.MetriCommerciali) + (df.MetriCommerciali ? ' mq' : ''), 'Piano',   s(df.Piano)],
    ['Camere Letto',  s(df.CamereLetto),                                  'Bagni',             s(df.Bagni)],
    ['Vani / Locali', s(df.Vani),                                         'Finiture',          s(df.StatoFiniture)],
    ['Tipo Edificio', s(df.TipoEdificio),                                 'Classe Energetica', s(df.ClasseEnergetica)],
  ]);

  // ═══ 3. COMMERCIALE ══════════════════════════════════════════════
  y = section(doc, '3. Gestione Commerciale', y, W);

  const inVendita = gc.InVendita ? `Si — ${currency(gc.PrezzoVendita)}` : 'No';
  const inAffitto = gc.InAffitto ? `Si — ${currency(gc.PrezzoAffitto)}/mese` : 'No';

  y = table4(doc, y, W, [
    ['In Vendita',    inVendita,                 'In Affitto',    inAffitto],
    ['Prezzo Minimo', currency(gc.PrezzoMinimo), 'Spese Cond.',   currency(gc.SpeseCondominio)],
    ['Esclusiva',     yesNo(gc.Esclusiva),       'Data Incarico', s(gc.DataIncarico)],
    ['Agente',        s(gc.Agente),              'Cartello',      s(gc.PresenzaCartello)],
  ]);

  // ═══ 4. CARATTERISTICHE ══════════════════════════════════════════
  y = section(doc, '4. Caratteristiche', y, W);

  const amenityMap: [string, string][] = [
    ['Ascensore',       'Ascensore'],
    ['Aria Cond.',      'AriaCondizionata'],
    ['Riscald. Aut.',   'RiscaldamentoAutonomo'],
    ['Cucina Abit.',    'CucinaAbitabile'],
    ['Vista Mare',      'VistaMare'],
    ['Zona Mare',       'ZonaMare'],
    ['Arredato',        'Arredato'],
    ['Chiavi Agenzia',  'Chiavi'],
    ['Garage',          'Garage'],
    ['Posto Auto',      'PostoAuto'],
    ['P.Auto Coperto',  'PostoAutoCoperto'],
    ['P.Auto Scoperto', 'PostoAutoScoperto'],
    ['Balcone',         'Balcone'],
    ['Terrazza',        'Terrazza'],
    ['Giardino',        'Giardino'],
    ['Cantina',         'Cantina'],
    ['Mansarda',        'Mansarda'],
    ['Terreno',         'Terreno'],
  ];

  const amenCols = 4;
  const amenRows: string[][] = [];
  for (let i = 0; i < amenityMap.length; i += amenCols) {
    const row: string[] = [];
    for (let j = 0; j < amenCols; j++) {
      const entry = amenityMap[i + j];
      if (entry) {
        const [label, key] = entry;
        const val  = car[key];
        const mark = val === true ? '+ Si' : val === false ? '  No' : '  —';
        row.push(`${label}: ${mark}`);
      } else {
        row.push('');
      }
    }
    amenRows.push(row);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [],
    body: amenRows,
    theme: 'plain',
    styles: {
      fontSize: FS,
      cellPadding: CP,
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
    },
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.3,
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // ═══ 5. DESCRIZIONE ══════════════════════════════════════════════
  const descrizione = (tex.Descrizione || '').replace(/[^\x20-\x7E\r\n]/g, '').replace(/\r\n|\r/g, '\n').trim();
  const noteInterne = (tex.NoteInterne || '').replace(/[^\x20-\x7E\r\n]/g, '').trim();

  if (descrizione || noteInterne) {
    y = section(doc, '5. Descrizione e Note', y, W);

    if (descrizione) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(FS);
      doc.setTextColor(0, 0, 0);
      const allLines = doc.splitTextToSize(descrizione, W - M * 2);
      const limitedLines = allLines.slice(0, MAX_DESC_LINES);
      if (allLines.length > MAX_DESC_LINES) {
        limitedLines[MAX_DESC_LINES - 1] = limitedLines[MAX_DESC_LINES - 1].replace(/\s*\S+$/, '…');
      }
      doc.text(limitedLines, M, y);
      y += limitedLines.length * LS + 3;
    }

    if (noteInterne) {
      doc.setDrawColor(180, 140, 40);
      doc.setLineWidth(0.3);
      const noteLines = doc.splitTextToSize(noteInterne, W - M * 2 - 8);
      const limitedNote = noteLines.slice(0, 2);
      const boxH = limitedNote.length * LS + 14;
      doc.rect(M, y, W - M * 2, boxH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(140, 100, 0);
      doc.text('NOTE RISERVATE:', M + 3, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(FS);
      doc.setTextColor(0, 0, 0);
      doc.text(limitedNote, M + 3, y + 11);
      y += boxH + 3;
    }
  }

  // ═══ FOOTER ══════════════════════════════════════════════════════
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(M, H - 12, W - M, H - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Immobiliare Pantaleo — Documento riservato ad uso interno', M, H - 7);
  doc.text(`Rif. ${codice} — ${today}`, W - M, H - 7, { align: 'right' });

  // ── Guardar ───────────────────────────────────────────────────────
  const filename = `Scheda_${codice || 'immobile'}_${today.replace(/\//g, '-')}.pdf`;
  doc.save(filename);
}
