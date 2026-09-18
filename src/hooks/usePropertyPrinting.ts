"use client";

import { useState } from 'react';
import { toast } from 'sonner';
import { extractImageUrls } from '@/lib/imageUtils';

interface UsePropertyPrintingOptions {
  property: any;
  /** Propietario ya cargado; si falta, la ficha técnica lo trae antes de imprimir. */
  ownerData: any;
}

/**
 * Generación de documentos imprimibles de un inmueble: la ficha técnica en PDF
 * y el cartel de escaparate con su selector de fotos.
 *
 * Los dos módulos de PDF se importan de forma dinámica: pesan bastante y solo
 * hacen falta cuando el agente pulsa el botón, no en el bundle de la página.
 */
export function usePropertyPrinting({ property, ownerData }: UsePropertyPrintingOptions) {
  const [showPrintSelector, setShowPrintSelector] = useState(false);
  const [selectedPrintPhotos, setSelectedPrintPhotos] = useState<string[]>([]);
  const [customPrintText, setCustomPrintText] = useState('');
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  const [isSchedaGenerating, setIsSchedaGenerating] = useState(false);

  /** Ficha técnica del inmueble. */
  const generateScheda = async () => {
    setIsSchedaGenerating(true);
    try {
      let owner = ownerData;
      if (!owner && property?.proprietarioId) {
        const res = await fetch(`/api/proprietari?id=${property.proprietarioId}`);
        if (res.ok) owner = await res.json();
      }
      const { generateSchedaImmobilePDF } = await import('@/lib/generateSchedaImmobilePDF');
      generateSchedaImmobilePDF({ property, owner });
    } catch (err) {
      console.error('[Scheda PDF] Errore:', err);
      toast.error('Errore generazione scheda PDF. Controlla la console.');
    } finally {
      setIsSchedaGenerating(false);
    }
  };

  /** Abre el selector precargando la primera foto y la descripción actual. */
  const openPrintSelector = () => {
    setSelectedPrintPhotos(extractImageUrls(property).slice(0, 1));
    setCustomPrintText(property?.Textos?.Descrizione || '');
    setShowPrintSelector(true);
  };

  /** Cartel A4 de escaparate con las fotos y el texto elegidos. */
  const generateCartello = async () => {
    setShowPrintSelector(false);
    setIsPdfGenerating(true);
    setPdfStatus('Conversione immagini...');
    try {
      const { generateCartelloPDF } = await import('@/lib/generateCartelloPDF');
      const p = property;
      await generateCartelloPDF(
        {
          codice:      p?.DatiBase?.Codice    || '',
          tipologia:   p?.DatiBase?.Tipologia  || 'Immobile',
          citta:       p?.DatiBase?.Citta      || '',
          indirizzo:   p?.DatiBase?.Indirizzo  || '',
          zona:        p?.DatiBase?.Zona       || '',
          prezzo:      p?.GestioneCommerciale?.PrezzoVendita  || '',
          affitto:     p?.GestioneCommerciale?.PrezzoAffitto  || '',
          inVendita:   !!p?.GestioneCommerciale?.InVendita,
          inAffitto:   !!p?.GestioneCommerciale?.InAffitto,
          mq:          p?.DettagliFisici?.MetriCommerciali    || '',
          camere:      p?.DettagliFisici?.CamereLetto         || '',
          bagni:       p?.DettagliFisici?.Bagni               || '',
          piano:       p?.DettagliFisici?.Piano               || '',
          descrizione: customPrintText || p?.Textos?.Descrizione || '',
          photos:      selectedPrintPhotos,
        },
        setPdfStatus,
      );
    } catch (err) {
      console.error('[PDF] Errore generazione:', err);
      toast.error('Errore generazione PDF. Controlla la console per i dettagli.');
    } finally {
      setIsPdfGenerating(false);
      setPdfStatus('');
    }
  };

  return {
    showPrintSelector, setShowPrintSelector,
    selectedPrintPhotos, setSelectedPrintPhotos,
    customPrintText, setCustomPrintText,
    isPdfGenerating, pdfStatus,
    isSchedaGenerating,
    generateScheda, openPrintSelector, generateCartello,
  };
}
