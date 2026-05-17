import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import PDFHeader from '../PDFHeader';
import PrivacyPage from '../PrivacyPage';
import { COLORS, FONTS } from '../PDFStyles';

// ═══ Full data interface matching the form ═══
export interface FoglioVisitaData {
  tipoScheda: 'compravendita' | 'locazioni' | 'valutazioni' | 'mutui';
  nome: string;
  residenteIn: string;
  via: string;
  telefono: string;
  perContoEnabled: boolean;
  nomePerConto: string;
  dataVisita: string;
  tipoVisita: 'informazioni' | 'visitato';
  descrizioneImmobile: string;
  provvigionePercent: string;
  provvigioneIva: string;
  canoneMensile: string;
  canoneIva: string;
  privacyAccepted: boolean;
  firmaAgente: string;   // base64 data URL
  firmaCliente: string;  // base64 data URL
}

const TIPO_LABELS: Record<string, string> = {
  compravendita: 'Compravendita',
  locazioni: 'Locazioni',
  valutazioni: 'Valutazioni',
  mutui: 'Mutui',
};

// ═══ Compact styles for 1-page fit ═══
const s = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 45,
    paddingHorizontal: 32,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 7.5,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    marginBottom: 4,
    marginTop: 10,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  fieldRowAlt: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  fieldLabel: {
    width: '35%',
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.textLight,
  },
  fieldValue: {
    width: '65%',
    fontSize: 8.5,
    color: COLORS.text,
  },
  bodyText: {
    fontSize: 8.5,
    lineHeight: 1.4,
    color: COLORS.text,
    marginBottom: 4,
    textAlign: 'justify',
  },
  legalNote: {
    marginTop: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 3,
    backgroundColor: '#fffbeb',
  },
  legalNoteText: {
    fontSize: 7,
    color: '#92400e',
    lineHeight: 1.35,
    textAlign: 'justify',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
  },
  signatureArea: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
  },
  signatureLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.textLight,
    marginBottom: 2,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.text,
    height: 30,
    marginTop: 2,
  },
  signatureImage: {
    width: 140,
    height: 45,
    objectFit: 'contain' as const,
  },
  footer: {
    position: 'absolute' as const,
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 5,
  },
  footerText: {
    fontSize: 6.5,
    color: COLORS.textMuted,
  },
});

interface FoglioVisitaDocumentProps {
  data: FoglioVisitaData;
}

const FoglioVisitaDocument: React.FC<FoglioVisitaDocumentProps> = ({ data }) => {
  const tipoLabel = TIPO_LABELS[data.tipoScheda] || 'Compravendita';
  const dataFormatted = data.dataVisita
    ? new Date(data.dataVisita).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('it-IT');

  // Build rows for the visitor data table
  const rows: [string, string][] = [
    ['Tipo Scheda', tipoLabel],
    ['Nome e Cognome', data.nome || 'Non specificato'],
    ['Residente in', data.residenteIn || '—'],
    ['Via', data.via || '—'],
    ['Telefono', data.telefono || '—'],
    ...(data.perContoEnabled && data.nomePerConto
      ? [['In nome e per conto di', data.nomePerConto] as [string, string]]
      : []),
    ['Data della Visita', dataFormatted],
    ['Tipo di Visita', data.tipoVisita === 'informazioni' ? 'Ha ricevuto informazioni' : 'Ha visitato l\'immobile'],
  ];

  // Provvigione text
  const provvigioneText = data.tipoScheda === 'locazioni'
    ? `In caso di esito positivo della mediazione, al mediatore è dovuta una provvigione pari a un canone mensile di €${data.canoneMensile || '___'} + IVA al ${data.canoneIva || '22'}%.`
    : `In caso di esito positivo della mediazione, al mediatore è dovuta una provvigione pari al ${data.provvigionePercent || '3'}% + IVA al ${data.provvigioneIva || '22'}% sul prezzo di acquisto.`;

  return (
    <Document
      title={`Foglio di Visita — ${data.nome || 'Cliente'}`}
      author="Pantaleo CRM"
      subject="Verbale di presa visione immobiliare"
    >
      {/* ═══ PAGE 1: Foglio di Visita ═══ */}
      <Page size="A4" style={s.page}>
        <PDFHeader documentDate={dataFormatted} />

        <Text style={s.title}>Foglio di Visita</Text>
        <Text style={s.subtitle}>Scheda {tipoLabel} — Verbale di presa visione</Text>

        {/* Dati del Visitatore */}
        <Text style={s.sectionTitle}>Dati del Visitatore</Text>
        {rows.map(([label, value], idx) => (
          <View key={label + idx} style={idx % 2 === 0 ? s.fieldRowAlt : s.fieldRow}>
            <Text style={s.fieldLabel}>{label}</Text>
            <Text style={s.fieldValue}>{value}</Text>
          </View>
        ))}

        {/* Immobile */}
        <Text style={s.sectionTitle}>Immobile / Azienda Visitata</Text>
        <Text style={s.bodyText}>
          {data.descrizioneImmobile || 'Non specificato'}
        </Text>

        {/* Dichiarazione legale */}
        <Text style={s.sectionTitle}>Dichiarazione</Text>
        <Text style={s.bodyText}>
          Il/La sottoscritto/a {data.nome || '____________________________'}, residente in {data.residenteIn || '____'}, Via {data.via || '____'}, dichiara di aver {data.tipoVisita === 'informazioni' ? 'ricevuto informazioni in merito a' : `visitato in data ${dataFormatted}`} l&apos;immobile sopra descritto, accompagnato/a dal mediatore dell&apos;agenzia Immobiliare Pantaleo. Si impegna pertanto a non trattare direttamente con la parte venditrice/locatrice senza l&apos;intermediazione dell&apos;agenzia, pena il pagamento della provvigione pattuita ai sensi dell&apos;art. 1754 e seguenti del Codice Civile italiano.
        </Text>

        {/* Provvigione */}
        <Text style={s.sectionTitle}>Provvigione</Text>
        <Text style={s.bodyText}>{provvigioneText}</Text>

        {/* Legal note */}
        <View style={s.legalNote} wrap={false}>
          <Text style={s.legalNoteText}>
            Il presente servizio di accompagnamento alla visita è completamente gratuito e non comporta alcun obbligo di acquisto o locazione. La provvigione sarà dovuta esclusivamente in caso di conclusione positiva dell&apos;affare tramite l&apos;intermediazione di Immobiliare Pantaleo.
          </Text>
        </View>

        {/* Date & Location */}
        <View style={s.dateRow}>
          <Text style={s.dateText}>Data: {dataFormatted}</Text>
          <Text style={s.dateText}>Luogo: Marsala (TP)</Text>
        </View>

        {/* Signature — solo firma del Visitatore */}
        <View style={s.signatureArea} wrap={false}>
          <View style={s.signatureBlock}>
            <Text style={s.signatureLabel}>Firma del Visitatore:</Text>
            {data.firmaCliente ? (
              <Image src={data.firmaCliente} style={s.signatureImage} />
            ) : (
              <View style={s.signatureLine} />
            )}
          </View>
        </View>

        {/* Page Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Immobiliare Pantaleo — Marsala (TP)</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* ═══ PAGE 2: Privacy (always last) ═══ */}
      <PrivacyPage firmaUrl={data.firmaCliente || undefined} />
    </Document>
  );
};

export default FoglioVisitaDocument;
