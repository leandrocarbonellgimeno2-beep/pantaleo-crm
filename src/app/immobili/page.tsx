"use client";
import NextImage from "next/image";
import Link from "next/link";

import { useState } from "react";
import { useConfirm } from "@/contexts/ConfirmDialog";
import { useIdealistaActions } from "@/hooks/useIdealistaActions";
import { useInverseMatching } from "@/hooks/useInverseMatching";
import { usePropertyImages } from "@/hooks/usePropertyImages";
import { useImmobiliFilters } from "@/hooks/useImmobiliFilters";
import { usePropertyDetail } from "@/hooks/usePropertyDetail";
import { extractImageUrls } from "@/lib/imageUtils";
import { getOwnerDisplayName } from "@/lib/immobili/owner";
import {
  buildPropertyWhatsAppMessage,
  normalizeWhatsAppPhone,
  openWhatsApp,
} from "@/lib/immobili/whatsapp";
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { 
  Search, MapPin, Euro, Maximize2, BedDouble, Bath, Home, Tag, Filter,
  Plus, ChevronRight, ChevronLeft, X, Save, Loader2, Trash2, User, Camera,
  Image as ImageIcon, Phone, Mail,     Key,
    CheckCircle2, Map, UploadCloud, Printer, Eye,
  Zap, MessageCircle, ChevronDown, ChevronUp, BarChart3, SlidersHorizontal, RotateCcw, ExternalLink, FileText
} from "lucide-react";
// FsLightbox lazy-loaded: ~50KB chunk caricato solo al primo apertura della galleria
// invece che nel bundle iniziale della pagina immobili.
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeleteConfirmModal } from "@/components/immobili/DeleteConfirmModal";
import { OwnerPropertiesModal } from "@/components/immobili/OwnerPropertiesModal";
import { ClienteMatchModal } from "@/components/immobili/ClienteMatchModal";
import { CartelloPrintLayout } from "@/components/immobili/CartelloPrintLayout";
import { AdvancedFiltersDrawer } from "@/components/immobili/AdvancedFiltersDrawer";
import { PrintSelectorModal, MAX_PRINT_PHOTOS } from "@/components/immobili/PrintSelectorModal";
import { PropertyCard } from "@/components/immobili/PropertyCard";
import { PropertyGallery } from "@/components/immobili/PropertyGallery";
import { PropertyDetailView } from "@/components/immobili/PropertyDetailView";
import { PropertyEditForm } from "@/components/immobili/PropertyEditForm";
import zonasData from "@/lib/zonas.json";
import dynamic from "next/dynamic";

// FsLightbox: caricato dinamicamente — riduce ~50KB dal bundle iniziale.
const FsLightbox = dynamic(() => import("fslightbox-react"), { ssr: false });

// Importazione dinamica del componente mappa (Leaflet non supporta SSR)

// Helper for Boolean icons grid

// extractImages è ora centralizzato in @/lib/imageUtils — alias locale per
// non rompere i call sites esistenti.
const extractImages = extractImageUrls;

const PhotoViewer = ({ images, toggler, sourceIndex }: { images: string[], toggler: boolean, sourceIndex: number }) => {
  if (!images || images.length === 0) return null;
  
  return (
    <FsLightbox
      key={images.length}
      toggler={toggler}
      sources={images}
      types={images.map(() => 'image' as const)}
      slide={sourceIndex + 1}
    />
  );
};


export default function ImmobiliPage() {
  const confirm = useConfirm();
  // Busqueda, filtros, catalogo y paginacion visual. Se desestructura con los
  // mismos nombres para no tocar el JSX. Ver src/hooks/useImmobiliFilters.ts.
  const {
    searchTerm, setSearchTerm,
    filterType, setFilterType,
    filterStato, setFilterStato,
    isFilterOpen, setIsFilterOpen,
    advFilters, setAdvFilters, resetAdvFilters,
    filteredImmobili, activeFilterCount, hasActiveSearch,
    totalCount, loading, isFilterTransitioning, refresh,
    visibleCount, setVisibleCount, displayedCount, remaining, PAGE_SIZE,
  } = useImmobiliFilters();
  // Ficha del inmueble: estado, carga diferida y acciones.
  // Ver src/hooks/usePropertyDetail.ts. Se renombra en la desestructuracion
  // para no tocar el JSX existente.
  const {
    selectedProperty, setSelectedProperty,
    isLoadingDetail, detailError,
    isModalOpen, setIsModalOpen,
    viewMode, setViewMode,
    isSaving,
    ownerData,
    ownerProperties, showOwnerPropsModal, setShowOwnerPropsModal,
    isSchedaGenerating, setIsSchedaGenerating,
    isMapOpen, setIsMapOpen,
    deleteModalOpen, setDeleteModalOpen,
    deleteConfirmed, setDeleteConfirmed,
    deleteTimer,
    updateNested, validLightboxImages,
    openDetail: handleOpenDetail,
    createNew: handleCreateNew,
    saveProperty: handleSaveProperty,
    startDelete: handleDeleteProperty,
    executeDelete: executeDeleteProperty,
  } = usePropertyDetail({ refresh });

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);


  
  // Printing states
  const [showPrintSelector, setShowPrintSelector] = useState(false);
  const [selectedPrintPhotos, setSelectedPrintPhotos] = useState<string[]>([]);
  const [customPrintText, setCustomPrintText] = useState("");
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  
  // Optimistic UI state for parallel uploads

  // Drag & Drop State for Images

  // Inverse Matching State
  const inverse = useInverseMatching(selectedProperty);
  // Modal in-page per dettaglio cliente (evita navigazione che perde lo stato dei match)
  const [selectedClienteModal, setSelectedClienteModal] = useState<any>(null);

  // Owner's other properties state

  // Lightbox state
  const [lightboxController, setLightboxController] = useState({
    toggler: false,
    sourceIndex: 0
  });

  // Idealista Integration State

  // Delete Guardrail State




  const openLightboxOnSource = (index: number) => {
    setLightboxController({
      toggler: !lightboxController.toggler,
      sourceIndex: index
    });
  };

  // ── Idealista Actions ──
  const getIdealistaStatus = () => selectedProperty?.Idealista?.idealistaStatus || 'none';
  // Acciones de Idealista: ver src/hooks/useIdealistaActions.ts.
  // Recibe un parche en vez del setter, para no acoplar el hook a la forma
  // completa de selectedProperty.
  const idealista = useIdealistaActions({
    propertyId: selectedProperty?.id,
    codice: selectedProperty?.DatiBase?.Codice || '',
    onPatch: (patch) =>
      setSelectedProperty((prev: any) => ({
        ...prev,
        Idealista: { ...prev?.Idealista, ...patch },
      })),
    confirm,
  });


  // ── Inverse Matching Functions ──

  // Genera el cartel de escaparate en PDF con las fotos y el texto elegidos.
  const handleGenerateCartello = async () => {
    setShowPrintSelector(false);
    setIsPdfGenerating(true);
    setPdfStatus('Conversione immagini...');
    try {
      const { generateCartelloPDF } = await import('@/lib/generateCartelloPDF');
      const p = selectedProperty;
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

  const handleInverseWhatsApp = (clientMatch: any) => {
    const waNumber = normalizeWhatsAppPhone(clientMatch.telefono);
    if (!waNumber) {
      toast.error('Questo cliente non ha un numero di telefono registrato.');
      return;
    }
    openWhatsApp(waNumber, buildPropertyWhatsAppMessage(selectedProperty, 'proposal'));
  };

  // Visual "load more" — no network, just show 15 more cards
  const handleLoadMore = () => setVisibleCount(prev => prev + PAGE_SIZE);





  // Quick status change handler
  const handleQuickStatusChange = async (item: any, newSospeso: boolean) => {
    setOpenMenuId(null);
    const updatedGC = { ...item.GestioneCommerciale, Sospeso: newSospeso };
    try {
      const res = await fetch('/api/immobili', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, GestioneCommerciale: updatedGC }),
      });
      if (!res.ok) throw new Error('Errore di rete');
      // Revalidar DESPUES del PATCH. Antes se hacia antes, con el comentario
      // "Optimistic local update": no actualizaba nada localmente y ademas
      // refrescaba el catalogo entero trayendo el estado VIEJO, asi que la
      // tarjeta seguia mostrando el estado anterior hasta el siguiente refetch.
      refresh();
      toast.success(`Immobile ${item.DatiBase?.Codice || ''} → ${newSospeso ? 'Sospeso' : 'Attivo'}`);
    } catch {
      refresh();
      toast.error('Errore durante il cambio stato');
    }
  };







  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, pathPrefix: string, fieldToUpdateCategory: string, fieldToUpdate: string) => {
    try {
      const file = e.target.files?.[0];
      if (!file || !selectedProperty) return;

      // Optional user feedback logic could be placed here (like `setIsUploading`)
      alert(`Caricamento di ${file.name} in corso... Attendi per favore.`);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", `immobili/${selectedProperty.DatiBase?.Codice}/${pathPrefix}/${file.name}`);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        updateNested(fieldToUpdateCategory, fieldToUpdate, data.url);
        alert("File generico caricato con successo!");
      } else {
        alert("Errore caricamento: " + data.error);
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Errore durante il caricamento. Riprova.");
    }
  };

  // Fotos del inmueble: subida, borrado y reordenado. Ver
  // src/hooks/usePropertyImages.ts — opera por URL, no por indice.
  const photos = usePropertyImages({
    property: selectedProperty,
    onImagesChange: (images) => setSelectedProperty((prev: any) => ({ ...prev, images })),
    onSaved: refresh,
    confirm,
  });


  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: photos.onDrop, accept: {'image/*': [], 'application/pdf': []} });


  // Igual que el borrado: por URL, porque el índice de la galería no
  // corresponde al del array `images` que se reordena.


  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Immobili"
        subtitle={`${displayedCount} di ${filteredImmobili.length}${activeFilterCount > 0 ? ` (${totalCount} totali)` : ''} immobili`}
        action={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => handleCreateNew()}>
            Aggiungi Immobile
          </Button>
        }
        search={{
          value: searchTerm,
          onChange: setSearchTerm,
          placeholder: "Cerca per Codice, titolo o indirizzo...",
          loading: loading || isFilterTransitioning,
        }}
        searchExtra={
          <button
            onClick={() => setIsFilterOpen(true)}
            className={cn(
              "relative inline-flex items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-bold transition-all shadow-sm gap-2",
              activeFilterCount > 0
                ? "bg-primary/5 border-primary/30 text-primary hover:bg-primary/10"
                : "border-border bg-card hover:bg-accent"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtri Avanzati
            {activeFilterCount > 0 && (
              <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-primary/30 animate-in zoom-in duration-200">
                {activeFilterCount}
              </span>
            )}
          </button>
        }
      >
        {(["Tutti", "Vendita", "Affitto"] as const).map(t => (
          <button key={t}
            onClick={() => setFilterType(t)}
            className={cn("px-4 py-2 rounded-xl text-sm font-bold border transition-all shadow-sm", filterType === t ? "bg-primary text-white border-primary" : "bg-card border-border hover:bg-accent")}
          >{t}</button>
        ))}
        <div className="w-px h-8 bg-slate-200 self-center mx-1" />
        <button onClick={() => setFilterStato("Attivi")} className={cn("px-4 py-2 rounded-xl text-sm font-bold border transition-all shadow-sm gap-1.5 inline-flex items-center", filterStato === "Attivi" ? "bg-emerald-600 text-white border-emerald-600" : "bg-card border-border hover:bg-accent")}>
          <span className={cn("w-2 h-2 rounded-full", filterStato === "Attivi" ? "bg-white" : "bg-emerald-500")} /> Attivi
        </button>
        <button onClick={() => setFilterStato("Sospesi")} className={cn("px-4 py-2 rounded-xl text-sm font-bold border transition-all shadow-sm gap-1.5 inline-flex items-center", filterStato === "Sospesi" ? "bg-rose-600 text-white border-rose-600" : "bg-card border-border hover:bg-accent")}>
          <span className={cn("w-2 h-2 rounded-full", filterStato === "Sospesi" ? "bg-white" : "bg-rose-500")} /> Sospesi
        </button>
        <button onClick={() => setFilterStato("Tutti")} className={cn("px-4 py-2 rounded-xl text-sm font-bold border transition-all shadow-sm inline-flex items-center", filterStato === "Tutti" ? "bg-slate-700 text-white border-slate-700" : "bg-card border-border hover:bg-accent")}>
          Tutti gli stati
        </button>
      </PageHeader>

      {/* ═══ SKELETON — visible while first load or filter transition ═══ */}
      {(loading || isFilterTransitioning) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-3xl overflow-hidden bg-white border border-slate-100 shadow-sm animate-pulse">
              <div className="h-52 bg-slate-100" />
              <div className="p-4 space-y-3">
                <div className="h-3 bg-slate-100 rounded-full w-1/4" />
                <div className="h-5 bg-slate-100 rounded-full w-2/3" />
                <div className="h-3 bg-slate-100 rounded-full w-1/2" />
                <div className="mt-2 h-12 bg-slate-50 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ GRID — Premium Property Cards ═══ */}
      {!loading && !isFilterTransitioning && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-8">
        {filteredImmobili.slice(0, visibleCount).map((item: any, idx: number) => (
          <PropertyCard
            key={item.id}
            item={item}
            priority={idx < 6}
            menuOpen={openMenuId === item.id}
            onToggleMenu={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
            onOpenDetail={() => { setOpenMenuId(null); handleOpenDetail(item); }}
            onQuickStatusChange={(sospeso) => handleQuickStatusChange(item, sospeso)}
          />
        ))}
      </div>
      )}

      {/* Load More — visual only, no network */}
      {visibleCount < filteredImmobili.length && !loading && !isFilterTransitioning && (
        <div className="flex justify-center mt-6 mb-4">
          <button 
            onClick={handleLoadMore}
            className="px-8 py-3 rounded-full border border-slate-200 bg-white text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-2 text-slate-700 hover:text-indigo-600 hover:border-indigo-200"
          >
            <ChevronDown className="h-4 w-4" />
            {remaining <= 15 
              ? `Carica i ${remaining} restanti` 
              : `Carica altri 15 (${remaining} restanti)`
            }
          </button>
        </div>
      )}

      {filteredImmobili.length === 0 && !loading && !isFilterTransitioning && (
        <div className="py-24 text-center">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-200 mb-4">
            <Home className="h-10 w-10" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Nessun immobile trovato</h3>
          <p className="text-slate-500 max-w-xs mx-auto mt-2 font-medium">
            Prova a cambiare i filtri o il termine di ricerca.
          </p>
        </div>
      )}

      {/* ═══ ADVANCED FILTER DRAWER ═══ */}
      {isFilterOpen && (
        <AdvancedFiltersDrawer
          filters={advFilters}
          onChange={setAdvFilters}
          onReset={resetAdvFilters}
          onClose={() => setIsFilterOpen(false)}
          activeCount={activeFilterCount}
          resultCount={filteredImmobili.length}
        />
      )}

      {/* ═══ Owner's Other Properties Modal ═══ */}
      {showOwnerPropsModal && (
        <OwnerPropertiesModal
          ownerName={
            ownerData
              ? `${ownerData.nome || ''} ${ownerData.cognome || ''}`.trim()
              : selectedProperty?.DatiBase?.NomeProprietario || 'Proprietario'
          }
          properties={ownerProperties}
          onSelect={(prop) => {
            setShowOwnerPropsModal(false);
            handleOpenDetail(prop);
          }}
          onClose={() => setShowOwnerPropsModal(false)}
        />
      )}

      {/* Property Detail Modal */}
      {isModalOpen && selectedProperty && (
        <div className="fixed inset-0 z-50 flex flex-col p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 print:bg-white print:p-0">
           {/* Modal Container */}
           <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col overflow-hidden bg-slate-50 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 print:shadow-none print:bg-white print:w-full print:max-w-none print:h-auto print:overflow-visible">
             
             {/* Header */}
             <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white sticky top-0 z-10 print:hidden">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <Home className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800">{viewMode ? "Dettaglio Immobile" : "Scheda Immobile"}</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">{viewMode ? "Anteprima" : "Modifica e Gestione"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {viewMode && (
                    <div className="flex items-center gap-3 print:hidden">
                      {/* ═══ SCHEDA TECNICA PDF ═══ */}
                      <button
                        disabled={isSchedaGenerating}
                        onClick={async () => {
                          setIsSchedaGenerating(true);
                          try {
                            // If owner not yet loaded, fetch it now
                            let owner = ownerData;
                            if (!owner && selectedProperty?.proprietarioId) {
                              const res = await fetch(`/api/proprietari?id=${selectedProperty.proprietarioId}`);
                              if (res.ok) owner = await res.json();
                            }
                            const { generateSchedaImmobilePDF } = await import('@/lib/generateSchedaImmobilePDF');
                            generateSchedaImmobilePDF({ property: selectedProperty, owner });
                          } catch (err) {
                            console.error('[Scheda PDF] Errore:', err);
                            alert('Errore generazione scheda PDF. Controlla la console.');
                          } finally {
                            setIsSchedaGenerating(false);
                          }
                        }}
                        className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition-all hover:bg-indigo-700 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isSchedaGenerating
                          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generazione...</>
                          : <><FileText className="h-4 w-4 mr-2" />Scheda PDF</>
                        }
                      </button>

                      <button
                        onClick={() => {
                          setSelectedPrintPhotos(extractImages(selectedProperty).slice(0, 1));
                          setCustomPrintText(selectedProperty?.Textos?.Descrizione || "");
                          setShowPrintSelector(true);
                        }}
                        className="inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 px-5 py-2 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 shadow-sm"
                      >
                        <Printer className="h-4 w-4 mr-2" /> Stampa Cartello
                      </button>

                      {/* ═══ WHATSAPP SHARE ═══ */}
                      <button
                        onClick={() => openWhatsApp(
                          null,
                          buildPropertyWhatsAppMessage(selectedProperty, 'share'),
                        )}
                        className="inline-flex items-center justify-center rounded-xl bg-[#25D366] px-5 py-2 text-sm font-bold text-white transition-all hover:bg-[#1da851] shadow-sm shadow-emerald-500/25"
                      >
                        <MessageCircle className="h-4 w-4 mr-2 fill-current" /> WhatsApp
                      </button>

                      {/* ═══ IDEALISTA BUTTONS ═══ */}
                      {selectedProperty.id && (() => {
                        const status = getIdealistaStatus();
                        return (
                          <div className="flex items-center gap-2">
                            {status === 'none' || status === 'error' ? (
                              <button
                                onClick={idealista.publish}
                                disabled={idealista.loading}
                                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 text-sm font-bold text-white transition-all hover:from-green-600 hover:to-emerald-700 shadow-sm shadow-emerald-500/25 disabled:opacity-50"
                              >
                                {idealista.loading && idealista.action === 'publish' ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Zap className="h-4 w-4 mr-2" />
                                )}
                                {idealista.loading && idealista.action === 'publish' ? 'Pubblicando...' : 'Pubblica su Idealista'}
                              </button>
                            ) : status === 'active' ? (
                              <>
                                <button
                                  onClick={idealista.update}
                                  disabled={idealista.loading}
                                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 text-sm font-bold text-white transition-all hover:from-blue-600 hover:to-indigo-700 shadow-sm shadow-blue-500/25 disabled:opacity-50"
                                >
                                  {idealista.loading && idealista.action === 'update' ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Zap className="h-4 w-4 mr-2" />
                                  )}
                                  Aggiorna su Idealista
                                </button>
                                <button
                                  onClick={idealista.deactivate}
                                  disabled={idealista.loading}
                                  className="inline-flex items-center justify-center rounded-xl border border-rose-200 px-3 py-2 text-sm font-bold text-rose-600 transition-all hover:bg-rose-50 disabled:opacity-50"
                                  title="Rimuovi da Idealista"
                                >
                                  {idealista.loading && idealista.action === 'deactivate' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <X className="h-4 w-4" />
                                  )}
                                </button>
                              </>
                            ) : status === 'deactivated' ? (
                              <button
                                onClick={idealista.activate}
                                disabled={idealista.loading}
                                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2 text-sm font-bold text-white transition-all hover:from-amber-600 hover:to-orange-700 shadow-sm shadow-amber-500/25 disabled:opacity-50"
                              >
                                {idealista.loading && idealista.action === 'activate' ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Zap className="h-4 w-4 mr-2" />
                                )}
                                Riattiva su Idealista
                              </button>
                            ) : null}
                            {/* Status indicator dot */}
                            <span className={cn(
                              "h-2.5 w-2.5 rounded-full",
                              status === 'active' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' :
                              status === 'deactivated' ? 'bg-amber-500' :
                              status === 'error' ? 'bg-rose-500 animate-pulse' :
                              'bg-slate-300'
                            )} title={`Idealista: ${status}`} />
                          </div>
                        );
                      })()}

                      <button 
                        onClick={() => setViewMode(false)}
                        className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 shadow-sm"
                      >
                        Modifica
                      </button>
                    </div>
                  )}
                  <button onClick={() => setIsModalOpen(false)} className="h-10 w-10 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>
             </div>

             {/* Scrolling Content - Switchable Views */}
             <div className="flex-1 overflow-y-auto p-0 md:p-6 bg-slate-50 print:hidden">
               {viewMode ? (
                 <PropertyDetailView
                   property={selectedProperty}
                   ownerData={ownerData}
                   ownerProperties={ownerProperties}
                   isLoadingDetail={isLoadingDetail}
                   detailError={detailError}
                   onShowOwnerProperties={() => setShowOwnerPropsModal(true)}
                   onOpenLightbox={openLightboxOnSource}
                   inverse={inverse}
                   onSelectCliente={setSelectedClienteModal}
                   onWhatsAppCliente={handleInverseWhatsApp}
                 />
               ) : (
                  <PropertyEditForm
                    property={selectedProperty}
                    updateNested={updateNested}
                    onFileUpload={handleFileUpload}
                    photos={photos}
                    getRootProps={getRootProps}
                    getInputProps={getInputProps}
                    isDragActive={isDragActive}
                    onOpenLightbox={openLightboxOnSource}
                    validLightboxImages={validLightboxImages}
                    ownerData={ownerData}
                    isMapOpen={isMapOpen}
                    setIsMapOpen={setIsMapOpen}
                  />
             )}

             </div>

             {/* Footer Modal Sticky */}
             {!viewMode && (
             <div className="px-6 py-4 border-t border-border bg-slate-50 flex items-center justify-between sticky bottom-0 z-10">
                <button 
                  onClick={() => {
                     if(selectedProperty.id) {
                        handleDeleteProperty();
                     } else {
                        setIsModalOpen(false);
                     }
                  }}
                  className="flex items-center text-sm font-bold text-rose-500 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {selectedProperty.id ? "Elimina Immobile" : "Cancella Creazione"}
                </button>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                    Chiudi
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSaveProperty}
                    loading={isSaving}
                    icon={<Save className="h-4 w-4" />}
                  >
                    Salva Informazioni
                  </Button>
                </div>
             </div>
             )}


           </div>
        </div>
      )}

      {/* Print Selector Modal */}
      {showPrintSelector && (
        <PrintSelectorModal
          images={extractImages(selectedProperty)}
          selected={selectedPrintPhotos}
          onSelectedChange={setSelectedPrintPhotos}
          onLimitReached={() => toast.error(`Puoi selezionare massimo ${MAX_PRINT_PHOTOS} foto per il cartello.`)}
          customText={customPrintText}
          onCustomTextChange={setCustomPrintText}
          generating={isPdfGenerating}
          status={pdfStatus}
          onGenerate={handleGenerateCartello}
          onClose={() => setShowPrintSelector(false)}
        />
      )}

      {/* Photo Viewer Isolated at the Root Level */}
      {validLightboxImages.length > 0 && (
        <PhotoViewer 
          images={validLightboxImages}
          toggler={lightboxController.toggler}
          sourceIndex={Math.min(lightboxController.sourceIndex, validLightboxImages.length - 1)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          CARTELLO VETRINA — Print Layout (hidden on screen, visible in @media print)
          This renders an A4-sized professional property flyer
      ═══════════════════════════════════════════════════════════ */}
      {selectedProperty && (
        <CartelloPrintLayout
          property={selectedProperty}
          photos={selectedPrintPhotos}
          customText={customPrintText}
        />
      )}

      {/* ═══ MODAL DETTAGLIO CLIENTE (da lista Inverse Matches) ═══
          Si apre in-page: la lista dei match rimane invariata in background */}
      {selectedClienteModal && (
        <ClienteMatchModal
          cliente={selectedClienteModal}
          onClose={() => setSelectedClienteModal(null)}
          onWhatsApp={handleInverseWhatsApp}
        />
      )}

      {/* ═══ DELETE GUARDRAIL MODAL ═══ */}
      {deleteModalOpen && selectedProperty && (
        <DeleteConfirmModal
          codice={selectedProperty.DatiBase?.Codice || ''}
          confirmed={deleteConfirmed}
          onToggleConfirm={setDeleteConfirmed}
          timer={deleteTimer}
          saving={isSaving}
          onConfirm={executeDeleteProperty}
          onClose={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
  );
}
