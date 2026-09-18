"use client";
import NextImage from "next/image";
import Link from "next/link";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useImmobili } from "@/hooks/useImmobili";
import { useDebounce } from "@/hooks/useDebounce";
import { useConfirm } from "@/contexts/ConfirmDialog";
import { useIdealistaActions } from "@/hooks/useIdealistaActions";
import { useInverseMatching } from "@/hooks/useInverseMatching";
import { extractImageUrls } from "@/lib/imageUtils";
import { compressImage } from "@/lib/immobili/imageCompression";
import { getOwnerDisplayName } from "@/lib/immobili/owner";
import {
  type AdvFilters,
  applyAdvancedFilters,
  countActiveFilters,
  createEmptyAdvFilters,
  NON_RESIDENTIAL_TYPES,
} from "@/lib/immobili/filters";
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
  Image as ImageIcon, Phone, Mail, Car, Wind, Waves, Armchair, Key,
  Sunrise, Trees, CheckCircle2, Map, UploadCloud, Printer, Eye,
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
import zonasData from "@/lib/zonas.json";
import dynamic from "next/dynamic";

// FsLightbox: caricato dinamicamente — riduce ~50KB dal bundle iniziale.
const FsLightbox = dynamic(() => import("fslightbox-react"), { ssr: false });

// Importazione dinamica del componente mappa (Leaflet non supporta SSR)
const PropertyMap = dynamic(() => import("@/components/PropertyMap"), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="h-72 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          <p className="text-sm font-medium text-slate-400">Caricamento mappa...</p>
        </div>
      </div>
    </div>
  ),
});

// Helper for Boolean icons grid
const amenityIcons: Record<string, any> = {
  Ascensore: <Sunrise className="h-4 w-4 text-blue-500" />,
  RiscaldamentoAutonomo: <Wind className="h-4 w-4 text-amber-500" />,
  VistaMare: <Waves className="h-4 w-4 text-cyan-500" />,
  Arredato: <Armchair className="h-4 w-4 text-rose-500" />,
  Chiavi: <Key className="h-4 w-4 text-emerald-500" />,
  Garage: <Car className="h-4 w-4 text-slate-500" />,
  PostoAuto: <Car className="h-4 w-4 text-slate-400" />,
  Balcone: <Maximize2 className="h-4 w-4 text-indigo-500" />,
  Terrazza: <Sunrise className="h-4 w-4 text-orange-500" />,
  Terreno: <Trees className="h-4 w-4 text-green-500" />
};

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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ownerData, setOwnerData] = useState<any>(null);
  const [isSchedaGenerating, setIsSchedaGenerating] = useState(false);
  const [filterType, setFilterType] = useState<"Tutti" | "Vendita" | "Affitto">("Tutti");
  const [filterStato, setFilterStato] = useState<"Attivi" | "Sospesi" | "Tutti">("Attivi");
  const [isMapOpen, setIsMapOpen] = useState(false);

  // Quick action dropdown & toast
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);


  // Advanced Filter Drawer
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [advFilters, setAdvFilters] = useState<AdvFilters>(createEmptyAdvFilters);
  const resetAdvFilters = () => setAdvFilters(createEmptyAdvFilters());

  // Auto-reset camere/bagni/superficie when selecting non-residential tipologie
  useEffect(() => {
    if (NON_RESIDENTIAL_TYPES.includes(advFilters.tipologia)) {
      setAdvFilters(p => ({ ...p, camereMin: '', bagniMin: '', superficieMin: '', superficieMax: '' }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advFilters.tipologia]);

  // Debounced search — input updates instantly, filtering waits 300ms
  const debouncedSearch = useDebounce(searchTerm, 300);

  // SWR — fetches FULL catalogue once (status + type + search only)
  // Advanced filters + visual pagination happen entirely client-side
  const {
    immobiliData,
    totalCount,
    loading,
    isValidating,
    refresh,
  } = useImmobili({
    searchTerm: debouncedSearch,
    filterStato,
    filterType,
    codice: advFilters.codice.trim(),
  });

  // True when a filter/search changed and SWR is fetching new data while still
  // serving stale results from the previous key. We use this to hide the old
  // list immediately instead of letting the user see wrong data.
  const isFilterTransitioning = isValidating && !loading;

  // Visual pagination — render 15 at a time, no network on "load more"
  const PAGE_SIZE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset visibleCount when filters or search change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, filterStato, filterType, advFilters]);


  
  // Printing states
  const [showPrintSelector, setShowPrintSelector] = useState(false);
  const [selectedPrintPhotos, setSelectedPrintPhotos] = useState<string[]>([]);
  const [customPrintText, setCustomPrintText] = useState("");
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  
  // Optimistic UI state for parallel uploads
  const [uploadingPreviews, setUploadingPreviews] = useState<string[]>([]);

  // Drag & Drop State for Images
  const [draggedUrl, setDraggedUrl] = useState<string | null>(null);
  const [dragOverUrl, setDragOverUrl] = useState<string | null>(null);

  // Inverse Matching State
  const inverse = useInverseMatching(selectedProperty);
  // Modal in-page per dettaglio cliente (evita navigazione che perde lo stato dei match)
  const [selectedClienteModal, setSelectedClienteModal] = useState<any>(null);

  // Owner's other properties state
  const [ownerProperties, setOwnerProperties] = useState<any[]>([]);
  const [ownerPropsLoading, setOwnerPropsLoading] = useState(false);
  const [showOwnerPropsModal, setShowOwnerPropsModal] = useState(false);

  // Lightbox state
  const [lightboxController, setLightboxController] = useState({
    toggler: false,
    sourceIndex: 0
  });

  // Idealista Integration State

  // Delete Guardrail State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteTimer, setDeleteTimer] = useState(2);
  const deleteIntervalRef = useRef<NodeJS.Timeout | null>(null);


  // Clear the countdown interval whenever the delete modal closes
  useEffect(() => {
    if (!deleteModalOpen && deleteIntervalRef.current) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
  }, [deleteModalOpen]);

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


  // ═══ CLIENT-SIDE ADVANCED FILTERING — instant, zero network requests ═══
  const filteredImmobili = useMemo(
    () => applyAdvancedFilters(immobiliData, advFilters),
    [immobiliData, advFilters],
  );

  // Contatore filtri attivi per badge
  const activeFilterCount = useMemo(() => countActiveFilters(advFilters), [advFilters]);

  // Pagination display values
  const hasActiveSearch = searchTerm.trim() !== "" || activeFilterCount > 0;
  const displayedCount = Math.min(visibleCount, filteredImmobili.length);
  const remaining = Math.max(0, filteredImmobili.length - visibleCount);



  // Quick status change handler
  const handleQuickStatusChange = async (item: any, newSospeso: boolean) => {
    setOpenMenuId(null);
    const updatedGC = { ...item.GestioneCommerciale, Sospeso: newSospeso };
    // Optimistic local update
    refresh();
    try {
      const res = await fetch('/api/immobili', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, GestioneCommerciale: updatedGC }),
      });
      if (!res.ok) throw new Error('Errore di rete');
      toast.success(`Immobile ${item.DatiBase?.Codice || ''} → ${newSospeso ? 'Sospeso' : 'Attivo'}`);
    } catch {
      // Revert on error
      refresh();
      toast.error('Errore durante il cambio stato');
    }
  };

  // Auto-open logic from URL parameters
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get('id');
      const isNew = params.get('new');
      const propId = params.get('proprietarioId');

      if (urlId) {
        // Fetch specific property details directly
        fetch(`/api/immobili?id=${urlId}`)
          .then(res => res.json())
          .then(data => {
            if (!data.error) {
              handleOpenDetail(data);
              window.history.replaceState({}, '', '/immobili'); // Clean URL
            }
          })
          .catch(console.error);
      } else if (isNew === 'true') {
        // We delay slightly to let \`immobiliData\` load for ID generation, but fallback is ok
        setTimeout(() => {
           handleCreateNew(propId || undefined);
           window.history.replaceState({}, '', '/immobili'); // Clean URL
        }, 500);
      }
    }
  }, []);

  const handleOpenDetail = async (property: any) => {
    setSelectedProperty({ ...property });
    setIsModalOpen(true);
    setViewMode(true);
    setOwnerData(null);
    setOwnerProperties([]);
    setShowOwnerPropsModal(false);
    setIsLoadingDetail(true);
    setDetailError(null);

    // Lazy-load full property data (including all images) + owner details
    const fetches: Promise<any>[] = [
      // Always fetch full property by ID to get complete images array
      fetch(`/api/immobili?id=${property.id}`).then(r => r.json()),
    ];

    if (property.proprietarioId) {
      // Dev diagnostic: log the linking field type and value
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[Owner Link Debug] Rif: ${property.DatiBase?.Codice} | proprietarioId: "${property.proprietarioId}" (type: ${typeof property.proprietarioId})`
        );
      }
      fetches.push(
        fetch(`/api/proprietari?id=${property.proprietarioId}`).then(r => r.json()),
        fetch(`/api/immobili?proprietarioId=${property.proprietarioId}&limit=50`).then(r => r.json()),
      );
    }

    try {
      const results = await Promise.all(fetches);
      
      // Update property with full data (including all images)
      const fullProperty = results[0];
      if (fullProperty && !fullProperty.error) {
        setSelectedProperty((prev: any) => ({ ...prev, ...fullProperty }));
      } else if (fullProperty?.error) {
        console.error('[Detail fetch] API returned error for id', property.id, '→', fullProperty.error);
        setDetailError(fullProperty.error);
      }

      // Owner data
      if (property.proprietarioId && results[1]) {
        // Dev diagnostic: check if owner came back empty or with missing name fields
        if (process.env.NODE_ENV === 'development') {
          const o = results[1];
          if (o.error) {
            console.warn(`[Owner Link Debug] Owner fetch FAILED for propertyId "${property.proprietarioId}":`, o.error);
          } else if (!o.nome && !o.Nome && !o.cognome && !o.Cognome) {
            console.warn(
              `[Owner Link Debug] Owner "${property.proprietarioId}" exists but has NO name fields. Keys:`, Object.keys(o)
            );
          }
        }
        setOwnerData(results[1].error ? null : results[1]);
      }
      // Owner's other properties
      if (property.proprietarioId && results[2]) {
        const allOwnerProps = results[2].data || results[2] || [];
        const otherProps = (Array.isArray(allOwnerProps) ? allOwnerProps : []).filter((p: any) => p.id !== property.id);
        setOwnerProperties(otherProps);
      }
    } catch (error: any) {
      console.error('[Detail fetch] Network/parse error for id', property.id, '→', error);
      setDetailError('Errore di rete durante il caricamento dei dettagli.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSaveProperty = async () => {
    if (!selectedProperty) return;
    setIsSaving(true);
    try {
      if (selectedProperty.id) {
        // UPDATE
        const res = await fetch('/api/immobili', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedProperty),
        });
        
        if (res.ok) {
          refresh();
          setIsModalOpen(false);
        }
      } else {
        // CREATE
        const res = await fetch('/api/immobili', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedProperty),
        });

        if (res.ok) {
          const newDoc = await res.json();
          // Server returns the definitive auto-incremented Codice
          const newlyCreatedProperty = {
            ...selectedProperty,
            id: newDoc.id,
            DatiBase: { ...selectedProperty.DatiBase, Codice: newDoc.codice || selectedProperty.DatiBase?.Codice },
          };
          refresh();
          setSelectedProperty(newlyCreatedProperty);
          setIsModalOpen(false);
        } else {
          alert("Errore durante la creazione dell'immobile.");
        }
      }
    } catch (error) {
      console.error("Error saving property:", error);
      alert("Si è verificato un errore di rete durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProperty = () => {
    if (!selectedProperty?.id) return;
    
    setDeleteModalOpen(true);
    setDeleteConfirmed(false);
    setDeleteTimer(2);
    
    if (deleteIntervalRef.current) clearInterval(deleteIntervalRef.current);
    deleteIntervalRef.current = setInterval(() => {
      setDeleteTimer((prev) => {
        if (prev <= 1) {
          if (deleteIntervalRef.current) clearInterval(deleteIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const executeDeleteProperty = async () => {
    if (!selectedProperty?.id) return;
    
    setIsSaving(true);
    try {
      const res = await fetch(`/api/immobili?id=${selectedProperty.id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        refresh();
        setIsModalOpen(false); // Close detail modal
        setDeleteModalOpen(false); // Close delete modal
        toast.success("Immobile eliminato correttamente");
      } else {
        const errorData = await res.json();
        alert(`Errore durante l'eliminazione: ${errorData.error}`);
        setDeleteModalOpen(false);
      }
    } catch (error) {
      console.error("Error deleting property:", error);
      alert("Si è verificato un errore di rete durante l'eliminazione.");
      setDeleteModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNew = (ownerId?: string) => {
    // Codice is now assigned SERVER-SIDE on save (max existing + 1, base 1000000).
    // We show a placeholder here; the real code is returned by the API on POST.
    const nextCode = '---';

    const emptyProperty = {
      proprietarioId_real: ownerId || "",
      proprietarioId: ownerId || "", // compatibility
      DatiBase: {
        Codice: String(nextCode),
        Riferimento: "",
        Tipologia: "Appartamento",
        Indirizzo: "",
        Citta: "",
        CAP: "",
        Zona: ""
      },
      DettagliFisici: {
        MetriCommerciali: "",
        Vani: "",
        CamereLetto: "",
        Bagni: "",
        Piano: "",
        StatoFiniture: "Abitabile",
        TipoEdificio: "Unica Elevazione",
        ClasseEnergetica: "G"
      },
      Caratteristiche: {
        Ascensore: false,
        RiscaldamentoAutonomo: false,
        AriaCondizionata: false,
        VistaMare: false,
        Balcone: false,
        Garage: false,
        Terrazza: false,
        Giardino: false,
        PostoAutoScoperto: false,
        CucinaAbitabile: false
      },
      GestioneCommerciale: {
        InVendita: true,
        InAffitto: false,
        PrezzoVendita: "",
        PrezzoAffitto: "",
        PrezzoMinimo: "",
        SpeseCondominio: "",
        Amministratore: "",
        Sospeso: false
      },
      Documentazione: {
        Planimetria: "-- Non specificato --",
        UrlPlanimetria: "",
        AttoImmobile: "-- Non specificato --",
        UrlAttoImmobile: "",
        StatoChiavi: "-- Non specificato --",
        UrlAltriDocumenti: ""
      },
      Textos: {
        Descrizione: "",
        NoteInterne: ""
      },
      images: []
    };

    setSelectedProperty(emptyProperty);
    setOwnerData(null);
    setIsModalOpen(true);
    setViewMode(false);
    
    // Fetch owner details if we passed one via URL
    if (ownerId) {
      fetch(`/api/proprietari?id=${ownerId}`)
        .then(res => res.json())
        .then(data => {
            if (!data.error) setOwnerData(data);
        })
        .catch(console.error);
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

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    try {
      if (!selectedProperty || acceptedFiles.length === 0) return;

      const previews = acceptedFiles.map(file => URL.createObjectURL(file));
      setUploadingPreviews(prev => [...prev, ...previews]);

      const uploadPromises = acceptedFiles.map(async (file) => {
         try {
           const compressedBlob = await compressImage(file);
           const formData = new FormData();
           formData.append("file", compressedBlob, file.name.replace(/\.[^/.]+$/, ".webp"));
           formData.append("path", `immobili/${selectedProperty.DatiBase?.Codice}/foto/FotoN_${Date.now()}_${file.name.replace(/\.[^/.]+$/, "")}.webp`);

           const res = await fetch('/api/upload', { method: 'POST', body: formData });
           const data = await res.json();
           if (res.ok && data.url) {
              return data.url;
           } else {
              console.error("Errore caricamento foto dal server", data);
              return null;
           }
         } catch (err) {
           console.error("Errore compr./upload", err);
           return null;
         }
      });

      const results = await Promise.all(uploadPromises);
      const successfulUrls = results.filter(url => url !== null) as string[];

      const finalImages = [...(selectedProperty.images || []), ...successfulUrls];
      const updatedProperty = { ...selectedProperty, images: finalImages };
      setSelectedProperty(updatedProperty);

      // Auto-save via POST immediately after uploading
      await fetch('/api/immobili', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedProperty.id, images: finalImages }),
      });
      refresh();

      setUploadingPreviews(prev => prev.filter(p => !previews.includes(p)));
      previews.forEach(p => URL.revokeObjectURL(p));
    } catch (err) {
       console.error("Errore onDrop", err);
       alert("Errore durante il caricamento. Riprova.");
       setUploadingPreviews([]);
    }
  }, [selectedProperty]);

  // Por URL, NO por índice: la galería del formulario se pinta desde
  // extractImages(), que deduplica y concatena los campos legacy, mientras que
  // este flujo muta `images`. Son dos arrays con distinto orden y longitud, así
  // que pasar el índice de uno al otro borraba la foto equivocada.
  const handleDeletePhoto = async (e: React.MouseEvent, urlToDelete: string) => {
    e.stopPropagation();

    const currentImages: string[] = selectedProperty.images || [];
    if (!currentImages.includes(urlToDelete)) {
      toast.error('Questa foto proviene da un campo legacy e non può essere rimossa da qui.');
      return;
    }

    const ok = await confirm({
      title: 'Eliminare la foto?',
      message: 'La foto verrà rimossa definitivamente dall\'immobile.',
      danger: true,
    });
    if (!ok) return;

    const imageToDelete = urlToDelete;
    const newImages = currentImages.filter(url => url !== urlToDelete);

    // Optimistic UI updates
    const updatedProperty = { ...selectedProperty, images: newImages };
    setSelectedProperty(updatedProperty);

    try {
      // Delete from Firestore
      const res = await fetch('/api/immobili', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedProperty.id, images: newImages }),
      });
      if (!res.ok) throw new Error("Errore aggiornamento Firestore");
      refresh();

      // Delete from Storage
      await fetch('/api/upload', { 
        method: 'DELETE', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageToDelete })
      });

    } catch(err) {
      console.error(err);
      alert("Errore durante l'eliminazione della foto.");
      // Rollback
      setSelectedProperty({ ...updatedProperty, images: selectedProperty.images });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: {'image/*': [], 'application/pdf': []} });

  const updateNested = (category: string, field: string, value: any) => {
    setSelectedProperty((prev: any) => ({
      ...prev,
      [category]: {
        ...(prev[category] || {}),
        [field]: value
      }
    }));
  };

  // Igual que el borrado: por URL, porque el índice de la galería no
  // corresponde al del array `images` que se reordena.
  const handleImageDragStart = (e: React.DragEvent, url: string) => {
    setDraggedUrl(url);
    // Needed for Firefox
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", e.currentTarget.outerHTML);
  };

  const handleImageDragEnter = (url: string) => {
    setDragOverUrl(url);
  };

  const handleImageDragEnd = async () => {
    const resetDrag = () => { setDraggedUrl(null); setDragOverUrl(null); };

    if (!draggedUrl || !dragOverUrl || draggedUrl === dragOverUrl) {
      resetDrag();
      return;
    }

    const newImages = [...(selectedProperty.images || [])];
    const from = newImages.indexOf(draggedUrl);
    const to = newImages.indexOf(dragOverUrl);
    if (from === -1 || to === -1) {
      toast.error('Una delle foto proviene da un campo legacy: impossibile riordinare da qui.');
      resetDrag();
      return;
    }

    newImages.splice(from, 1);
    newImages.splice(to, 0, draggedUrl);

    // Update Local State
    const updatedProperty = { ...selectedProperty, images: newImages };
    setSelectedProperty(updatedProperty);

    resetDrag();

    // Save strictly to Backend through API (which uses Firebase updateDoc inside)
    try {
      const res = await fetch('/api/immobili', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedProperty.id, images: newImages }),
      });
      if (!res.ok) throw new Error("Errore backend");
      refresh();
    } catch (err) {
      console.error("Error saving image order", err);
      alert("Errore nel salvataggio del nuovo ordine su Firebase.");
    }
  };

  const validLightboxImages = selectedProperty?.images?.filter((url: string) => typeof url === 'string' && url.startsWith('http')) || [];

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
                 <div className="w-full max-w-[1400px] mx-auto space-y-6">
                   {/* 1. Header & Mosaic Gallery */}
                   <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row gap-6 relative">
                     <div className="flex-1">
                       <div className="flex items-center gap-3 mb-3">
                         <span className={cn(
                            "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm flex items-center gap-1",
                            selectedProperty.GestioneCommerciale?.Sospeso ? "bg-rose-600 text-white" : "bg-emerald-500 text-white"
                          )}>
                            {selectedProperty.GestioneCommerciale?.Sospeso ? "Sospeso" : (
                               <>
                                 {selectedProperty.GestioneCommerciale?.InVendita && "In Vendita"}
                                 {selectedProperty.GestioneCommerciale?.InVendita && selectedProperty.GestioneCommerciale?.InAffitto && " | "}
                                 {selectedProperty.GestioneCommerciale?.InAffitto && "In Affitto"}
                               </>
                            )}
                         </span>
                         <span className="bg-slate-100 text-slate-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-200">
                           CODICE IMMOBILE: {selectedProperty.DatiBase?.Codice || "N/A"}
                         </span>
                       </div>
                       <h1 className="text-3xl lg:text-4xl font-black text-slate-900 leading-tight">
                         {selectedProperty.DatiBase?.Tipologia || "Immobile"} a {selectedProperty.DatiBase?.Citta}
                       </h1>
                       <div className="flex items-center text-slate-500 font-medium text-base mt-2">
                         <MapPin className="h-4 w-4 mr-1.5 text-primary" />
                         {selectedProperty.DatiBase?.Indirizzo || "Indirizzo non specificato"}, {selectedProperty.DatiBase?.Zona && `${selectedProperty.DatiBase.Zona}`}
                       </div>
                     </div>
                     <div className="text-left md:text-right flex flex-col justify-end">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Prezzo Richiesto</div>
                        <div className="text-2xl md:text-3xl lg:text-4xl font-black text-primary bg-primary/5 px-4 py-2 rounded-xl inline-flex flex-col md:flex-row items-end md:items-center gap-2 border border-primary/10">
                           {selectedProperty.GestioneCommerciale?.InVendita && (
                              <span>€ {Number(selectedProperty.GestioneCommerciale?.PrezzoVendita || 0).toLocaleString()}</span>
                           )}
                           {selectedProperty.GestioneCommerciale?.InVendita && selectedProperty.GestioneCommerciale?.InAffitto && (
                              <span className="text-slate-300 hidden md:inline">|</span>
                           )}
                           {selectedProperty.GestioneCommerciale?.InAffitto && (
                              <span className="text-orange-500 md:text-3xl text-2xl">€ {Number(selectedProperty.GestioneCommerciale?.PrezzoAffitto || 0).toLocaleString()} <span className="text-sm text-slate-400 font-bold uppercase">/mese</span></span>
                           )}
                        </div>
                     </div>
                   </div>

                   {/* Clean Carousel Gallery */}
                   {isLoadingDetail ? (
                     <div className="w-full h-48 bg-slate-100 rounded-3xl flex flex-col items-center justify-center gap-3 text-slate-400">
                       <div className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-indigo-500 animate-spin" />
                       <span className="text-xs font-semibold uppercase tracking-widest">Caricamento foto...</span>
                     </div>
                   ) : detailError ? (
                     <div className="w-full h-48 bg-red-50 rounded-3xl flex flex-col items-center justify-center gap-2 text-red-400">
                       <ImageIcon className="h-8 w-8 opacity-50" />
                       <span className="text-sm font-bold uppercase tracking-widest">Errore caricamento dettagli</span>
                       <span className="text-xs text-red-300">{detailError}</span>
                     </div>
                   ) : (
                     <PropertyGallery
                       images={selectedProperty.images || []}
                       onOpenLightbox={openLightboxOnSource}
                     />
                   )}

                   {/* 2. Corpo Principale (Layout 2 Colonne) */}
                   <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
                     
                     {/* COLONNA SINISTRA (70%) */}
                     <div className="lg:col-span-8 space-y-6">
                       
                       {/* Caratteristiche e Struttura */}
                       <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                         <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                           <Home className="h-5 w-5 text-indigo-500" />
                           Struttura Immobile
                         </h3>
                         <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-6">
                            <div className="flex flex-col gap-1 border-r border-slate-100 last:border-0 pr-4">
                               <Maximize2 className="h-6 w-6 text-slate-300 mb-2" />
                               <span className="text-2xl font-black text-slate-800">{selectedProperty.DettagliFisici?.MetriCommerciali || "--"}</span>
                               <span className="text-[11px] font-bold text-slate-400 uppercase">Metri Comm. (m²)</span>
                            </div>
                            <div className="flex flex-col gap-1 border-r border-slate-100 last:border-0 pr-4">
                               <Home className="h-6 w-6 text-slate-300 mb-2" />
                               <span className="text-2xl font-black text-slate-800">{selectedProperty.DettagliFisici?.Locali || selectedProperty.DettagliFisici?.Vani || "--"}</span>
                               <span className="text-[11px] font-bold text-slate-400 uppercase">Vani / Locali</span>
                            </div>
                            <div className="flex flex-col gap-1 border-r border-slate-100 last:border-0 pr-4">
                               <BedDouble className="h-6 w-6 text-slate-300 mb-2" />
                               <span className="text-2xl font-black text-slate-800">{selectedProperty.DettagliFisici?.CamereLetto || "--"}</span>
                               <span className="text-[11px] font-bold text-slate-400 uppercase">Camere Letto</span>
                            </div>
                            <div className="flex flex-col gap-1 border-r border-slate-100 last:border-0 pr-4">
                               <Bath className="h-6 w-6 text-slate-300 mb-2" />
                               <span className="text-2xl font-black text-slate-800">{selectedProperty.DettagliFisici?.Bagni || "--"}</span>
                               <span className="text-[11px] font-bold text-slate-400 uppercase">Bagni</span>
                            </div>
                            <div className="flex flex-col gap-1 pr-4">
                               <div className="h-7 w-12 flex items-center justify-center font-black text-emerald-600 border-2 border-emerald-200 bg-emerald-50 rounded mb-2 pt-0.5 text-xs">
                                 {selectedProperty.DettagliFisici?.ClasseEnergetica || "-"}
                               </div>
                               <span className="text-2xl font-black text-slate-800">{selectedProperty.DettagliFisici?.Piano || "T"}</span>
                               <span className="text-[11px] font-bold text-slate-400 uppercase">Piano</span>
                            </div>
                         </div>
                          
                          <div className="grid grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-100">
                             <div>
                                <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Stato Finiture</span>
                                <span className="font-bold text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 inline-block">{selectedProperty.DettagliFisici?.StatoFiniture || "Non specificato"}</span>
                             </div>
                             <div>
                                <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Tipologia Edificio</span>
                                <span className="font-bold text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 inline-block">{selectedProperty.DettagliFisici?.TipoEdificio || "Non specificato"}</span>
                             </div>
                          </div>
                       </div>

                       {/* Dotazioni e Comfort */}
                       <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                         <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                           <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                           Dotazioni e Comfort
                         </h3>
                         <div className="flex flex-wrap gap-3">
                            {selectedProperty.Caratteristiche && Object.entries(selectedProperty.Caratteristiche).map(([key, value]) => {
                              if (value === true) {
                                return (
                                  <span key={key} className="inline-flex items-center gap-2 bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 shadow-sm hover:bg-slate-100 transition-colors">
                                    {amenityIcons[key] || <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                                    {key.replace(/([A-Z])/g, ' $1').trim()}
                                  </span>
                                );
                              }
                              return null;
                            })}
                            {(!selectedProperty.Caratteristiche || !Object.values(selectedProperty.Caratteristiche).includes(true)) && (
                              <span className="text-slate-400 text-sm italic font-medium bg-slate-50 px-4 py-2 rounded-lg w-full text-center border border-slate-100">Nessuna dotazione salvata nel sistema per questo immobile.</span>
                            )}
                         </div>
                       </div>

                       {/* Descrizione Pubblica */}
                       <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                         <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                           <Filter className="h-5 w-5 text-blue-500" />
                           Descrizione Pubblica
                         </h3>
                         <div className="text-slate-700 leading-relaxed font-medium whitespace-pre-wrap text-[15px] prose prose-slate">
                           {selectedProperty.Textos?.Descrizione || (
                             <span className="italic text-slate-400">Nessun testo descriptivo pubblico caricato...</span>
                           )}
                         </div>
                       </div>

                        {/* Mappa dell'Area (Privacy: Solo zona approssimativa) */}
                        {(selectedProperty.DatiBase?.Citta || selectedProperty.DatiBase?.Indirizzo) && (
                          <PropertyMap
                            indirizzo={selectedProperty.DatiBase?.Indirizzo}
                            citta={selectedProperty.DatiBase?.Citta}
                            zona={selectedProperty.DatiBase?.Zona}
                          />
                        )}

                     </div>

                     {/* COLONNA DESTRA (30%) Dati Sensibili */}
                     <div className="lg:col-span-4 space-y-6">
                       
                       {/* Proprietario (CRM Only) */}
                       <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-10 transition-opacity pointer-events-none transform group-hover:scale-110 duration-500">
                            <User className="w-32 h-32 text-indigo-900" />
                          </div>
                          <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <User className="h-4 w-4" /> CRM: Dati Proprietario
                          </h3>
                          <div className="space-y-5 relative z-10">
                            <div>
                               <a
                                 href={selectedProperty.proprietarioId ? `/proprietari?open=${selectedProperty.proprietarioId}` : '#'}
                                 className="text-2xl font-black text-slate-900 leading-tight hover:text-indigo-700 transition-colors cursor-pointer inline-block"
                               >
                                 {selectedProperty.DatiBase?.NomeProprietario || getOwnerDisplayName(ownerData, 'Non Associato')}
                               </a>
                               <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mt-1.5 flex items-center bg-indigo-100 w-fit px-2.5 py-1 rounded">
                                 Mandante Originale
                               </div>
                            </div>
                            
                            {(ownerData?.telefono || ownerData?.email) ? (
                              <div className="pt-4 border-t border-indigo-200/50 flex flex-col gap-3">
                                {ownerData?.telefono && (
                                  <a href={`tel:${ownerData.telefono}`} className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-indigo-100 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group/link">
                                     <div className="bg-emerald-100 p-2 rounded-lg group-hover/link:bg-emerald-200 transition-colors"><Phone className="h-4 w-4 text-emerald-600" /></div>
                                     <span className="font-bold text-slate-700 text-sm tracking-wide">{ownerData.telefono}</span>
                                  </a>
                                )}
                                {ownerData?.email && (
                                  <a href={`mailto:${ownerData.email}`} className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-indigo-100 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group/link">
                                     <div className="bg-sky-100 p-2 rounded-lg group-hover/link:bg-sky-200 transition-colors"><Mail className="h-4 w-4 text-sky-600" /></div>
                                     <span className="font-bold text-slate-700 text-sm truncate">{ownerData.email}</span>
                                  </a>
                                )}
                                {selectedProperty.proprietarioId && (
                                  <button
                                    onClick={() => ownerProperties.length > 0 && setShowOwnerPropsModal(true)}
                                    disabled={ownerProperties.length === 0}
                                    className={cn(
                                      "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border mt-1 w-full",
                                      ownerProperties.length > 0
                                        ? "bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border-indigo-200 cursor-pointer hover:shadow-md"
                                        : "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                                    )}
                                  >
                                    <Home className="h-3.5 w-3.5" />
                                    {ownerProperties.length > 0 ? (
                                      <>
                                        Vedi altre {ownerProperties.length} proprietà
                                        <span className="ml-auto h-5 w-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shadow-sm">{ownerProperties.length}</span>
                                      </>
                                    ) : (
                                      "Unica proprietà"
                                    )}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="pt-4 border-t border-indigo-200/50 space-y-3">
                                 <p className="text-sm font-medium text-slate-500 italic">I contatti dettagliati del proprietario non sono caricati a sistema.</p>
                                 {selectedProperty.proprietarioId && (
                                   <>
                                   <a
                                     href={`/proprietari?open=${selectedProperty.proprietarioId}`}
                                     className="flex items-center justify-center gap-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border border-indigo-200"
                                   >
                                     <Eye className="h-3.5 w-3.5" /> Vedi Profilo Proprietario
                                   </a>
                                   <button
                                     onClick={() => ownerProperties.length > 0 && setShowOwnerPropsModal(true)}
                                     disabled={ownerProperties.length === 0}
                                     className={cn(
                                       "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border w-full",
                                       ownerProperties.length > 0
                                         ? "bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border-indigo-200 cursor-pointer hover:shadow-md"
                                         : "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                                     )}
                                   >
                                     <Home className="h-3.5 w-3.5" />
                                     {ownerProperties.length > 0 ? (
                                       <>
                                         Vedi altre {ownerProperties.length} proprietà
                                         <span className="ml-auto h-5 w-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shadow-sm">{ownerProperties.length}</span>
                                       </>
                                     ) : (
                                       "Unica proprietà"
                                     )}
                                   </button>
                                   </>
                                 )}
                              </div>
                            )}
                          </div>
                       </div>

                       {/* Codici e Valori Riservati */}
                       <div className="bg-orange-50/50 p-6 rounded-2xl border border-orange-200 shadow-sm relative overflow-hidden">
                          <h3 className="text-xs font-bold text-orange-800 uppercase tracking-widest mb-5 flex items-center gap-2">
                            <Tag className="h-4 w-4" /> Gestione Agenzia (Riservato)
                          </h3>
                          <div className="space-y-4 text-sm bg-white rounded-xl border border-orange-100 p-4">
                             <div className="flex justify-between items-center pb-3 border-b border-orange-100">
                               <span className="text-slate-500 font-bold">Data Incarico:</span>
                               <span className="font-black text-slate-800">{selectedProperty.GestioneCommerciale?.DataIncarico || "--/--/----"}</span>
                             </div>
                             <div className="flex justify-between items-center pb-3 border-b border-orange-100">
                               <span className="text-slate-500 font-bold">Scadenza Mandato:</span>
                               <span className="font-black text-slate-800">{selectedProperty.GestioneCommerciale?.ScadenzaIncarico || "--/--/----"}</span>
                             </div>
                             <div className="flex justify-between items-center pb-3 border-b border-orange-100">
                               <span className="text-slate-500 font-bold flex items-center gap-2"><Key className="w-3 h-3"/> Stato Chiavi:</span>
                               <span className={cn("font-black px-2 py-0.5 rounded text-[10px]", selectedProperty.Documentazione?.StatoChiavi === 'In Ufficio' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>
                                 {selectedProperty.Documentazione?.StatoChiavi || "Sconosciuto"}
                               </span>
                             </div>
                             <div className="flex justify-between items-center pb-3 border-b border-orange-100">
                               <span className="text-slate-500 font-bold">Prezzo Min. Accettato:</span>
                               <span className="font-black text-rose-600 text-base">€ {selectedProperty.GestioneCommerciale?.PrezzoMinimo || "0"}</span>
                             </div>
                             <div className="flex justify-between items-center pb-3 border-b border-orange-100 mt-3 pt-3">
                               <span className="text-slate-500 font-bold">Spese Condominiali:</span>
                               <span className="font-black text-slate-800">€ {selectedProperty.GestioneCommerciale?.SpeseCondominio || "0"} /anno</span>
                             </div>
                             <div className="flex justify-between items-center pt-1">
                               <span className="text-slate-500 font-bold">Amministratore:</span>
                               <span className="font-black text-slate-800 truncate pl-4">{selectedProperty.GestioneCommerciale?.Amministratore || "Non specificato"}</span>
                             </div>
                          </div>

                          {/* Note Private */}
                          <div className="mt-4">
                            <span className="text-slate-500 font-bold block mb-2 text-xs uppercase">Note Interne / Trattativa:</span>
                            <div className="bg-yellow-100/60 p-4 rounded-xl text-slate-800 font-medium italic border border-yellow-200/50 text-sm whitespace-pre-wrap leading-relaxed shadow-inner">
                              {selectedProperty.Textos?.NoteInterne || "Nessuna annotazione privata registrata sull'immobile."}
                            </div>
                          </div>
                       </div>
                       
                     </div>
                   </div>

                   {/* ═══ TROVA ACQUIRENTI — Inverse Smart Matching (Full Width) ═══ */}
                   <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 md:p-8 rounded-2xl border border-violet-200 shadow-sm">
                     <div className="flex items-center justify-between mb-5">
                       <div>
                         <h3 className="text-sm font-black text-violet-800 uppercase tracking-widest flex items-center gap-2">
                           <Zap className="h-5 w-5" /> Trova Acquirenti
                         </h3>
                         <p className="text-xs text-violet-500 font-medium mt-1">Cerca clienti compatibili con questo immobile</p>
                       </div>
                       <button
                         onClick={() => {
                           inverse.setOpen(!inverse.open);
                           if (!inverse.open && inverse.matches.length === 0) inverse.run(0);
                         }}
                         className={cn(
                           "px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm",
                           inverse.open
                             ? 'bg-white text-violet-700 border border-violet-200 hover:bg-violet-50'
                             : 'bg-violet-600 text-white hover:bg-violet-700'
                         )}
                       >
                         {inverse.loading ? (
                           <><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />Analisi...</>
                         ) : inverse.open ? 'Chiudi' : (<><Zap className="h-4 w-4 inline mr-1" />Cerca Clienti</>)}
                       </button>
                     </div>

                     {inverse.open && (
                       <div>
                         {inverse.loading ? (
                           <div className="flex flex-col items-center py-12 gap-3">
                             <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
                             <p className="text-sm text-violet-600 font-medium">Analisi dei clienti in corso...</p>
                           </div>
                         ) : inverse.matches.length === 0 ? (
                           <div className="text-center py-10">
                             <BarChart3 className="h-12 w-12 text-violet-200 mx-auto mb-3" />
                             <p className="text-sm font-bold text-violet-400">Nessun cliente compatibile trovato (≥40%)</p>
                           </div>
                         ) : (
                           <>
                             <p className="text-xs font-bold text-violet-600 mb-4">
                               {inverse.total} client{inverse.total !== 1 ? 'i' : 'e'} compatibil{inverse.total !== 1 ? 'i' : 'e'}
                             </p>

                             <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                               {inverse.matches.map((cm: any) => {
                                 const pct = cm.matchPercentage;
                                 const isExp = inverse.expanded === cm.clienteId;
                                 const dateStr = cm.dataCreazione
                                   ? new Date(cm.dataCreazione).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                   : null;

                                 return (
                                   <div key={cm.clienteId} className="bg-white rounded-xl border border-violet-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                     <div className="p-4 flex items-center gap-3">
                                       {/* Score Badge */}
                                       <div className={cn(
                                         "h-12 w-12 rounded-lg flex items-center justify-center text-sm font-black text-white flex-shrink-0",
                                         pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-orange-500'
                                       )}>
                                         {pct}%
                                       </div>

                                       {/* Client Info — Clickable Name */}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <button
                                               onClick={() => setSelectedClienteModal(cm)}
                                               className="text-sm font-black text-slate-800 truncate hover:text-violet-600 transition-colors cursor-pointer flex items-center gap-1.5"
                                               title="Apri dettagli cliente"
                                             >
                                               {cm.nome} {cm.cognome}
                                               <ExternalLink className="h-3 w-3 text-violet-400 flex-shrink-0" />
                                             </button>
                                            {cm.isRecent && (
                                              <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded text-[10px] font-black flex-shrink-0">
                                                🔥 Nuovo
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 mt-0.5">
                                            {dateStr && (
                                              <span className="text-[11px] text-slate-400 font-medium">
                                                In data: {dateStr}
                                              </span>
                                            )}
                                            {cm.telefono && (
                                              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-0.5">
                                                <Phone className="h-3 w-3" /> {cm.telefono}
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                                            {cm.summary}
                                          </p>
                                        </div>

                                       {/* Actions */}
                                       <div className="flex items-center gap-1.5 flex-shrink-0">
                                         <button
                                           onClick={() => handleInverseWhatsApp(cm)}
                                           className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-200 transition-colors"
                                           title="WhatsApp"
                                         >
                                           <MessageCircle className="h-4 w-4" />
                                         </button>
                                         <button
                                           onClick={() => inverse.setExpanded(isExp ? null : cm.clienteId)}
                                           className={cn(
                                             "h-9 w-9 rounded-lg flex items-center justify-center transition-colors border",
                                             isExp ? 'bg-violet-100 text-violet-600 border-violet-200' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'
                                           )}
                                           title="Dettagli"
                                         >
                                           {isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                         </button>
                                       </div>
                                     </div>

                                     {/* Expanded Breakdown */}
                                     {isExp && (
                                       <div className="px-4 pb-4 pt-0 border-t border-violet-50">
                                         <div className="bg-slate-50/80 rounded-lg p-3 mt-2">
                                           <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Punteggio Dettagliato</h5>
                                           <div className="space-y-1.5">
                                             {(cm.breakdown || []).map((b: any) => (
                                               <div key={b.criterio} className={cn("flex items-center gap-2", b.wildcard && 'opacity-50')}>
                                                 <span className={cn("text-[10px] font-bold w-20 text-right flex-shrink-0", b.wildcard ? 'text-slate-400 italic' : 'text-slate-600')}>{b.label}</span>
                                                 <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                   <div
                                                     className={cn("h-full rounded-full transition-all duration-500",
                                                       b.wildcard ? 'bg-slate-300' :
                                                       b.score >= 0.8 ? 'bg-emerald-500' : b.score >= 0.5 ? 'bg-amber-500' : b.score > 0 ? 'bg-orange-400' : 'bg-slate-300'
                                                     )}
                                                     style={{ width: `${Math.round(b.score * 100)}%` }}
                                                   />
                                                 </div>
                                                 <span className={cn("text-[10px] font-bold w-10 flex-shrink-0", b.wildcard ? 'text-slate-400' : 'text-slate-500')}>{b.puntos}/{b.peso}</span>
                                               </div>
                                             ))}
                                           </div>
                                         </div>
                                       </div>
                                     )}
                                   </div>
                                 );
                               })}
                             </div>

                             {/* Load More */}
                             {inverse.hasMore && (
                               <button
                                 onClick={() => inverse.run(inverse.page + 1)}
                                 disabled={inverse.loadingMore}
                                 className="w-full py-3 mt-4 bg-white border border-violet-200 text-violet-700 text-sm font-bold rounded-xl hover:bg-violet-50 transition-colors disabled:opacity-50"
                               >
                                 {inverse.loadingMore ? (
                                   <><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />Caricamento...</>
                                 ) : (
                                   `Carica altri 15 clienti (${inverse.matches.length}/${inverse.total})`
                                 )}
                               </button>
                             )}
                           </>
                         )}
                       </div>
                     )}
                   </div>

                 </div>
               ) : (
                 <div className="space-y-6 max-w-6xl mx-auto">
                    {/* EDIT MODE CARDS - Card 1: Codici e Stato */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
                   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
                     <Tag className="h-4 w-4 text-primary" />
                     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">1. Codici e Stato</h3>
                   </div>
                   <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Stato Immobile</label>
                        <select 
                          className="w-full h-11 px-3 rounded-lg border border-emerald-200 bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-emerald-800"
                          value={selectedProperty.GestioneCommerciale?.Sospeso ? "Sospeso" : "Attivo"}
                          onChange={(e) => updateNested('GestioneCommerciale', 'Sospeso', e.target.value === "Sospeso")}
                        >
                          <option value="Attivo">🟢 Libero / Attivo</option>
                          <option value="Sospeso">🔴 Sospeso</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Codice Cliente</label>
                        <input 
                          type="text" 
                          readOnly 
                          value={selectedProperty.DatiBase?.Codice || "N/A"} 
                          className="w-full h-11 px-3 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 font-medium cursor-not-allowed"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Proprietario Collegato</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            readOnly 
                            value={selectedProperty.DatiBase?.NomeProprietario || getOwnerDisplayName(ownerData, ownerData === null ? 'Caricamento...' : 'Proprietario da verificare')} 
                            className="flex-1 h-11 px-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-bold"
                          />
                          <button className="h-11 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-sm font-bold transition-colors">Cambia</button>
                        </div>
                      </div>
                   </div>
                </div>

                {/* Card 2: Ubicazione */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
                   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
                     <MapPin className="h-4 w-4 text-rose-500" />
                     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">2. Ubicazione</h3>
                   </div>
                   <div className="p-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                        <div className="col-span-1 md:col-span-2 space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Indirizzo Completo</label>
                          <input type="text" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" value={selectedProperty.DatiBase?.Indirizzo || ""} onChange={(e) => updateNested('DatiBase', 'Indirizzo', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Città</label>
                          <input type="text" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" value={selectedProperty.DatiBase?.Citta || ""} onChange={(e) => updateNested('DatiBase', 'Citta', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Provincia / CAP</label>
                          <div className="flex gap-2">
                            <input type="text" className="w-16 h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-center font-bold" value={selectedProperty.DatiBase?.Provincia || "TP"} onChange={(e) => updateNested('DatiBase', 'Provincia', e.target.value)} />
                            <input type="text" className="flex-1 h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" placeholder="CAP" value={selectedProperty.DatiBase?.CAP || ""} onChange={(e) => updateNested('DatiBase', 'CAP', e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Zona / Quartiere</label>
                          <select 
                            className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                            value={selectedProperty.DatiBase?.Zona || ""} 
                            onChange={(e) => updateNested('DatiBase', 'Zona', e.target.value)}
                          >
                            <option value="">Nessuna Zona</option>
                            {zonasData.map((zona: string) => (
                              <option key={zona} value={zona}>{zona}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Distanza Mare (m)</label>
                          <input type="text" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" placeholder="Es. 500" value={selectedProperty.DatiBase?.DistanzaMare || ""} onChange={(e) => updateNested('DatiBase', 'DistanzaMare', e.target.value)} />
                        </div>
                        <div className="col-span-1 md:col-span-2 flex items-center h-full pt-4">
                           <label className="flex items-center gap-3 cursor-pointer">
                             <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary" checked={selectedProperty.Caratteristiche?.ZonaMare || false} onChange={(e) => updateNested('Caratteristiche', 'ZonaMare', e.target.checked)} />
                             <span className="font-bold text-slate-700">Situato in Zona Mare (Turistica)</span>
                           </label>
                        </div>
                      </div>
                      <button 
                        onClick={() => setIsMapOpen(!isMapOpen)}
                        className="w-full h-11 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors mt-4"
                      >
                        <Map className="h-4 w-4" /> {isMapOpen ? "Nascondi Mappa" : "Apri Mappa Interattiva"}
                      </button>

                      {isMapOpen && (
                        <div className="mt-4 w-full h-72 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner relative">
                           <iframe
                             width="100%"
                             height="100%"
                             frameBorder="0"
                             style={{border:0}}
                             src={`https://maps.google.com/maps?q=${encodeURIComponent(`${selectedProperty.DatiBase?.Indirizzo || ''}, ${selectedProperty.DatiBase?.Citta || ''}, ${selectedProperty.DatiBase?.Provincia || ''}`)}&output=embed`}
                             allowFullScreen
                           />
                        </div>
                      )}
                   </div>
                </div>

                {/* Card 3: Caratteristiche e Struttura */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
                   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
                     <Home className="h-4 w-4 text-indigo-500" />
                     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">3. Struttura Immobile</h3>
                   </div>
                   <div className="p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Tipologia</label>
                        <select 
                          className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          value={selectedProperty.DatiBase?.Tipologia || "Appartamento"}
                          onChange={(e) => updateNested('DatiBase', 'Tipologia', e.target.value)}
                        >
                          <option value="Appartamento">Appartamento</option>
                          <option value="Casa/Villa">Casa/Villa</option>
                          <option value="Locale o Capannone">Locale o Capannone</option>
                          <option value="Terreni">Terreni</option>
                          <option value="Garage o Posto auto">Garage o Posto auto</option>
                          <option value="Edificio">Edificio</option>
                          <option value="Ufficio">Ufficio</option>
                          <option value="Rustico">Rustico</option>
                          <option value="Stanza">Stanza</option>
                          <option value="Cessione Di Attivita">Cessione Di Attivita</option>
                          <option value="Cantina">Cantina</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Metri Comm. (m²)</label>
                        <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={selectedProperty.DettagliFisici?.MetriCommerciali || 0} onChange={(e) => updateNested('DettagliFisici', 'MetriCommerciali', Number(e.target.value))} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">N° Vani</label>
                        <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={selectedProperty.DettagliFisici?.Vani || 0} onChange={(e) => updateNested('DettagliFisici', 'Vani', Number(e.target.value))} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">N° Camere Letto</label>
                        <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={selectedProperty.DettagliFisici?.CamereLetto || 0} onChange={(e) => updateNested('DettagliFisici', 'CamereLetto', Number(e.target.value))} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">N° Bagni</label>
                        <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={selectedProperty.DettagliFisici?.Bagni || 0} onChange={(e) => updateNested('DettagliFisici', 'Bagni', Number(e.target.value))} />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Piano</label>
                        <input type="text" className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={selectedProperty.DettagliFisici?.Piano || ""} onChange={(e) => updateNested('DettagliFisici', 'Piano', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Stato Finiture</label>
                        <select 
                          className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          value={selectedProperty.DettagliFisici?.StatoFiniture || "Abitabile"}
                          onChange={(e) => updateNested('DettagliFisici', 'StatoFiniture', e.target.value)}
                        >
                          <option value="Nuovo">Nuovo</option>
                          <option value="Ottime">Ottime</option>
                          <option value="Buono">Buono</option>
                          <option value="Abitabile">Abitabile</option>
                          <option value="Da Ristrutturare">Da Ristrutturare</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Stato Arredamento</label>
                        <select 
                           className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                           value={selectedProperty.Caratteristiche?.ArredamentoDesc || (selectedProperty.Caratteristiche?.Arredato ? "Arredato" : "Non Arredato")} 
                           onChange={(e) => {
                             updateNested('Caratteristiche', 'ArredamentoDesc', e.target.value);
                             updateNested('Caratteristiche', 'Arredato', e.target.value === "Arredato");
                           }}
                        >
                          <option value="-- Non specificato --">-- Non specificato --</option>
                          <option value="Arredato">Arredato</option>
                          <option value="Non Arredato">Non Arredato</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Tipologia Edificio</label>
                        <select 
                           className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                           value={selectedProperty.DettagliFisici?.TipoEdificio || "Unica Elevazione"} 
                           onChange={(e) => updateNested('DettagliFisici', 'TipoEdificio', e.target.value)}
                        >
                          <option value="Unica Elevazione">Unica Elevazione</option>
                          <option value="Più Piani">Più Piani</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Presenza Cartello</label>
                        <select 
                           className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                           value={selectedProperty.GestioneCommerciale?.PresenzaCartello || "No — Senza Cartello"} 
                           onChange={(e) => updateNested('GestioneCommerciale', 'PresenzaCartello', e.target.value)}
                        >
                          <option value="Sì — Ha Cartello Pubblicitario">Sì — Ha Cartello Pubblicitario</option>
                          <option value="No — Senza Cartello">No — Senza Cartello</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Classe Energetica (APE)</label>
                        <select className="w-full h-11 px-3 rounded-lg border border-green-300 bg-green-50 font-black text-green-800 focus:outline-none focus:ring-2 focus:ring-green-400/20 focus:border-green-500" value={selectedProperty.DettagliFisici?.ClasseEnergetica || ""} onChange={(e) => updateNested('DettagliFisici', 'ClasseEnergetica', e.target.value)}>
                          <option value="">Seleziona APE...</option>
                          <option value="A4">A4 (Massima Efficienza)</option>
                          <option value="A3">A3</option>
                          <option value="A2">A2</option>
                          <option value="A1">A1</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="D">D</option>
                          <option value="E">E</option>
                          <option value="F">F</option>
                          <option value="G">G</option>
                        </select>
                      </div>
                   </div>
                </div>

                {/* Card 4: Dotazioni */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
                   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
                     <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">4. Dotazioni e Comfort</h3>
                   </div>
                   <div className="p-5 space-y-6">
                      <div>
                        <h4 className="text-sm font-bold text-slate-500 mb-3 uppercase">Interne</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {Object.entries({
                             'Ascensore': 'Ascensore',
                             'RiscaldamentoAutonomo': 'Riscaldamento Autonomo',
                             'AriaCondizionata': 'Aria Condizionata',
                             'CucinaAbitabile': 'Cucina Abitabile'
                          }).map(([key, label]) => {
                             const isActive = selectedProperty.Caratteristiche?.[key] || false;
                             return (
                               <button 
                                 key={key}
                                 onClick={() => updateNested('Caratteristiche', key, !isActive)}
                                 className={cn("h-11 rounded-lg border text-sm font-bold transition-all", isActive ? "bg-primary/10 border-primary text-primary" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}
                               >
                                 {label}
                               </button>
                             )
                          })}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-500 mb-3 uppercase">Esterne ed Extra</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {Object.entries({
                             'Balcone': 'Balcone',
                             'VistaMare': 'Vista Mare',
                             'Terrazza': 'Terrazza',
                             'Terreno': 'Terreno',
                             'Giardino': 'Giardino',
                             'Garage': 'Garage',
                             'Cantina': 'Cantina',
                             'PostoAutoCoperto': 'Posto Auto Coperto',
                             'PostoAutoScoperto': 'Posto Auto Scoperto'
                          }).map(([key, label]) => {
                             const isActive = selectedProperty.Caratteristiche?.[key] || false;
                             return (
                               <button 
                                 key={key}
                                 onClick={() => updateNested('Caratteristiche', key, !isActive)}
                                 className={cn("h-11 rounded-lg border text-sm font-bold transition-all", isActive ? "bg-cyan-50 border-cyan-500 text-cyan-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}
                               >
                                 {label}
                               </button>
                             )
                          })}
                        </div>
                      </div>
                   </div>
                </div>

                {/* Card 6: Prezzi */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
                   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
                     <Euro className="h-4 w-4 text-amber-500" />
                     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">5. Operazione e Prezzi</h3>
                   </div>
                   <div className="p-5 space-y-6">
                      <div className="flex gap-6 pb-6 border-b border-slate-100">
                         <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200 flex-1 hover:bg-slate-100 transition-colors">
                            <input type="checkbox" className="w-6 h-6 rounded border-slate-300 text-primary" checked={selectedProperty.GestioneCommerciale?.InVendita || false} onChange={(e) => updateNested('GestioneCommerciale', 'InVendita', e.target.checked)} />
                            <span className="font-black text-lg text-slate-800">IN VENDITA</span>
                         </label>
                         <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200 flex-1 hover:bg-slate-100 transition-colors">
                            <input type="checkbox" className="w-6 h-6 rounded border-slate-300 text-primary" checked={selectedProperty.GestioneCommerciale?.InAffitto || false} onChange={(e) => updateNested('GestioneCommerciale', 'InAffitto', e.target.checked)} />
                            <span className="font-black text-lg text-slate-800">IN AFFITTO</span>
                         </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                         <div className="space-y-2">
                           <label className="text-xs font-bold text-slate-500 uppercase">Prezzo Vendita (€)</label>
                           <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold bg-green-50/50" value={selectedProperty.GestioneCommerciale?.PrezzoVendita || 0} onChange={(e) => updateNested('GestioneCommerciale', 'PrezzoVendita', Number(e.target.value))} />
                         </div>
                         <div className="space-y-2">
                           <label className="text-xs font-bold text-slate-500 uppercase">Prezzo Min. Accettabile (€)</label>
                           <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold bg-orange-50/50" placeholder="0" value={selectedProperty.GestioneCommerciale?.PrezzoMinimo || 0} onChange={(e) => updateNested('GestioneCommerciale', 'PrezzoMinimo', Number(e.target.value))} />
                         </div>
                         <div className="space-y-2">
                           <label className="text-xs font-bold text-slate-500 uppercase">Canone Mensile (€)</label>
                           <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold" value={selectedProperty.GestioneCommerciale?.PrezzoAffitto || 0} onChange={(e) => updateNested('GestioneCommerciale', 'PrezzoAffitto', Number(e.target.value))} />
                         </div>
                         <div className="space-y-2">
                           <label className="text-xs font-bold text-slate-500 uppercase">Spese Cond. Annue (€)</label>
                           <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" placeholder="0" value={selectedProperty.GestioneCommerciale?.SpeseCondominio || 0} onChange={(e) => updateNested('GestioneCommerciale', 'SpeseCondominio', Number(e.target.value))} />
                         </div>
                         <div className="col-span-2 space-y-2">
                           <label className="text-xs font-bold text-slate-500 uppercase">Amministratore Condominio</label>
                           <input type="text" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" value={selectedProperty.GestioneCommerciale?.Amministratore || ""} onChange={(e) => updateNested('GestioneCommerciale', 'Amministratore', e.target.value)} />
                         </div>
                      </div>
                   </div>
                </div>

                {/* Card Nuova: Documentazione e Chiavi */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm mb-6">
                   <div className="px-5 py-4 border-b border-border bg-slate-50/50 flex items-center gap-2">
                     <Filter className="h-4 w-4 text-emerald-600" />
                     <div>
                        <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">📁 Documentazione e Chiavi</h3>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Stato dei documenti fisici/digitali e disponibilità delle chiavi</p>
                     </div>
                   </div>
                   <div className="p-5 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                         <div className="space-y-3">
                           <label className="text-xs font-bold text-slate-500 uppercase">Planimetria</label>
                           <select 
                             className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                             value={selectedProperty.Documentazione?.Planimetria || "-- Non specificato --"}
                             onChange={(e) => updateNested('Documentazione', 'Planimetria', e.target.value)}
                           >
                              <option value="-- Non specificato --">-- Non specificato --</option>
                              <option value="Disponibile">Disponibile</option>
                              <option value="Da Richiedere">Da Richiedere</option>
                           </select>
                           <label className="w-full h-9 bg-slate-50 border border-slate-200 border-dashed rounded-lg flex items-center justify-center text-xs font-bold text-slate-500 hover:text-primary hover:border-primary transition-colors cursor-pointer">
                              <UploadCloud className="h-3 w-3 mr-1.5" /> 
                              {selectedProperty.Documentazione?.UrlPlanimetria ? "Aggiorna File Planimetria" : "Carica File Planimetria"}
                              <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => handleFileUpload(e, 'documenti', 'Documentazione', 'UrlPlanimetria')} />
                           </label>
                           {selectedProperty.Documentazione?.UrlPlanimetria && (
                              <a href={selectedProperty.Documentazione.UrlPlanimetria} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 font-bold block mt-1 hover:underline truncate">Vedi Documento Corrente</a>
                           )}
                         </div>
                         <div className="space-y-3">
                           <label className="text-xs font-bold text-slate-500 uppercase">Atto Immobile</label>
                           <select 
                             className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                             value={selectedProperty.Documentazione?.AttoImmobile || "-- Non specificato --"}
                             onChange={(e) => updateNested('Documentazione', 'AttoImmobile', e.target.value)}
                           >
                              <option value="-- Non specificato --">-- Non specificato --</option>
                              <option value="Disponibile">Disponibile</option>
                              <option value="Da Richiedere">Da Richiedere</option>
                           </select>
                           <label className="w-full h-9 bg-slate-50 border border-slate-200 border-dashed rounded-lg flex items-center justify-center text-xs font-bold text-slate-500 hover:text-primary hover:border-primary transition-colors cursor-pointer">
                              <UploadCloud className="h-3 w-3 mr-1.5" /> 
                              {selectedProperty.Documentazione?.UrlAttoImmobile ? "Aggiorna File Atto" : "Carica File Atto"}
                              <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => handleFileUpload(e, 'documenti', 'Documentazione', 'UrlAttoImmobile')} />
                           </label>
                           {selectedProperty.Documentazione?.UrlAttoImmobile && (
                              <a href={selectedProperty.Documentazione.UrlAttoImmobile} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 font-bold block mt-1 hover:underline truncate">Vedi Documento Corrente</a>
                           )}
                         </div>
                         <div className="space-y-3 flex flex-col">
                           <label className="text-xs font-bold text-slate-500 uppercase">Stato Chiavi</label>
                           <select 
                             className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                             value={selectedProperty.Documentazione?.StatoChiavi || "-- Non specificato --"}
                             onChange={(e) => updateNested('Documentazione', 'StatoChiavi', e.target.value)}
                           >
                              <option value="-- Non specificato --">-- Non specificato --</option>
                              <option value="In Ufficio">In Ufficio</option>
                              <option value="Dal Proprietario">Dal Proprietario</option>
                              <option value="All'Inquilino">All'Inquilino</option>
                           </select>
                           <div className="mt-auto">
                             <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Vari</label>
                             <label className="w-full h-9 bg-slate-50 border border-slate-200 border-dashed rounded-lg flex items-center justify-center text-xs font-bold text-slate-500 hover:text-primary hover:border-primary transition-colors cursor-pointer">
                                <UploadCloud className="h-3 w-3 mr-1.5" /> 
                                {selectedProperty.Documentazione?.UrlAltriDocumenti ? "Aggiorna Altri Documenti" : "Altri Documenti"}
                                <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => handleFileUpload(e, 'documenti', 'Documentazione', 'UrlAltriDocumenti')} />
                             </label>
                             {selectedProperty.Documentazione?.UrlAltriDocumenti && (
                              <a href={selectedProperty.Documentazione.UrlAltriDocumenti} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 font-bold block mt-1 hover:underline truncate">Vedi Documento Corrente</a>
                             )}
                           </div>
                         </div>
                      </div>
                   </div>
                </div>

                {/* Card 7: Immagini e Dropzone */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
                   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-fuchsia-500" />
                        <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">6. Immagini e Media</h3>
                     </div>
                     {selectedProperty.images && selectedProperty.images.length > 0 && (
                        <span className="text-xs font-bold bg-fuchsia-100 text-fuchsia-700 px-3 py-1 rounded-full">{selectedProperty.images.length} foto in Firebase</span>
                     )}
                   </div>
                   <div className="p-5 space-y-6">
                      {/* Dropzone */}
                      <div {...getRootProps()} className={cn("border-2 border-dashed rounded-xl p-8 text-center transition-colors", selectedProperty?.id ? "cursor-pointer" : "opacity-50 cursor-not-allowed", isDragActive && selectedProperty?.id ? "border-primary bg-primary/5" : "border-slate-300 bg-slate-50 hover:border-primary hover:bg-slate-50/80")}>
                        <input {...getInputProps()} disabled={!selectedProperty?.id} />
                        <UploadCloud className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                        <p className="font-bold text-slate-700 text-lg">
                          {selectedProperty?.id ? "Trascina le foto qui o clicca per sfogliare" : "Salva prima le informazioni per caricare foto"}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">Caricamento automatico su Firebase Storage e aggiornamento Firestore</p>
                      </div>

                      {/* Photo Grid Grid */}
                      {selectedProperty.images && selectedProperty.images.length > 0 && (
                        <div>
                           <h4 className="text-sm font-bold text-slate-500 mb-3 uppercase">Galleria Attuale</h4>
                           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                              {extractImages(selectedProperty).map((img: string, idx: number) => {
                                const isBlob = typeof img === 'string' && img.startsWith('blob:');
                                const lightboxIdx = validLightboxImages.indexOf(img);
                                
                                return (
                                <div 
                                  key={idx} 
                                  draggable={!isBlob}
                                  onClick={() => {
                                    if (isBlob) return;
                                    if (lightboxIdx !== -1) openLightboxOnSource(lightboxIdx);
                                  }}
                                  onDragStart={(e) => !isBlob && handleImageDragStart(e, img)}
                                  onDragEnter={(e) => {
                                    e.preventDefault();
                                    if (!isBlob) handleImageDragEnter(img);
                                  }}
                                  onDragEnd={handleImageDragEnd}
                                  onDragOver={(e) => e.preventDefault()}
                                  className={cn(
                                    "relative aspect-square rounded-xl overflow-hidden group border transition-all",
                                    !isBlob ? "cursor-grab active:cursor-grabbing" : "opacity-60 cursor-not-allowed",
                                    dragOverUrl === img ? "border-primary border-4 scale-105 shadow-xl" : "border-slate-200"
                                  )}
                                >
                                  <img 
                                     src={img} 
                                     alt="Immobile" 
                                     className={cn("w-full h-full object-cover transition-transform pointer-events-none", !isBlob && "group-hover:scale-110")} 
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
                                  {idx === 0 && !isBlob && (
                                    <div className="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-sm pointer-events-none">
                                      Principale
                                    </div>
                                  )}
                                  <button onClick={(e) => handleDeletePhoto(e, img)} className="absolute top-2 right-2 h-7 w-7 bg-white/90 rounded-full flex items-center justify-center text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white">
                                     <Trash2 className="h-4 w-4" />
                                  </button>
                                  {isBlob && (
                                    <div className="absolute inset-0 bg-slate-900/20 flex items-center justify-center pointer-events-none">
                                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                                    </div>
                                  )}
                                </div>
                              )})}
                              {uploadingPreviews.map((preview, idx) => (
                                <div key={`preview-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 opacity-60">
                                  <img src={preview} alt="Uploading..." className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-slate-900/20 flex items-center justify-center pointer-events-none">
                                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                                  </div>
                                </div>
                              ))}
                           </div>
                        </div>
                      )}
                   </div>
                </div>

                {/* Card 8: Descrizione */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
                   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
                     <Filter className="h-4 w-4 text-slate-500" />
                     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">7. Testi e Descrizioni</h3>
                   </div>
                   <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-500 uppercase">Descrizione Immobile (Pubblica)</label>
                       <textarea 
                         className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-medium min-h-[160px]"
                         value={selectedProperty.Textos?.Descrizione || ""}
                         onChange={(e) => updateNested('Textos', 'Descrizione', e.target.value)}
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-500 uppercase text-rose-500">Note Riservate (Solo Agenzia)</label>
                       <textarea 
                         className="w-full px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 focus:border-rose-400 font-medium min-h-[160px] text-slate-700"
                         value={selectedProperty.Textos?.NoteInterne || ""}
                         onChange={(e) => updateNested('Textos', 'NoteInterne', e.target.value)}
                       />
                     </div>
                   </div>
                </div>

             </div>
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
