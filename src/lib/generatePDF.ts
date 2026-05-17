/**
 * generatePDF — Scheda Incarico Cliente v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Página 1: Dati Personali + Parametri di Ricerca + Proposti (si existen)
 * Página 2: Informativa Privacy e Consenso + Firma
 * Márgenes: 20mm superior/inferior, 15mm laterales. Fuente 10pt.
 * Sin bloques de color sólido — solo bordes finos. Ahorro de tóner.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Cliente } from '@/types/cliente';

// ── Layout constants ──────────────────────────────────────────────────────────
const M   = 15;          // margen lateral (mm) — 1.5 cm
const FS  = 10;          // font size cuerpo (pt)
const LS  = 5.5;         // interlineado texto libre (mm)
const CP  = { top: 2, bottom: 2, left: 4, right: 4 }; // cell padding

const PRIVACY_TEXT = `INFORMATIVA SUL TRATTAMENTO DEI DATI PERSONALI
(ai sensi dell'art.13 del Regolamento UE 2016/679 - GDPR)

Gentile Cliente,
Immobiliare Pantaleo, con sede in Marsala (TP), in qualita' di Titolare del trattamento, La informa che i dati personali da Lei forniti saranno trattati nel rispetto della normativa sopra richiamata e degli obblighi di riservatezza ivi previsti.

1. FINALITA' DEL TRATTAMENTO
I Suoi dati personali vengono raccolti e trattati per le seguenti finalita':
a) Gestione dell'incarico di mediazione immobiliare conferito;
b) Ricerca e proposta di immobili compatibili con le Sue esigenze;
c) Adempimento di obblighi previsti dalla legge, da regolamenti e dalla normativa comunitaria;
d) Gestione contabile e amministrativa del rapporto contrattuale.

2. BASE GIURIDICA
Il trattamento dei Suoi dati e' necessario per l'esecuzione del contratto di mediazione e per adempiere agli obblighi di legge.

3. MODALITA' DEL TRATTAMENTO
I dati saranno trattati con strumenti elettronici e cartacei, con logiche strettamente correlate alle finalita' indicate e, comunque, in modo da garantire la sicurezza e la riservatezza dei dati stessi.

4. COMUNICAZIONE DEI DATI
I Suoi dati potranno essere comunicati a: soggetti che possono accedere ai dati in forza di disposizione di legge o di regolamento; collaboratori dell'agenzia; professionisti incaricati (notai, avvocati, commercialisti); istituti bancari.

5. CONSERVAZIONE DEI DATI
I dati personali saranno conservati per il tempo necessario all'esecuzione dell'incarico e, successivamente, per il tempo previsto dalle disposizioni normative vigenti.

6. DIRITTI DELL'INTERESSATO
In qualsiasi momento potra' esercitare i diritti di cui agli artt. 15-22 del Regolamento UE 2016/679, tra cui: diritto di accesso, rettifica, cancellazione, limitazione del trattamento, portabilita' e opposizione.

7. TITOLARE DEL TRATTAMENTO
Immobiliare Pantaleo - Marsala (TP)

Il sottoscritto dichiara di aver ricevuto e letto l'informativa sopra riportata e presta il proprio consenso al trattamento dei dati personali per le finalita' indicate.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function s(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v).replace(/[^\x20-\x7E]/g, '').replace(/  +/g, ' ').trim() || '—';
}

/** Separador de sección: línea fina + etiqueta en negrita. Sin relleno. */
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

/** Tabla de 4 columnas: [label, value, label, value] — sin rellenos */
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
    styles: { fontSize: FS, cellPadding: CP, lineColor: [180, 180, 180], lineWidth: 0.1 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [60, 60, 60],  cellWidth: iw * 0.20 },
      1: { textColor: [0, 0, 0],                         cellWidth: iw * 0.28 },
      2: { fontStyle: 'bold', textColor: [60, 60, 60],  cellWidth: iw * 0.20 },
      3: { textColor: [0, 0, 0] },
    },
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.3,
  });
  return (doc as any).lastAutoTable.finalY + 3;
}

/** Tabla de 2 columnas: [label, value] */
function table2(
  doc: jsPDF,
  startY: number,
  W: number,
  rows: [string, string][],
): number {
  autoTable(doc, {
    startY,
    margin: { left: M, right: M },
    head: [],
    body: rows,
    theme: 'plain',
    styles: { fontSize: FS, cellPadding: CP, lineColor: [180, 180, 180], lineWidth: 0.1 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [60, 60, 60], cellWidth: 55 },
      1: { textColor: [0, 0, 0] },
    },
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.3,
  });
  return (doc as any).lastAutoTable.finalY + 3;
}

// ── Generador principal ───────────────────────────────────────────────────────

export function generateSchedaIncarico(cliente: Cliente): void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W   = doc.internal.pageSize.getWidth();   // 210mm
  const H   = doc.internal.pageSize.getHeight();  // 297mm
  const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const dp         = (cliente.DatiPersonali || {}) as any;
  const r          = (cliente.Richiesta     || {}) as any;
  const codCliente = cliente.id ? cliente.id.substring(0, 8).toUpperCase() : 'NUOVO';

  // ══════════════════════════════════════════════════════════════════
  // PÁGINA 1
  // ══════════════════════════════════════════════════════════════════

  // ─ Header ─────────────────────────────────────────────────────────
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
  doc.text('Scheda Incarico Cliente — Uso Riservato', M, 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(`Rif. ${codCliente}`, W - M, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 100, 100);
  doc.text(today, W - M, 17, { align: 'right' });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(M, 20, W - M, 20);

  let y = 24;

  // ─ 1. Dati Personali ─────────────────────────────────────────────
  y = section(doc, '1. Dati Personali', y, W);

  const nomeCompleto       = [dp.Nome, dp.Cognome].filter(Boolean).join(' ');
  const indirizzoCompleto  = [dp.IndirizzoResidenza, dp.CittaResidenza].filter(Boolean).join(', ');

  y = table4(doc, y, W, [
    ['Nome e Cognome', s(nomeCompleto), 'Telefono',     s(dp.Telefono)],
    ['Email',          s(dp.Email),     'Cod. Fiscale', s(dp.CodiceFiscale)],
  ]);

  if (indirizzoCompleto) {
    y = table2(doc, y, W, [['Indirizzo', s(indirizzoCompleto)]]);
  }

  // ─ 2. Parametri di Ricerca ───────────────────────────────────────
  y = section(doc, '2. Parametri di Ricerca', y, W);

  const opStr    = [r.Operazione?.Vendita && 'Vendita', r.Operazione?.Affitto && 'Affitto'].filter(Boolean).join(' + ') || '—';
  const tipologie = (r.Tipologie || []).join(', ') || '—';
  const zone      = (r.Zone || []).join(', ') || '—';

  y = table4(doc, y, W, [['Operazione', opStr, 'Tipologie', tipologie]]);
  y = table4(doc, y, W, [['Zone', zone, 'Urgenza', s(r.Urgenza)]]);

  const budgetRows: [string, string, string, string][] = [];
  if (r.Operazione?.Vendita) {
    const bMin = Number(r.BudgetAcquistoMin || 0).toLocaleString('it-IT');
    const bMax = Number(r.BudgetAcquistoMax || 0).toLocaleString('it-IT');
    budgetRows.push(['Budget Acquisto', `EUR ${bMin} — EUR ${bMax}`, '', '']);
  }
  if (r.Operazione?.Affitto) {
    const bMin = Number(r.BudgetAffittoMin || 0).toLocaleString('it-IT');
    const bMax = Number(r.BudgetAffittoMax || 0).toLocaleString('it-IT');
    budgetRows.push(['Budget Affitto', `EUR ${bMin}/mese — EUR ${bMax}/mese`, '', '']);
  }
  if (budgetRows.length > 0) y = table4(doc, y, W, budgetRows);

  y = table4(doc, y, W, [
    ['Superficie Min', r.SuperficieMin ? `${r.SuperficieMin} m2` : '—', 'Camere Min', r.CamereLettoMin ? `${r.CamereLettoMin}` : '—'],
    ['Bagni Min',      r.BagniMin      ? `${r.BagniMin}`        : '—', 'Piano',      s(r.PianoPreferenza)],
    ['Arredamento',    s(r.ArredamentoPreferenza),                       'Finiture',   s((r.StatoFinitureAccettati || []).join(', '))],
  ]);

  const carAttive = Object.entries(r.Caratteristiche || {}).filter(([, v]) => v === true).map(([k]) => k);
  if (carAttive.length > 0) y = table2(doc, y, W, [['Caratteristiche', carAttive.join(', ')]]);
  if (r.NoteRichiesta)      y = table2(doc, y, W, [['Note Richiesta',  s(r.NoteRichiesta)]]);

  // ─ 3. Immobili Proposti (solo si existen) ────────────────────────
  const proposti = (cliente as any).Matching?.Proposti || [];
  if (proposti.length > 0) {
    y = section(doc, '3. Immobili Proposti', y, W);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Codice', 'Data Proposta', 'Esito', 'Note']],
      body: proposti.map((p: any) => [s(p.codice || p.immobileId), s(p.dataProposta), s(p.esito), s(p.note)]),
      theme: 'plain',
      styles: { fontSize: FS, cellPadding: CP, lineColor: [180, 180, 180], lineWidth: 0.1 },
      headStyles: { fontStyle: 'bold', textColor: [60, 60, 60], fillColor: false as any },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.3,
    });
  }

  // Footer página 1
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(M, H - 12, W - M, H - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Immobiliare Pantaleo — Documento riservato ad uso interno', M, H - 7);
  doc.text(`Rif. ${codCliente} — ${today}  |  Pagina 1 di 2`, W - M, H - 7, { align: 'right' });

  // ══════════════════════════════════════════════════════════════════
  // PÁGINA 2 — Informativa Privacy e Consenso
  // ══════════════════════════════════════════════════════════════════
  doc.addPage();
  let y2 = 24;

  // Header página 2
  doc.setDrawColor(185, 146, 60);
  doc.setLineWidth(0.8);
  doc.line(0, 0, W, 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('INFORMATIVA PRIVACY E CONSENSO', M, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 100, 100);
  doc.text("Immobiliare Pantaleo — Ai sensi dell'art.13 GDPR UE 2016/679", M, 17);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(M, 20, W - M, 20);

  // Texto privacy (9pt para que quepa todo en la página)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  const privacyLines = doc.splitTextToSize(PRIVACY_TEXT, W - M * 2);
  doc.text(privacyLines, M, y2);
  y2 += privacyLines.length * LS + 6;

  // ─ Firma ─────────────────────────────────────────────────────────
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(M, y2, W - M, y2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('FIRMA E DATA', M, y2 + 5.5);
  y2 += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FS);
  doc.setTextColor(0, 0, 0);
  doc.text(`Data: ${today}`, M, y2);
  doc.text('Luogo: Marsala (TP)', M + 70, y2);
  y2 += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FS);
  doc.text('Firma del Cliente:', M, y2);
  y2 += 4;

  const fd = (cliente as any).FirmaDigitale;
  if (fd?.HasFirma && fd?.UrlFirma) {
    try {
      doc.addImage(fd.UrlFirma, 'PNG', M, y2, 80, 30);
      y2 += 34;
    } catch {
      doc.setFontSize(8);
      doc.setTextColor(180, 0, 0);
      doc.text('[Firma digitale non caricabile]', M, y2 + 12);
      y2 += 22;
    }
  } else {
    doc.setDrawColor(180, 180, 180);
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(M, y2, 85, 30);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(8.5);
    doc.setTextColor(180, 180, 180);
    doc.text('(Firma non ancora acquisita)', M + 10, y2 + 16);
    y2 += 34;
  }

  // Footer página 2
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(M, H - 12, W - M, H - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Documento generato automaticamente da Pantaleo CRM — Valore legale solo se firmato.', M, H - 7);
  doc.text(`Rif. ${codCliente} — ${today}  |  Pagina 2 di 2`, W - M, H - 7, { align: 'right' });

  // ── Guardar ───────────────────────────────────────────────────────
  const nome = `${dp.Nome || 'Cliente'}_${dp.Cognome || ''}`.replace(/\s+/g, '_');
  doc.save(`Scheda_Incarico_${nome}_${new Date().toISOString().split('T')[0]}.pdf`);
}
