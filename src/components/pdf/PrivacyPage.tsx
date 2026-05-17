import React from 'react';
import { Page, View, Text, Image } from '@react-pdf/renderer';
import { COLORS, FONTS } from './PDFStyles';
import { StyleSheet } from '@react-pdf/renderer';

const privacyStyles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 45,
    paddingHorizontal: 32,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  // Agency header (mirrors main page header)
  agencyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    marginBottom: 12,
  },
  agencyLogo: {
    width: 80,
    height: 'auto',
  },
  agencyInfo: {
    alignItems: 'flex-end',
  },
  agencyTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
  },
  agencySubtitle: {
    fontSize: 6.5,
    color: COLORS.textLight,
    marginTop: 1,
  },
  headerBar: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerBarText: {
    color: COLORS.white,
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    letterSpacing: 1,
  },
  headerBarSubtext: {
    color: '#a5b4fc',
    fontSize: 7,
    textAlign: 'center',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    marginBottom: 3,
    marginTop: 8,
  },
  bodyText: {
    fontSize: 7,
    lineHeight: 1.4,
    color: '#334155',
    marginBottom: 3,
    textAlign: 'justify',
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
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.textLight,
    marginBottom: 2,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.text,
    height: 25,
    marginTop: 2,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  dateText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
  },
  footerLegal: {
    position: 'absolute',
    bottom: 16,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 4,
  },
  footerLegalText: {
    fontSize: 5.5,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});

interface PrivacyPageProps {
  firmaUrl?: string;
}

const PrivacyPage: React.FC<PrivacyPageProps> = ({ firmaUrl }) => {
  return (
    <Page size="A4" style={privacyStyles.page} break>
      {/* ═══ Agency Logo Header (matches main document) ═══ */}
      <View style={privacyStyles.agencyHeader}>
        <Image
          src="/logo-pantaleo.jpg"
          style={privacyStyles.agencyLogo}
        />
        <View style={privacyStyles.agencyInfo}>
          <Text style={privacyStyles.agencyTitle}>Immobiliare Pantaleo</Text>
          <Text style={privacyStyles.agencySubtitle}>Mediazione Immobiliare Professionale</Text>
          <Text style={privacyStyles.agencySubtitle}>Marsala (TP)</Text>
        </View>
      </View>

      {/* Title Bar */}
      <View style={privacyStyles.headerBar}>
        <Text style={privacyStyles.headerBarText}>INFORMATIVA SULLA PRIVACY E CONSENSO</Text>
        <Text style={privacyStyles.headerBarSubtext}>Ai sensi del Regolamento UE 2016/679 (GDPR) e del D.Lgs. 196/2003</Text>
      </View>

      {/* Section 1 */}
      <Text style={privacyStyles.sectionTitle}>1. FINALITÀ DEL TRATTAMENTO</Text>
      <Text style={privacyStyles.bodyText}>
        Gentile Cliente, Immobiliare Pantaleo, con sede in Marsala (TP), in qualità di Titolare del trattamento, La informa che i dati personali da Lei forniti saranno trattati nel rispetto della normativa sopra richiamata e degli obblighi di riservatezza ivi previsti. I Suoi dati personali vengono raccolti e trattati per le seguenti finalità: a) Gestione dell&apos;incarico di mediazione immobiliare conferito; b) Ricerca e proposta di immobili compatibili con le Sue esigenze; c) Adempimento di obblighi previsti dalla legge, da regolamenti e dalla normativa comunitaria; d) Gestione contabile e amministrativa del rapporto contrattuale.
      </Text>

      {/* Section 2 */}
      <Text style={privacyStyles.sectionTitle}>2. BASE GIURIDICA</Text>
      <Text style={privacyStyles.bodyText}>
        Il trattamento dei Suoi dati è necessario per l&apos;esecuzione del contratto di mediazione e per adempiere agli obblighi di legge. Il conferimento dei dati è facoltativo, ma l&apos;eventuale rifiuto potrà comportare l&apos;impossibilità di fornire il servizio richiesto.
      </Text>

      {/* Section 3 */}
      <Text style={privacyStyles.sectionTitle}>3. MODALITÀ DEL TRATTAMENTO</Text>
      <Text style={privacyStyles.bodyText}>
        I dati saranno trattati con strumenti elettronici e cartacei, con logiche strettamente correlate alle finalità indicate e, comunque, in modo da garantire la sicurezza e la riservatezza dei dati stessi. Sono adottate misure di sicurezza tecniche e organizzative adeguate per proteggere i dati da accessi non autorizzati, perdita o distruzione.
      </Text>

      {/* Section 4 */}
      <Text style={privacyStyles.sectionTitle}>4. COMUNICAZIONE DEI DATI</Text>
      <Text style={privacyStyles.bodyText}>
        I Suoi dati potranno essere comunicati a: soggetti che possono accedere ai dati in forza di disposizione di legge o di regolamento; collaboratori dell&apos;agenzia; professionisti incaricati (notai, avvocati, commercialisti); istituti bancari. I dati non saranno diffusi a terzi senza esplicito consenso, salvo obblighi di legge.
      </Text>

      {/* Section 5 */}
      <Text style={privacyStyles.sectionTitle}>5. CONSERVAZIONE DEI DATI</Text>
      <Text style={privacyStyles.bodyText}>
        I dati personali saranno conservati per il tempo necessario all&apos;esecuzione dell&apos;incarico e, successivamente, per il tempo previsto dalle disposizioni normative vigenti (generalmente 10 anni dalla cessazione del rapporto contrattuale).
      </Text>

      {/* Section 6 */}
      <Text style={privacyStyles.sectionTitle}>6. DIRITTI DELL&apos;INTERESSATO</Text>
      <Text style={privacyStyles.bodyText}>
        In qualsiasi momento potrà esercitare i diritti di cui agli artt. 15-22 del Regolamento UE 2016/679, tra cui: diritto di accesso, rettifica, cancellazione, limitazione del trattamento, portabilità e opposizione. Per esercitare tali diritti, potrà contattare il Titolare del Trattamento ai recapiti indicati.
      </Text>

      {/* Section 7 */}
      <Text style={privacyStyles.sectionTitle}>7. TITOLARE DEL TRATTAMENTO</Text>
      <Text style={privacyStyles.bodyText}>
        Immobiliare Pantaleo — Marsala (TP){'\n'}
        Il sottoscritto dichiara di aver ricevuto e letto l&apos;informativa sopra riportata e presta il proprio consenso al trattamento dei dati personali per le finalità indicate.
      </Text>

      {/* Date Row */}
      <View style={privacyStyles.dateRow}>
        <Text style={privacyStyles.dateText}>Data: {new Date().toLocaleDateString('it-IT')}</Text>
        <Text style={privacyStyles.dateText}>Luogo: Marsala (TP)</Text>
      </View>

      {/* Signature */}
      <View style={privacyStyles.signatureArea}>
        <View style={privacyStyles.signatureBlock}>
          <Text style={privacyStyles.signatureLabel}>Firma del Cliente:</Text>
          {firmaUrl ? (
            <Image src={firmaUrl} style={{ width: 130, height: 42, objectFit: 'contain' }} />
          ) : (
            <View style={privacyStyles.signatureLine} />
          )}
        </View>
        <View style={privacyStyles.signatureBlock}>
          <Text style={privacyStyles.signatureLabel}>Per Immobiliare Pantaleo:</Text>
          <View style={privacyStyles.signatureLine} />
        </View>
      </View>

      {/* Footer */}
      <View style={privacyStyles.footerLegal}>
        <Text style={privacyStyles.footerLegalText}>
          Documento generato automaticamente da Pantaleo CRM — Questo documento ha valore legale solo se firmato da entrambe le parti.
        </Text>
      </View>
    </Page>
  );
};

export default PrivacyPage;
