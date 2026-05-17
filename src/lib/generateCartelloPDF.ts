/**
 * generateCartelloPDF — v6 "Luxury Branding"
 * ─────────────────────────────────────────────────────────────────────────────
 * Architettura: jsPDF nativo puro (zero html2canvas, zero DOM).
 * Immagini:     fetch server-side via /api/proxy-image → base64 → addImage()
 *
 * Palette:
 *   Navy     #0a1628  →  rgb(10,  22,  40)
 *   Gold     #b9923c  →  rgb(185, 146, 60)
 *   OffWhite #f8f9fb  →  rgb(248, 249, 251)
 *   SlateText         →  rgb(71,  90,  120)
 *
 * Layout A4 (210 × 297mm):
 *   0  – 16mm   Header band (navy)        PANTALEO wordmark + gold line
 *   16 – 162mm  Hero photos (146mm)       grid 1/2/3/4 + price overlay
 *   162 – 275mm Content area (113mm)      titolo, specs, descrizione
 *   275 – 297mm Footer band (22mm)         indirizzo, telefono, web
 */

export interface CartellaData {
  codice:      string;
  tipologia:   string;
  citta:       string;
  indirizzo:   string;
  zona:        string;
  prezzo:      string | number;
  affitto:     string | number;
  inVendita:   boolean;
  inAffitto:   boolean;
  mq:          string | number;
  camere:      string | number;
  bagni:       string | number;
  piano:       string | number;
  descrizione: string;
  photos:      string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/**
 * Rimuove qualsiasi carattere fuori dal range ASCII stampabile (U+0020 – U+007E).
 * Elimina: simboli Unicode, rombi di sostituzione, surrogati, asterischi, ecc.
 * Mantiene: lettere, numeri, punteggiatura standard e spazio.
 */
function sanitize(text: string): string {
  return text
    // Rimuove caratteri non-ASCII-printable (fuori 0x20-0x7E)
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, '')
    // Collassa spazi multipli risultanti dalla rimozione
    .replace(/  +/g, ' ')
    .trim();
}

/** Converte in stringa E sanitizza — da usare su ogni campo dinamico in jsPDF */
function san(v: unknown): string {
  return sanitize(str(v));
}

function truncateWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.substring(0, limit);
  const sp  = cut.lastIndexOf(' ');
  return (sp > limit * 0.75 ? cut.substring(0, sp) : cut) + '...';
}

// ── Image fetch via server-side proxy (elude CORS Firebase) ───────────────────

async function fetchViaProxy(originalUrl: string): Promise<string> {
  if (!originalUrl) return '';
  try {
    const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(originalUrl)}`);
    if (!res.ok) return '';
    const blob = await res.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

// ── Entry-point ───────────────────────────────────────────────────────────────

export async function generateCartelloPDF(
  data: CartellaData,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const log = (msg: string) => {
    console.info(`[CartelloPDF v6] ${msg}`);
    onProgress?.(msg);
  };

  // 1. Download immagini -------------------------------------------------------
  log('Caricamento immagini...');
  const b64All = await Promise.all(data.photos.slice(0, 4).map(fetchViaProxy));
  const photos = b64All.filter(Boolean) as string[];
  log(`${photos.length}/${data.photos.length} immagini pronte`);

  // 2. jsPDF ------------------------------------------------------------------
  log('Composizione layout luxury...');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  // ── Costanti layout ──────────────────────────────────────────────────────────
  const W         = 210;
  const H         = 297;
  const HDR_H     = 16;    // header band
  const HERO_Y    = HDR_H;
  const HERO_H    = 146;   // photo area
  const CNT_Y     = HERO_Y + HERO_H;    // 162mm
  const FTR_H     = 22;
  const FTR_Y     = H - FTR_H;          // 275mm
  const CNT_H     = FTR_Y - CNT_Y;      // 113mm
  const PAD       = 10;
  const TXT_W     = W - PAD * 2;

  // ── Palette ──────────────────────────────────────────────────────────────────
  const NAVY   = [10,  22,  40]  as [number,number,number];
  const GOLD   = [185, 146, 60]  as [number,number,number];
  const WHITE  = [255, 255, 255] as [number,number,number];
  const OFFWHT = [248, 249, 251] as [number,number,number];
  const DARK   = [12,  20,  35]  as [number,number,number];
  const SLATE  = [71,  90,  120] as [number,number,number];
  const LGRAY  = [200, 208, 220] as [number,number,number];

  // ════════════════════════════════════════════════════════════════════════════
  // 3. HEADER BAND — navy con wordmark Pantaleo
  // ════════════════════════════════════════════════════════════════════════════
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, HDR_H, 'F');

  // Wordmark "PANTALEO" — bold, bianco, tracking simulato con spazi
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...WHITE);
  // Simula letter-spacing aggiungendo spazi tra lettere
  pdf.text('I M M O B I L I A R E', PAD, 10.5);

  // "PANTALEO" — normal, dorato, destra
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(...GOLD);
  pdf.text('P A N T A L E O', W - PAD, 10.5, { align: 'right' });

  // Rif numero — micro, grigio, centro
  pdf.setFontSize(6.5);
  pdf.setTextColor(...LGRAY);
  pdf.text(`Rif. ${san(data.codice) || 'N/A'}`, W / 2, 10.5, { align: 'center' });

  // Gold divider line
  pdf.setDrawColor(...GOLD);
  pdf.setLineWidth(0.5);
  pdf.line(0, HDR_H - 0.3, W, HDR_H - 0.3);

  // ════════════════════════════════════════════════════════════════════════════
  // 4. HERO PHOTOS
  // ════════════════════════════════════════════════════════════════════════════
  if (photos.length === 0) {
    pdf.setFillColor(20, 35, 60);
    pdf.rect(0, HERO_Y, W, HERO_H, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...LGRAY);
    pdf.text('Nessuna foto disponibile', W / 2, HERO_Y + HERO_H / 2, { align: 'center' });
  } else if (photos.length === 1) {
    pdf.addImage(photos[0], 'JPEG', 0, HERO_Y, W, HERO_H, undefined, 'FAST');
  } else if (photos.length === 2) {
    const half = W / 2 - 0.5;
    pdf.addImage(photos[0], 'JPEG', 0,        HERO_Y, half, HERO_H, undefined, 'FAST');
    pdf.addImage(photos[1], 'JPEG', half + 1, HERO_Y, half, HERO_H, undefined, 'FAST');
  } else if (photos.length === 3) {
    const topH = HERO_H * 0.62, botH = HERO_H - topH - 1, half = W / 2 - 0.5;
    pdf.addImage(photos[0], 'JPEG', 0,        HERO_Y,         W,    topH, undefined, 'FAST');
    pdf.addImage(photos[1], 'JPEG', 0,        HERO_Y + topH + 1, half, botH, undefined, 'FAST');
    pdf.addImage(photos[2], 'JPEG', half + 1, HERO_Y + topH + 1, half, botH, undefined, 'FAST');
  } else {
    const half = W / 2 - 0.5, hhero = HERO_H / 2 - 0.5;
    pdf.addImage(photos[0], 'JPEG', 0,        HERO_Y,          half, hhero, undefined, 'FAST');
    pdf.addImage(photos[1], 'JPEG', half + 1, HERO_Y,          half, hhero, undefined, 'FAST');
    pdf.addImage(photos[2], 'JPEG', 0,        HERO_Y + hhero + 1, half, hhero, undefined, 'FAST');
    pdf.addImage(photos[3], 'JPEG', half + 1, HERO_Y + hhero + 1, half, hhero, undefined, 'FAST');
  }

  // Gradient overlay (dark bottom strip) --------------------------------------
  try {
    pdf.saveGraphicsState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdf as any).setGState(new (pdf as any).GState({ opacity: 0.55, 'fill-opacity': 0.55 }));
    pdf.setFillColor(0, 0, 0);
    pdf.rect(0, CNT_Y - 38, W, 38, 'F');
    pdf.restoreGraphicsState();
  } catch { /* skip overlay if GState unsupported */ }

  // ── Price badge — navy pill con testo dorato ─────────────────────────────────
  const rawV = Number(data.prezzo  || 0);
  const rawA = Number(data.affitto || 0);
  let priceText = 'Prezzo su richiesta';
  if (data.inVendita && rawV > 0) {
    priceText = `€ ${rawV.toLocaleString('it-IT')}`;
    if (data.inAffitto && rawA > 0) priceText += `   |   € ${rawA.toLocaleString('it-IT')}/mese`;
  } else if (data.inAffitto && rawA > 0) {
    priceText = `€ ${rawA.toLocaleString('it-IT')}/mese`;
  }
  {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    const bH   = 13, bPad = 6;
    const bW   = Math.max(52, pdf.getTextWidth(priceText) + bPad * 2);
    const bX   = W - bW - 8;
    const bY   = CNT_Y - bH - 9;
    pdf.setFillColor(...NAVY);
    pdf.roundedRect(bX, bY, bW, bH, 3, 3, 'F');
    // Gold border
    pdf.setDrawColor(...GOLD);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(bX, bY, bW, bH, 3, 3, 'S');
    pdf.setTextColor(...GOLD);
    pdf.text(san(priceText), bX + bW / 2, bY + 9, { align: 'center' });
  }

  // ── Status badges ────────────────────────────────────────────────────────────
  {
    let sx = 8;
    const sy = HERO_Y + 8, bH = 7, bPad = 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    if (data.inVendita) {
      const label = 'VENDITA';
      const bW = pdf.getTextWidth(label) + bPad * 2;
      pdf.setFillColor(...NAVY);
      pdf.roundedRect(sx, sy, bW, bH, 1.5, 1.5, 'F');
      pdf.setDrawColor(...GOLD);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(sx, sy, bW, bH, 1.5, 1.5, 'S');
      pdf.setTextColor(...GOLD);
      pdf.text(label, sx + bPad, sy + 5);
      sx += bW + 3;
    }
    if (data.inAffitto) {
      const label = 'AFFITTO';
      const bW = pdf.getTextWidth(label) + bPad * 2;
      pdf.setFillColor(...NAVY);
      pdf.roundedRect(sx, sy, bW, bH, 1.5, 1.5, 'F');
      pdf.setDrawColor(...GOLD);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(sx, sy, bW, bH, 1.5, 1.5, 'S');
      pdf.setTextColor(...GOLD);
      pdf.text(label, sx + bPad, sy + 5);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5. CONTENT AREA — bianco
  // ════════════════════════════════════════════════════════════════════════════
  pdf.setFillColor(...WHITE);
  pdf.rect(0, CNT_Y, W, CNT_H, 'F');

  let curY = CNT_Y + 11;

  // ── Titolo proprietà ─────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(...DARK);
  const titleRaw   = san(`${san(data.tipologia) || 'Immobile'}${data.citta ? ' a ' + san(data.citta) : ''}`);
  const titleLines = (pdf.splitTextToSize(titleRaw, TXT_W) as string[]).slice(0, 2);
  pdf.text(titleLines, PAD, curY);
  curY += titleLines.length * 8 + 1;

  // ── Indirizzo ────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...SLATE);
  const addrFull = san(`${san(data.indirizzo) || ''}${data.zona ? ', ' + san(data.zona) : ''}`);
  if (addrFull.trim()) {
    pdf.text(truncateWord(addrFull, 85), PAD, curY);
    curY += 6;
  }

  // ── Gold separator ────────────────────────────────────────────────────────────
  pdf.setDrawColor(...GOLD);
  pdf.setLineWidth(0.5);
  pdf.line(PAD, curY, W - PAD, curY);
  curY += 6;

  // ── Spec row — MQ / Camere / Bagni / Piano ───────────────────────────────────
  const specs: { val: string; icon: string; lab: string }[] = [];
  if (data.mq)     specs.push({ val: san(data.mq),    icon: 'm2',  lab: 'Superficie' });
  if (data.camere) specs.push({ val: san(data.camere), icon: 'cam', lab: 'Camere' });
  if (data.bagni)  specs.push({ val: san(data.bagni),  icon: 'bth', lab: 'Bagni' });
  if (data.piano)  specs.push({ val: san(data.piano),  icon: 'pln', lab: 'Piano' });

  if (specs.length > 0) {
    const cardH  = 20;
    const gap    = 3;
    const cardW  = (TXT_W - gap * (specs.length - 1)) / specs.length;

    for (let i = 0; i < specs.length; i++) {
      const cx = PAD + i * (cardW + gap);

      // Sfondo card off-white con bordo gold
      pdf.setFillColor(...OFFWHT);
      pdf.setDrawColor(...GOLD);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(cx, curY, cardW, cardH, 2, 2, 'FD');

      // Valore — navy bold large
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(...NAVY);
      pdf.text(str(specs[i].val), cx + cardW / 2, curY + 9.5, { align: 'center' });

      // Label — slate small uppercase
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
      pdf.setTextColor(...SLATE);
      pdf.text(specs[i].lab.toUpperCase(), cx + cardW / 2, curY + 16, { align: 'center' });
    }
    curY += cardH + 6;
  }

  // ── Gold separator ────────────────────────────────────────────────────────────
  pdf.setDrawColor(...LGRAY);
  pdf.setLineWidth(0.25);
  pdf.line(PAD, curY, W - PAD, curY);
  curY += 5;

  // ── Descrizione — 480 chars max, word-safe, line-clamped ─────────────────────
  const DESC_LIMIT  = 480;
  const FTR_RESERVE = FTR_Y - 6;   // non scendere oltre 6mm sopra il footer

  if (data.descrizione && curY < FTR_RESERVE - 6) {
    const rawDesc  = str(data.descrizione).trim();
    const safeDesc = truncateWord(rawDesc, DESC_LIMIT);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...SLATE);

    // Line height reale jsPDF: 8.5pt × 0.3528mm/pt × 1.15 ≈ 3.45mm
    const LH       = 8.5 * 0.3528 * 1.15;
    const availMm  = Math.max(0, FTR_RESERVE - curY);
    const maxLines = Math.max(1, Math.floor(availMm / LH));
    const descLines = (pdf.splitTextToSize(safeDesc, TXT_W) as string[]).slice(0, maxLines);

    if (descLines.length > 0) pdf.text(descLines, PAD, curY);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 6. FOOTER BAND — off-white professionale
  // ════════════════════════════════════════════════════════════════════════════
  pdf.setFillColor(...OFFWHT);
  pdf.rect(0, FTR_Y, W, FTR_H, 'F');

  // Gold top border
  pdf.setDrawColor(...GOLD);
  pdf.setLineWidth(0.5);
  pdf.line(0, FTR_Y, W, FTR_Y);

  // Colonna sinistra — nome agenzia
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(...NAVY);
  pdf.text('IMMOBILIARE PANTALEO', PAD, FTR_Y + 8);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(...SLATE);
  pdf.text('Agenzia Immobiliare dal 1985', PAD, FTR_Y + 13);

  // Colonna centrale — indirizzo + telefono
  const midX = W / 2;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(...SLATE);
  pdf.text('Via Roma 1, Marsala (TP)', midX, FTR_Y + 8, { align: 'center' });
  pdf.text('Tel. +39 0923 123 4567', midX, FTR_Y + 13, { align: 'center' });

  // Colonna destra — web + rif
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(...NAVY);
  pdf.text('www.pantaleoimmobiliare.it', W - PAD, FTR_Y + 8, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...GOLD);
  pdf.text(`Rif: ${san(data.codice) || 'N/A'}`, W - PAD, FTR_Y + 13, { align: 'right' });

  // ── Salva ─────────────────────────────────────────────────────────────────────
  const fileName = `Cartello_Rif_${str(data.codice) || 'immobile'}_${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(fileName);
  log(`PDF salvato: ${fileName}`);
}
