import { StyleSheet, Font } from '@react-pdf/renderer';

// ═══ Design Tokens ═══
export const COLORS = {
  primary: '#1e1b4b',      // indigo-950
  primaryLight: '#4f46e5',  // indigo-600
  accent: '#f59e0b',        // amber-500
  text: '#1e293b',          // slate-800
  textLight: '#64748b',     // slate-500
  textMuted: '#94a3b8',     // slate-400
  border: '#e2e8f0',        // slate-200
  bgLight: '#f8fafc',       // slate-50
  white: '#ffffff',
  black: '#000000',
};

export const FONTS = {
  sizeXs: 6.5,
  sizeSm: 7.5,
  sizeBase: 9,
  sizeMd: 10,
  sizeLg: 13,
  sizeXl: 16,
  sizeTitle: 20,
};

// ═══ Global Styles (Compact for 1-page fit) ═══
export const styles = StyleSheet.create({
  // Page
  page: {
    paddingTop: 28,
    paddingBottom: 45,
    paddingHorizontal: 32,
    fontFamily: 'Helvetica',
    fontSize: FONTS.sizeBase,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  pageNoPadTop: {
    paddingTop: 0,
    paddingBottom: 45,
    paddingHorizontal: 32,
    fontFamily: 'Helvetica',
    fontSize: FONTS.sizeBase,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },

  // Header
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    marginBottom: 12,
  },
  headerLogo: {
    width: 80,
    height: 'auto',
  },
  headerInfo: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: FONTS.sizeLg,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: FONTS.sizeXs,
    color: COLORS.textLight,
    marginTop: 1,
  },

  // Document title
  docTitle: {
    fontSize: FONTS.sizeXl,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  docSubtitle: {
    fontSize: FONTS.sizeXs,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 14,
  },

  // Sections
  sectionTitle: {
    fontSize: FONTS.sizeMd,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    marginBottom: 5,
    marginTop: 10,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Field rows
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingVertical: 2,
  },
  fieldLabel: {
    width: '35%',
    fontSize: FONTS.sizeBase,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.textLight,
  },
  fieldValue: {
    width: '65%',
    fontSize: FONTS.sizeBase,
    color: COLORS.text,
  },
  fieldRowStriped: {
    flexDirection: 'row',
    marginBottom: 0,
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: COLORS.bgLight,
  },

  // Paragraph text
  paragraph: {
    fontSize: FONTS.sizeBase,
    lineHeight: 1.4,
    color: COLORS.text,
    marginBottom: 4,
    textAlign: 'justify',
  },
  paragraphSmall: {
    fontSize: FONTS.sizeSm,
    lineHeight: 1.35,
    color: COLORS.textLight,
    marginBottom: 3,
    textAlign: 'justify',
  },

  // Signature
  signatureArea: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
  },
  signatureLabel: {
    fontSize: FONTS.sizeSm,
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

  // Footer
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 5,
  },
  footerText: {
    fontSize: FONTS.sizeXs,
    color: COLORS.textMuted,
  },
});
