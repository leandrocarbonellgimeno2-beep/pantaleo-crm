import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import PDFHeader from '../PDFHeader';
import PrivacyPage from '../PrivacyPage';
import { COLORS } from '../PDFStyles';

export interface IncaricoEsclusivaData {
  tipoIncarico: string;
  proprietarioNome: string; proprietarioCF: string; proprietarioNascita: string;
  proprietarioResidenza: string; proprietarioVia: string; proprietarioTel: string;
  proprietarioEmail: string;
  indirizzo: string; citta: string; piano: string; zona: string;
  mq: string; vani: string;
  foglio: string; particella: string; sub: string;
  valoreCatastale: string; classeEnergetica: string; categoria: string;
  richiesta: string; durataEsclusiva: string; dataInizio: string; dataFine: string;
  provvigionePercent: string; provvigioneIva: string; note: string;
  privacyAccepted: boolean; firmaAgente: string; firmaCliente: string;
}

const TIPO_LABELS: Record<string, string> = {
  vendita: 'Vendita', affitto: 'Affitto', terreno: 'Terreno',
  fabbricato: 'Fabbricato', commerciale: 'Attività Commerciale',
};

// ═══ Compact styles ═══
const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 45, paddingHorizontal: 32, fontFamily: 'Helvetica', fontSize: 8.5, color: COLORS.text },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: COLORS.primary, textAlign: 'center', marginTop: 6, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 2 },
  subtitle: { fontSize: 7, color: COLORS.textMuted, textAlign: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.primary, marginBottom: 4, marginTop: 8, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: COLORS.border, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowAlt: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#f8fafc' },
  label: { width: '35%', fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLORS.textLight },
  value: { width: '65%', fontSize: 8, color: COLORS.text },
  body: { fontSize: 8, lineHeight: 1.4, color: COLORS.text, marginBottom: 4, textAlign: 'justify' },
  legalBox: { marginTop: 5, padding: 6, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 3, backgroundColor: '#fffbeb' },
  legalText: { fontSize: 6.5, color: '#92400e', lineHeight: 1.35, textAlign: 'justify' },
  sigArea: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between' },
  sigBlock: { width: '45%' },
  sigLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COLORS.textLight, marginBottom: 2 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: COLORS.text, height: 28, marginTop: 2 },
  sigImg: { width: 130, height: 42, objectFit: 'contain' as const },
  footer: { position: 'absolute' as const, bottom: 16, left: 32, right: 32, flexDirection: 'row' as const, justifyContent: 'space-between' as const, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 5 },
  footerText: { fontSize: 6, color: COLORS.textMuted },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 },
  dateText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLORS.primary },
  summaryBox: { marginTop: 6, padding: 7, borderWidth: 1, borderColor: '#c4b5fd', borderRadius: 3, backgroundColor: '#ede9fe' },
  summaryText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#5b21b6', textAlign: 'center' },
});

const Field = ({ label, value, idx }: { label: string; value: string; idx: number }) => (
  <View style={idx % 2 === 0 ? s.rowAlt : s.row}>
    <Text style={s.label}>{label}</Text>
    <Text style={s.value}>{value || '—'}</Text>
  </View>
);

const fmt = (d: string) => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const money = (v: string) => v ? `€ ${Number(v).toLocaleString('it-IT')}` : '—';

const IncaricoEsclusivaDocument: React.FC<{ data: IncaricoEsclusivaData }> = ({ data }) => {
  const oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  const tipoLabel = TIPO_LABELS[data.tipoIncarico] || 'Vendita';

  return (
    <Document title={`Incarico d'Esclusiva — ${data.proprietarioNome || 'Proprietario'}`} author="Pantaleo CRM" subject="Mandato esclusivo">
      {/* ═══ PAGE 1 ═══ */}
      <Page size="A4" style={s.page}>
        <PDFHeader documentDate={oggi} />
        <Text style={s.title}>Incarico d'Esclusiva</Text>
        <Text style={s.subtitle}>Mandato esclusivo di {tipoLabel.toLowerCase()} — Immobiliare Pantaleo</Text>

        {/* TIPO */}
        <Text style={s.sectionTitle}>1. Tipo di Incarico</Text>
        <Field label="Operazione" value={tipoLabel} idx={0} />

        {/* PROPRIETARIO */}
        <Text style={s.sectionTitle}>2. Dati del Proprietario</Text>
        {[
          ['Nome e Cognome', data.proprietarioNome],
          ['Codice Fiscale', data.proprietarioCF],
          ['Nato/a a, il', data.proprietarioNascita],
          ['Residente in', data.proprietarioResidenza],
          ['Via', data.proprietarioVia],
          ['Telefono', data.proprietarioTel],
          ['Email', data.proprietarioEmail],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* IMMOBILE */}
        <Text style={s.sectionTitle}>3. Immobile</Text>
        {[
          ['Indirizzo', `${data.indirizzo || '—'}, ${data.citta || ''}`],
          ['Piano', data.piano || '—'],
          ['Zona', data.zona || '—'],
          ['Superficie (MQ)', data.mq ? `${data.mq} mq` : '—'],
          ['Numero Vani', data.vani || '—'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* CATASTALI */}
        <Text style={s.sectionTitle}>4. Dati Catastali</Text>
        {[
          ['Foglio', data.foglio], ['Particella', data.particella], ['Sub', data.sub],
          ['Categoria', data.categoria || '—'],
          ['Valore Catastale', money(data.valoreCatastale)],
          ['Classe Energetica', data.classeEnergetica || 'G'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Immobiliare Pantaleo — Marsala (TP)</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ═══ PAGE 2 ═══ */}
      <Page size="A4" style={s.page}>
        {/* CONDIZIONI ESCLUSIVA */}
        <Text style={s.sectionTitle}>5. Condizioni dell'Esclusiva</Text>
        {[
          ['Prezzo Richiesto', money(data.richiesta)],
          ['Durata Esclusiva', data.durataEsclusiva || '6 mesi'],
          ['Data Inizio', fmt(data.dataInizio)],
          ['Data Fine', fmt(data.dataFine)],
          ['Provvigione', `${data.provvigionePercent || '3'}% + IVA ${data.provvigioneIva || '22'}%`],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {data.richiesta && (
          <View style={s.summaryBox}>
            <Text style={s.summaryText}>
              ⭐ Prezzo richiesto: {money(data.richiesta)} — Provvigione: {data.provvigionePercent || '3'}% + IVA {data.provvigioneIva || '22'}% — Durata: {data.durataEsclusiva || '6 mesi'}
            </Text>
          </View>
        )}

        {data.note && (
          <>
            <Text style={s.sectionTitle}>Note</Text>
            <Text style={s.body}>{data.note}</Text>
          </>
        )}

        <Text style={s.sectionTitle}>Mandato</Text>
        <Text style={s.body}>
          Il/La sottoscritto/a {data.proprietarioNome || '____'} conferisce mandato esclusivo e irrevocabile all'agenzia Immobiliare Pantaleo per la {tipoLabel.toLowerCase()} dell'immobile sito in {data.indirizzo || '____'}, {data.citta || '____'}, al prezzo di {money(data.richiesta)}, per la durata di {data.durataEsclusiva || '6 mesi'}{data.dataInizio ? ` a decorrere dal ${fmt(data.dataInizio)}` : ''}.
        </Text>
        <Text style={s.body}>
          Il conferente si obbliga a non conferire analogo incarico ad altre agenzie immobiliari per tutta la durata del presente mandato e a segnalare tempestivamente eventuali trattative dirette. In caso di {tipoLabel.toLowerCase()} conclusa durante il periodo di esclusiva, anche tramite contatto diretto, è dovuta la provvigione pattuita del {data.provvigionePercent || '3'}% + IVA al {data.provvigioneIva || '22'}% sul prezzo di {tipoLabel.toLowerCase()}.
        </Text>

        <View style={s.legalBox} wrap={false}>
          <Text style={s.legalText}>
            Il presente mandato esclusivo è regolato dagli artt. 1754 e seguenti del Codice Civile. L'inadempimento del mandato di esclusiva comporta l'obbligo di corrispondere la provvigione pattuita come penale contrattuale. Trattamento dati personali ai sensi del D.Lgs. 196/2003 e del GDPR UE 2016/679.
          </Text>
        </View>

        <View style={s.dateRow}>
          <Text style={s.dateText}>Data: {oggi}</Text>
          <Text style={s.dateText}>Luogo: Marsala (TP)</Text>
        </View>

        <View style={s.sigArea} wrap={false}>
          <View style={s.sigBlock}>
            <Text style={s.sigLabel}>Firma Agente:</Text>
            {data.firmaAgente ? <Image src={data.firmaAgente} style={s.sigImg} /> : <View style={s.sigLine} />}
          </View>
          <View style={s.sigBlock}>
            <Text style={s.sigLabel}>Firma Proprietario:</Text>
            {data.firmaCliente ? <Image src={data.firmaCliente} style={s.sigImg} /> : <View style={s.sigLine} />}
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Immobiliare Pantaleo — Marsala (TP)</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      <PrivacyPage firmaUrl={data.firmaCliente || undefined} />
    </Document>
  );
};

export default IncaricoEsclusivaDocument;
