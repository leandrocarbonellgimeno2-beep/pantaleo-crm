import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import PDFHeader from '../PDFHeader';
import PrivacyPage from '../PrivacyPage';
import { COLORS } from '../PDFStyles';

export interface IncaricoStagionaleData {
  conduttoreNome: string; conduttoreCF: string; conduttoreNascita: string;
  conduttoreResidenza: string; conduttoreVia: string; conduttoreTel: string;
  conduttoreEmail: string;
  dataDal: string; dataAl: string;
  tipologiaImmobile: string; indirizzo: string; citta: string;
  piano: string; zona: string;
  foglio: string; particella: string; sub: string; classeEnergetica: string;
  prezzoLocazione: string; acconto: string; saldo: string;
  includeUtenze: boolean; note: string;
  privacyAccepted: boolean; firmaAgente: string; firmaCliente: string;
}

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
  highlight: { marginTop: 6, padding: 7, borderWidth: 1, borderColor: '#fbbf24', borderRadius: 3, backgroundColor: '#fef3c7' },
  highlightText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400e', textAlign: 'center' },
});

const Field = ({ label, value, idx }: { label: string; value: string; idx: number }) => (
  <View style={idx % 2 === 0 ? s.rowAlt : s.row}>
    <Text style={s.label}>{label}</Text>
    <Text style={s.value}>{value || '—'}</Text>
  </View>
);

const fmt = (d: string) => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const IncaricoStagionaleDocument: React.FC<{ data: IncaricoStagionaleData }> = ({ data }) => {
  const oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  const durataGiorni = data.dataDal && data.dataAl
    ? Math.max(0, Math.ceil((new Date(data.dataAl).getTime() - new Date(data.dataDal).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <Document title={`Incarico Stagionale — ${data.conduttoreNome || 'Cliente'}`} author="Pantaleo CRM" subject="Impegnativa locazione stagionale">
      <Page size="A4" style={s.page}>
        <PDFHeader documentDate={oggi} />
        <Text style={s.title}>Incarico Stagionale</Text>
        <Text style={s.subtitle}>Impegnativa di Locazione Stagionale — Immobiliare Pantaleo</Text>

        {/* CONDUTTORE */}
        <Text style={s.sectionTitle}>1. Dati del Conduttore</Text>
        {[
          ['Nome e Cognome', data.conduttoreNome],
          ['Codice Fiscale', data.conduttoreCF],
          ['Nato/a a, il', data.conduttoreNascita],
          ['Residente in', data.conduttoreResidenza],
          ['Via', data.conduttoreVia],
          ['Telefono', data.conduttoreTel],
          ['Email', data.conduttoreEmail],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* PERIODO */}
        <Text style={s.sectionTitle}>2. Periodo di Locazione</Text>
        {[
          ['Dal', fmt(data.dataDal)],
          ['Al', fmt(data.dataAl)],
          ['Durata', durataGiorni > 0 ? `${durataGiorni} giorni` : '—'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* IMMOBILE */}
        <Text style={s.sectionTitle}>3. Immobile</Text>
        {[
          ['Tipologia', (data.tipologiaImmobile || 'appartamento').charAt(0).toUpperCase() + (data.tipologiaImmobile || 'appartamento').slice(1)],
          ['Indirizzo', `${data.indirizzo || '—'}, ${data.citta || ''}`],
          ['Piano', data.piano || '—'],
          ['Zona', data.zona || '—'],
          ['Classe Energetica', data.classeEnergetica || 'G'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* CATASTALI */}
        <Text style={s.sectionTitle}>4. Dati Catastali</Text>
        {[
          ['Foglio', data.foglio], ['Particella', data.particella], ['Sub', data.sub],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* PREZZO */}
        <Text style={s.sectionTitle}>5. Condizioni Economiche</Text>
        {[
          ['Prezzo Totale', data.prezzoLocazione ? `€ ${Number(data.prezzoLocazione).toLocaleString('it-IT')}` : '—'],
          ['Acconto', data.acconto ? `€ ${Number(data.acconto).toLocaleString('it-IT')}` : '—'],
          ['Saldo', data.saldo ? `€ ${Number(data.saldo).toLocaleString('it-IT')}` : '—'],
          ['Utenze incluse', data.includeUtenze ? 'Sì' : 'No'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {data.prezzoLocazione && durataGiorni > 0 && (
          <View style={s.highlight}>
            <Text style={s.highlightText}>
              🏖️ € {Number(data.prezzoLocazione).toLocaleString('it-IT')} per {durataGiorni} giorni — € {(Number(data.prezzoLocazione) / durataGiorni).toFixed(2)}/giorno
            </Text>
          </View>
        )}

        {data.note && (
          <>
            <Text style={s.sectionTitle}>Note</Text>
            <Text style={s.body}>{data.note}</Text>
          </>
        )}

        <Text style={s.sectionTitle}>Dichiarazione</Text>
        <Text style={s.body}>
          Il/La sottoscritto/a {data.conduttoreNome || '____'} si impegna a prendere in locazione stagionale l'immobile sito in {data.indirizzo || '____'}, {data.citta || '____'}, per il periodo dal {fmt(data.dataDal)} al {fmt(data.dataAl)}, alle condizioni sopra indicate. Il conduttore verserà l'acconto indicato alla sottoscrizione e il saldo come pattuito.
        </Text>

        <View style={s.legalBox} wrap={false}>
          <Text style={s.legalText}>
            Il presente impegno di locazione stagionale è regolato dagli artt. 1571 e seguenti del Codice Civile. L'agenzia Immobiliare Pantaleo opera in qualità di mediatrice ai sensi degli artt. 1754 e seguenti C.C. Il trattamento dei dati avviene in conformità al GDPR UE 2016/679.
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
            <Text style={s.sigLabel}>Firma Conduttore:</Text>
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

export default IncaricoStagionaleDocument;
