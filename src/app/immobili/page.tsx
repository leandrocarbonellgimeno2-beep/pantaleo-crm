"use client";
import NextImage from "next/image";
import Link from "next/link";

import { useCallback, useState } from "react";
import { useConfirm } from "@/contexts/ConfirmDialog";
import { useIdealistaActions } from "@/hooks/useIdealistaActions";
import { useInverseMatching } from "@/hooks/useInverseMatching";
import { usePropertyImages } from "@/hooks/usePropertyImages";
import { useImmobiliFilters } from "@/hooks/useImmobiliFilters";
import { usePropertyDetail } from "@/hooks/usePropertyDetail";
import { extractImageUrls } from "@/lib/imageUtils";
import {
  buildPropertyWhatsAppMessage,
  normalizeWhatsAppPhone,
  openWhatsApp,
} from "@/lib/immobili/whatsapp";
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { 
  Search, MapPin, Euro, Maximize2, BedDouble, Bath, Home, Tag, Filter,
  Plus, ChevronRight, ChevronLeft,     User, Camera,
  Image as ImageIcon, Phone, Mail,     Key,
    CheckCircle2, Map, UploadCloud,  Eye,
    ChevronDown, ChevronUp, BarChart3, SlidersHorizontal, RotateCcw, ExternalLink, FileText
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
import { PropertyDetailModal } from "@/components/immobili/PropertyDetailModal";
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
  const detail = usePropertyDetail({ refresh });
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
  } = detail;

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

  // Genera la ficha tecnica del inmueble en PDF. Si el propietario aun no se
  // ha cargado, lo trae antes para no imprimir la ficha sin sus datos.
  const handleGenerateScheda = async () => {
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
      toast.error('Errore generazione scheda PDF. Controlla la console.');
    } finally {
      setIsSchedaGenerating(false);
    }
  };

  // Abre el selector de fotos del cartel, precargando la primera foto y la
  // descripcion actual como texto por defecto.
  const handleOpenPrintSelector = () => {
    setSelectedPrintPhotos(extractImages(selectedProperty).slice(0, 1));
    setCustomPrintText(selectedProperty?.Textos?.Descrizione || "");
    setShowPrintSelector(true);
  };

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
  // Los tres handlers que recibe PropertyCard van en useCallback con
  // referencias estables. Antes eran arrow functions inline, asi que el
  // React.memo de la tarjeta no servia de nada: cualquier tecla en el buscador
  // o en el formulario de edicion reconciliaba las 15 tarjetas visibles.
  const handleToggleMenu = useCallback((item: any) => {
    setOpenMenuId(prev => (prev === item.id ? null : item.id));
  }, []);

  const handleCardOpenDetail = useCallback((item: any) => {
    setOpenMenuId(null);
    handleOpenDetail(item);
  }, [handleOpenDetail]);

  const handleQuickStatusChange = useCallback(async (item: any, newSospeso: boolean) => {
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
  }, [refresh]);







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
            onToggleMenu={handleToggleMenu}
            onOpenDetail={handleCardOpenDetail}
            onQuickStatusChange={handleQuickStatusChange}
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
        <PropertyDetailModal
          detail={detail}
          photos={photos}
          idealista={idealista}
          inverse={inverse}
          dropzone={{ getRootProps, getInputProps, isDragActive }}
          onOpenLightbox={openLightboxOnSource}
          onSelectCliente={setSelectedClienteModal}
          onWhatsAppCliente={handleInverseWhatsApp}
          onFileUpload={handleFileUpload}
          onGenerateScheda={handleGenerateScheda}
          onOpenPrintSelector={handleOpenPrintSelector}
        />
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
