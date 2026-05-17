import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import PDFHeader from '../PDFHeader';
import PrivacyPage from '../PrivacyPage';
import { COLORS } from '../PDFStyles';

export interface IncaricoAcquistoData {
  acquirenteNome: string; acquirenteCF: string; acquirenteNascita: string;
  acquirenteResidenza: string; acquirenteVia: string; acquirenteTel: string;
  acquirenteEmail: string;
  tipologiaImmobile: string; indirizzo: string; citta: string;
  piano: string; zona: string;
  foglio: string; particella: string; sub: string;
  valoreCatastale: string; classeEnergetica: string;
  prezzoAcquisto: string; accontoPrelim: string; saldoRogito: string;
  stipulaEntro: string; condizioniMutuo: boolean; note: string;
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
  summaryBox: { marginTop: 6, padding: 7, borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 3, backgroundColor: '#ecfdf5' },
  summaryText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#065f46', textAlign: 'center' },
});

const Field = ({ label, value, idx }: { label: string; value: string; idx: number }) => (
  <View style={idx % 2 === 0 ? s.rowAlt : s.row}>
    <Text style={s.label}>{label}</Text>
    <Text style={s.value}>{value || '—'}</Text>
  </View>
);

const fmt = (d: string) => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const money = (v: string) => v ? `€ ${Number(v).toLocaleString('it-IT')}` : '—';

const IncaricoAcquistoDocument: React.FC<{ data: IncaricoAcquistoData }> = ({ data }) => {
  const oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  const saldoCalc = data.prezzoAcquisto && data.accontoPrelim
    ? Number(data.prezzoAcquisto) - Number(data.accontoPrelim) : 0;

  return (
    <Document title={`Impegnativa d'Acquisto — ${data.acquirenteNome || 'Acquirente'}`} author="Pantaleo CRM" subject="Incarico per acquisto immobile">
      <Page size="A4" style={s.page}>
        <PDFHeader documentDate={oggi} />
        <Text style={s.title}>Impegnativa d'Acquisto</Text>
        <Text style={s.subtitle}>Incarico per acquisto immobile — Immobiliare Pantaleo</Text>

        {/* ACQUIRENTE */}
        <Text style={s.sectionTitle}>1. Dati dell'Acquirente</Text>
        {[
          ['Nome e Cognome', data.acquirenteNome],
          ['Codice Fiscale', data.acquirenteCF],
          ['Nato/a a, il', data.acquirenteNascita],
          ['Residente in', data.acquirenteResidenza],
          ['Via', data.acquirenteVia],
          ['Telefono', data.acquirenteTel],
          ['Email', data.acquirenteEmail],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* IMMOBILE */}
        <Text style={s.sectionTitle}>2. Immobile Oggetto di Acquisto</Text>
        {[
          ['Tipologia', (data.tipologiaImmobile || 'appartamento').charAt(0).toUpperCase() + (data.tipologiaImmobile || 'appartamento').slice(1)],
          ['Indirizzo', `${data.indirizzo || '—'}, ${data.citta || ''}`],
          ['Piano', data.piano || '—'],
          ['Zona', data.zona || '—'],
          ['Classe Energetica', data.classeEnergetica || 'G'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* CATASTALI */}
        <Text style={s.sectionTitle}>3. Dati Catastali</Text>
        {[
          ['Foglio', data.foglio], ['Particella', data.particella], ['Sub', data.sub],
          ['Valore Catastale', money(data.valoreCatastale)],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* CONDIZIONI */}
        <Text style={s.sectionTitle}>4. Condizioni di Acquisto</Text>
        {[
          ['Prezzo di Acquisto', money(data.prezzoAcquisto)],
          ['Acconto a Preliminare', money(data.accontoPrelim)],
          ['Saldo al Rogito', data.saldoRogito ? money(data.saldoRogito) : (saldoCalc > 0 ? money(String(saldoCalc)) : '—')],
          ['Da stipularsi entro', fmt(data.stipulaEntro)],
          ['Subordinato a mutuo', data.condizioniMutuo ? 'Sì — subordinato a concessione mutuo' : 'No'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {data.prezzoAcquisto && data.accontoPrelim && (
          <View style={s.summaryBox}>
            <Text style={s.summaryText}>
              💰 Prezzo: {money(data.prezzoAcquisto)} — Acconto: {money(data.accontoPrelim)} — Residuo: {money(String(saldoCalc))}
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
          Il/La sottoscritto/a {data.acquirenteNome || '____'} si impegna irrevocabilmente all'acquisto dell'immobile sito in {data.indirizzo || '____'}, {data.citta || '____'}, al prezzo complessivo di {money(data.prezzoAcquisto)}, alle condizioni sopra indicate. L'acquirente verserà l'acconto di {money(data.accontoPrelim)} alla sottoscrizione del compromesso, e il saldo di {money(data.saldoRogito || String(saldoCalc))} al rogito notarile{data.stipulaEntro ? ` da stipularsi entro il ${fmt(data.stipulaEntro)}` : ''}.
        </Text>

        <View style={s.legalBox} wrap={false}>
          <Text style={s.legalText}>
            Il presente impegno è irrevocabile ai sensi dell'art. 1329 C.C. e costituisce proposta ferma di acquisto. L'agenzia Immobiliare Pantaleo opera in qualità di mediatrice ai sensi degli artt. 1754 e seguenti C.C. Trattamento dati ai sensi del GDPR UE 2016/679.
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
            <Text style={s.sigLabel}>Firma Acquirente:</Text>
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

export default IncaricoAcquistoDocument;
