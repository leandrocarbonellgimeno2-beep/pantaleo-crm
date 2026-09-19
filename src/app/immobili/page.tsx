"use client";
import Link from "next/link";

import { useCallback, useState } from "react";
import { useConfirm } from "@/contexts/ConfirmDialog";
import { useIdealistaActions } from "@/hooks/useIdealistaActions";
import { useInverseMatching } from "@/hooks/useInverseMatching";
import { usePropertyImages } from "@/hooks/usePropertyImages";
import { useImmobiliFilters } from "@/hooks/useImmobiliFilters";
import { usePropertyDetail } from "@/hooks/usePropertyDetail";
import { usePropertyPrinting } from "@/hooks/usePropertyPrinting";
import { extractImageUrls } from "@/lib/imageUtils";
import {
  buildPropertyWhatsAppMessage,
  normalizeWhatsAppPhone,
  openWhatsApp,
} from "@/lib/immobili/whatsapp";
import { toast } from 'sonner';
import { 
  Search, MapPin, Euro, Maximize2, BedDouble, Bath,  Tag, Filter,
  Plus, ChevronRight, ChevronLeft,     User, Camera,
  Image as ImageIcon, Phone, Mail,     Key,
    CheckCircle2, Map, UploadCloud,  Eye,
     ChevronUp, BarChart3, SlidersHorizontal, RotateCcw, ExternalLink, FileText
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
import { PropertyGrid } from "@/components/immobili/PropertyGrid";
import { PropertyGallery } from "@/components/immobili/PropertyGallery";
import { PropertyDetailModal } from "@/components/immobili/PropertyDetailModal";
import dynamic from "next/dynamic";
import { useDropGuard } from "@/hooks/useDropGuard";

// FsLightbox: caricato dinamicamente — riduce ~50KB dal bundle iniziale.
const FsLightbox = dynamic(() => import("fslightbox-react"), { ssr: false });

// Importazione dinamica del componente mappa (Leaflet non supporta SSR)

// Helper for Boolean icons grid

// extractImages è ora centralizzato in @/lib/imageUtils — alias locale per
// non rompere i call sites esistenti.
const extractImages = extractImageUrls;

// El visor avisa de su apertura porque la ficha del inmueble necesita saberlo:
// fslightbox escucha Escape en `document` en fase de BURBUJA y useDialog lo
// hace en fase de CAPTURA, o sea que el dialogo se lo come antes. Ver abajo.
const PhotoViewer = ({ images, toggler, sourceIndex, onOpen, onClose }: { images: string[], toggler: boolean, sourceIndex: number, onOpen: () => void, onClose: () => void }) => {
  if (!images || images.length === 0) return null;

  return (
    <FsLightbox
      key={images.length}
      toggler={toggler}
      sources={images}
      types={images.map(() => 'image' as const)}
      slide={sourceIndex + 1}
      onOpen={onOpen}
      onClose={onClose}
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
    cambiarEstadoLocal, quitarLocal, fusionarLocal,
    visibleCount, setVisibleCount, displayedCount, remaining, PAGE_SIZE,
  } = useImmobiliFilters();
  // Ficha del inmueble: estado, carga diferida y acciones.
  // Ver src/hooks/usePropertyDetail.ts. Se renombra en la desestructuracion
  // para no tocar el JSX existente.
  const detail = usePropertyDetail({ refresh, fusionarLocal, quitarLocal });
  const {
    selectedProperty, setSelectedProperty,
    isLoadingDetail, detailError,
    isModalOpen, setIsModalOpen,
    viewMode, setViewMode,
    isSaving,
    ownerData,
    ownerProperties, showOwnerPropsModal, setShowOwnerPropsModal,
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
  // Si el visor esta abierto, la ficha le cede Escape. El detalle de por que,
  // en el comentario de PhotoViewer y en la prop sinEscape de la ficha.
  const [lightboxAbierto, setLightboxAbierto] = useState(false);

  // Idealista Integration State

  // Delete Guardrail State




  const openLightboxOnSource = (index: number) => {
    setLightboxController({
      toggler: !lightboxController.toggler,
      sourceIndex: index
    });
  };

  // ── Idealista Actions ──
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

  // Abre el selector de fotos del cartel, precargando la primera foto y la
  // descripcion actual como texto por defecto.

  // Genera el cartel de escaparate en PDF con las fotos y el texto elegidos.

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

    // El cambio se pinta YA, sobre el array que esta en memoria. Antes esto
    // llamaba a refresh(), que ponia isValidating a true, la rejilla lo leia
    // como transicion de filtro y sustituia la lista entera por esqueleto
    // mientras redescargaba los 631 documentos activos. Suspender un inmueble
    // costaba 631 lecturas y un parpadeo de toda la pantalla para acabar
    // enseñando lo mismo menos una tarjeta.
    //
    // Y no es un parcheo del campo: con el filtro en «Attivi» la cache SOLO
    // tiene activos, asi que suspender significa que el inmueble DEJA DE
    // PERTENECER a la lista y hay que quitarlo. De eso se ocupa
    // cambiarEstadoLocal. Ver lib/immobili/mutacion-local.ts.
    const deshacer = cambiarEstadoLocal(item.id, newSospeso);

    try {
      const res = await fetch('/api/immobili', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, GestioneCommerciale: updatedGC }),
      });
      if (!res.ok) throw new Error('Errore di rete');
      toast.success(`Immobile ${item.DatiBase?.Codice || ''} → ${newSospeso ? 'Sospeso' : 'Attivo'}`);
    } catch {
      // Si la escritura fallo, la lista vuelve a como estaba. Tambien en local:
      // castigar el error con 631 lecturas y otro parpadeo no arregla nada.
      deshacer();
      toast.error('Errore durante il cambio stato');
    }
  }, [cambiarEstadoLocal]);







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
    // La tarjeta del listado solo pinta thumbnail e imageCount, y los dos se
    // derivan de la lista que acaba de guardarse: no hace falta releer los 631
    // documentos para enseñar la foto nueva.
    onSaved: (images: string[]) => fusionarLocal({
      id: selectedProperty?.id,
      images,
      thumbnail: images[0] || null,
      imageCount: images.length,
    }),
    confirm,
  });

  // Ficha tecnica y cartel de escaparate. Ver src/hooks/usePropertyPrinting.ts.
  const printing = usePropertyPrinting({ property: selectedProperty, ownerData });


  // El dropzone se monta dentro de la ficha, que es el unico sitio donde se
  // usa, y ademas perezoso. Aqui arriba obligaba a cargar react-dropzone en el
  // arranque de la pantalla aunque no se abriera ninguna ficha.
  //
  // Lo que SI tiene que seguir cubriendo la pantalla entera es la guarda de
  // soltar ficheros: react-dropzone la instalaba de propina y se fue con el, de
  // modo que sin esto soltar una foto sobre el listado sacaria al agente del
  // CRM para abrir el fichero. Dos oyentes, cero dependencias.
  useDropGuard();


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

      <PropertyGrid
        items={filteredImmobili}
        visibleCount={visibleCount}
        loading={loading}
        isTransitioning={isFilterTransitioning}
        remaining={remaining}
        openMenuId={openMenuId}
        onToggleMenu={handleToggleMenu}
        onOpenDetail={handleCardOpenDetail}
        onQuickStatusChange={handleQuickStatusChange}
        onLoadMore={handleLoadMore}
      />

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
          onOpenLightbox={openLightboxOnSource}
          lightboxAbierto={lightboxAbierto}
          onSelectCliente={setSelectedClienteModal}
          onWhatsAppCliente={handleInverseWhatsApp}
          onFileUpload={handleFileUpload}
          printing={printing}
        />
      )}

      {/* Print Selector Modal */}
      {printing.showPrintSelector && (
        <PrintSelectorModal
          images={extractImages(selectedProperty)}
          selected={printing.selectedPrintPhotos}
          onSelectedChange={printing.setSelectedPrintPhotos}
          onLimitReached={() => toast.error(`Puoi selezionare massimo ${MAX_PRINT_PHOTOS} foto per il cartello.`)}
          customText={printing.customPrintText}
          onCustomTextChange={printing.setCustomPrintText}
          generating={printing.isPdfGenerating}
          status={printing.pdfStatus}
          onGenerate={printing.generateCartello}
          onClose={() => printing.setShowPrintSelector(false)}
        />
      )}

      {/* Photo Viewer Isolated at the Root Level */}
      {validLightboxImages.length > 0 && (
        <PhotoViewer
          images={validLightboxImages}
          toggler={lightboxController.toggler}
          sourceIndex={Math.min(lightboxController.sourceIndex, validLightboxImages.length - 1)}
          onOpen={() => setLightboxAbierto(true)}
          onClose={() => setLightboxAbierto(false)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          CARTELLO VETRINA — Print Layout (hidden on screen, visible in @media print)
          This renders an A4-sized professional property flyer
      ═══════════════════════════════════════════════════════════ */}
      {selectedProperty && (
        <CartelloPrintLayout
          property={selectedProperty}
          photos={printing.selectedPrintPhotos}
          customText={printing.customPrintText}
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
