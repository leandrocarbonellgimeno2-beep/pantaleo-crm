import React from 'react';
import { View, Text, Image } from '@react-pdf/renderer';
import { styles, COLORS, FONTS } from './PDFStyles';

interface PDFHeaderProps {
  documentDate?: string;
}

const PDFHeader: React.FC<PDFHeaderProps> = ({ documentDate }) => {
  const today = documentDate || new Date().toLocaleDateString('it-IT', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  return (
    <View style={styles.headerContainer}>
      {/* Logo */}
      <Image
        src="/logo-pantaleo.jpg"
        style={styles.headerLogo}
      />

      {/* Agency Info */}
      <View style={styles.headerInfo}>
        <Text style={styles.headerTitle}>Immobiliare Pantaleo</Text>
        <Text style={styles.headerSubtitle}>Mediazione Immobiliare Professionale</Text>
        <Text style={styles.headerSubtitle}>Marsala (TP) — {today}</Text>
      </View>
    </View>
  );
};

export default PDFHeader;
