import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import PDFHeader from '../PDFHeader';
import PrivacyPage from '../PrivacyPage';
import { COLORS } from '../PDFStyles';

export interface IncaricoLocazioneData {
  locatoreNome: string; locatoreCF: string; locatoreNascita: string;
  locatoreResidenza: string; locatoreVia: string; locatoreTel: string;
  locatoreEmail: string; locatoreProfessione: string;
  conduttoreNome: string; conduttoreCF: string; conduttoreNascita: string;
  conduttoreResidenza: string; conduttoreVia: string; conduttoreTel: string;
  conduttoreEmail: string; conduttoreProfessione: string; conduttoreReddito: string;
  tipologiaImmobile: string; indirizzo: string; citta: string;
  piano: string; scala: string; interno: string;
  foglio: string; particella: string; sub: string;
  valoreCatastale: string; classeEnergetica: string;
  prezzoRichiesto: string; condominio: string; cauzione: string;
  mesiAnticipati: string; durataContratto: string; dataDisponibilita: string;
  arredato: boolean; garageIncluso: boolean; note: string;
  mediazioneTipo: string; mediazioneImporto: string; mediazioneIva: string;
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
  twoCol: { flexDirection: 'row', gap: 10 },
  halfCol: { width: '48%' },
  body: { fontSize: 8, lineHeight: 1.4, color: COLORS.text, marginBottom: 4, textAlign: 'justify' },
  legalBox: { marginTop: 5, padding: 6, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 3, backgroundColor: '#fffbeb' },
  legalText: { fontSize: 6.5, color: '#92400e', lineHeight: 1.35, textAlign: 'justify' },
  sigArea: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  sigBlock: { width: '45%' },
  sigLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COLORS.textLight, marginBottom: 2 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: COLORS.text, height: 28, marginTop: 2 },
  sigImg: { width: 130, height: 42, objectFit: 'contain' as const },
  footer: { position: 'absolute' as const, bottom: 16, left: 32, right: 32, flexDirection: 'row' as const, justifyContent: 'space-between' as const, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 5 },
  footerText: { fontSize: 6, color: COLORS.textMuted },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 },
  dateText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLORS.primary },
});

const Field = ({ label, value, idx }: { label: string; value: string; idx: number }) => (
  <View style={idx % 2 === 0 ? s.rowAlt : s.row}>
    <Text style={s.label}>{label}</Text>
    <Text style={s.value}>{value || '—'}</Text>
  </View>
);

const IncaricoLocazioneDocument: React.FC<{ data: IncaricoLocazioneData }> = ({ data }) => {
  const oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  const disponibilita = data.dataDisponibilita
    ? new Date(data.dataDisponibilita).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Da concordare';

  const PAGA_LABELS: Record<string, string> = { contanti: 'Contanti', assegno: 'Assegno', pos: 'POS', bonifico: 'Bonifico' };

  return (
    <Document title={`Incarico Locazione — ${data.locatoreNome || 'Proprietario'}`} author="Pantaleo CRM" subject="Impegnativa d'affitto">
      {/* ═══ PAGE 1: Main form ═══ */}
      <Page size="A4" style={s.page}>
        <PDFHeader documentDate={oggi} />
        <Text style={s.title}>Incarico di Locazione</Text>
        <Text style={s.subtitle}>Impegnativa d'Affitto — Immobiliare Pantaleo</Text>

        {/* LOCATORE */}
        <Text style={s.sectionTitle}>1. Dati del Locatore (Proprietario)</Text>
        {[
          ['Nome e Cognome', data.locatoreNome],
          ['Codice Fiscale', data.locatoreCF],
          ['Nato/a a, il', data.locatoreNascita],
          ['Residente in', data.locatoreResidenza],
          ['Via', data.locatoreVia],
          ['Telefono', data.locatoreTel],
          ['Email', data.locatoreEmail],
          ['Professione', data.locatoreProfessione],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* CONDUTTORE */}
        <Text style={s.sectionTitle}>2. Dati del Conduttore (Inquilino)</Text>
        {[
          ['Nome e Cognome', data.conduttoreNome],
          ['Codice Fiscale', data.conduttoreCF],
          ['Nato/a a, il', data.conduttoreNascita],
          ['Residente in', data.conduttoreResidenza],
          ['Via', data.conduttoreVia],
          ['Telefono', data.conduttoreTel],
          ['Email', data.conduttoreEmail],
          ['Professione', data.conduttoreProfessione],
          ['Reddito Annuo', data.conduttoreReddito ? `€ ${Number(data.conduttoreReddito).toLocaleString('it-IT')}` : '—'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {/* IMMOBILE */}
        <Text style={s.sectionTitle}>3. Immobile Oggetto di Locazione</Text>
        {[
          ['Tipologia', (data.tipologiaImmobile || 'appartamento').charAt(0).toUpperCase() + (data.tipologiaImmobile || 'appartamento').slice(1)],
          ['Indirizzo', `${data.indirizzo || '—'}, ${data.citta || ''}`],
          ['Piano / Scala / Interno', [data.piano, data.scala, data.interno].filter(Boolean).join(' / ') || '—'],
          ['Classe Energetica', data.classeEnergetica || 'G'],
          ['Arredato', data.arredato ? 'Sì' : 'No'],
          ['Garage incluso', data.garageIncluso ? 'Sì' : 'No'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Immobiliare Pantaleo — Marsala (TP)</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ═══ PAGE 2: Catastali + Condizioni + Firme ═══ */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>4. Dati Catastali</Text>
        {[
          ['Foglio', data.foglio], ['Particella', data.particella], ['Sub', data.sub],
          ['Valore Catastale', data.valoreCatastale ? `€ ${Number(data.valoreCatastale).toLocaleString('it-IT')}` : '—'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        <Text style={s.sectionTitle}>5. Condizioni di Locazione</Text>
        {[
          ['Prezzo Richiesto', data.prezzoRichiesto ? `€ ${Number(data.prezzoRichiesto).toLocaleString('it-IT')} / mese` : '—'],
          ['Spese Condominio', data.condominio ? `€ ${Number(data.condominio).toLocaleString('it-IT')} / mese` : '—'],
          ['Cauzione', data.cauzione ? `${data.cauzione} mensilità` : '—'],
          ['Mensilità Anticipate', data.mesiAnticipati || '1'],
          ['Durata Contratto', data.durataContratto || '4+4'],
          ['Disponibilità dal', disponibilita],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        {data.note && (
          <>
            <Text style={s.sectionTitle}>Note</Text>
            <Text style={s.body}>{data.note}</Text>
          </>
        )}

        <Text style={s.sectionTitle}>6. Mediazione</Text>
        {[
          ['Modalità Pagamento', PAGA_LABELS[data.mediazioneTipo] || data.mediazioneTipo],
          ['Importo Mediazione', data.mediazioneImporto ? `€ ${Number(data.mediazioneImporto).toLocaleString('it-IT')} + IVA ${data.mediazioneIva || '22'}%` : '—'],
        ].map(([l, v], i) => <Field key={l} label={l} value={v} idx={i} />)}

        <Text style={s.sectionTitle}>Dichiarazione</Text>
        <Text style={s.body}>
          Il/La sottoscritto/a {data.locatoreNome || '____'} conferisce incarico in esclusiva all'agenzia Immobiliare Pantaleo di Marsala (TP) per la locazione dell'immobile sito in {data.indirizzo || '____'}, {data.citta || '____'}, al prezzo di € {data.prezzoRichiesto || '____'}/mese. L'incarico ha la durata indicata e si rinnova tacitamente salvo disdetta scritta. Il locatore si obbliga a corrispondere la provvigione come sopra indicata.
        </Text>

        <View style={s.legalBox} wrap={false}>
          <Text style={s.legalText}>
            Il presente incarico è regolato dagli artt. 1754 e seguenti del Codice Civile. Il trattamento dei dati personali avverrà in conformità al D.Lgs. 196/2003 e al GDPR UE 2016/679. Immobiliare Pantaleo è iscritta al REA della Camera di Commercio di Trapani.
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
            <Text style={s.sigLabel}>Firma Locatore:</Text>
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

export default IncaricoLocazioneDocument;
