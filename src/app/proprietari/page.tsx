"use client";

import { useState, useEffect, useMemo } from "react";
import { esFuenteLocal } from "@/lib/image-optimizable";
import NextImage from "next/image";
import { Search, Plus, User, Phone, Mail, MapPin, Eye, Edit2, Loader2, Building2, X, ChevronRight, Home, Trash2, FileText, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import SignaturePad from "@/components/ui/SignaturePad";
import { Proprietario } from "@/types/proprietario";
import { useProprietari } from "@/hooks/useProprietari";
import { useDebounce } from "@/hooks/useDebounce";
import { useDialog, useCierreAlPinchoFuera } from "@/hooks/useDialog";
import { useConfirm } from "@/contexts/ConfirmDialog";

export default function ProprietariPage() {
  const confirm = useConfirm();
  const [searchTerm, setSearchTerm] = useState("");
  const { proprietari: allProprietari, loading, refresh } = useProprietari();

  // Visual pagination
  const PAGE_SIZE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Debounced search — input updates instantly, filtering waits 300ms
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Client-side filter + sort — instant, zero network requests
  const filteredProprietari = useMemo(() => {
    // Resolve any createdAt shape → milliseconds (0 if absent/unparseable).
    // Handles Firebase Timestamp objects ({ _seconds, seconds }), toMillis(),
    // ISO strings, and numeric timestamps.
    const createdAtMs = (p: any): number => {
      const ca = p.createdAt;
      if (!ca) return 0;
      const s = ca._seconds ?? ca.seconds;
      if (s != null) return s * 1000;
      if (typeof ca.toMillis === 'function') return ca.toMillis();
      if (typeof ca === 'string' || typeof ca === 'number') return new Date(ca).getTime() || 0;
      return 0;
    };

    const THIRTY_MIN_MS = 30 * 60 * 1000;

    // 1. Show owners with ≥1 immobile, OR created within the last 30 minutes
    //    (grace window so a newly added proprietario stays visible while the
    //    agent links their first property — data in Firebase is never modified).
    let list = allProprietari.filter((p: any) => {
      if ((p.numero_immobili ?? 0) > 0) return true;
      const ms = createdAtMs(p);
      return ms > 0 && (Date.now() - ms) < THIRTY_MIN_MS;
    });

    // 2. Text search with NFD accent normalisation
    if (debouncedSearch.trim()) {
      const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const q = normalize(debouncedSearch);
      list = list.filter((p: any) => {
        const s = normalize([
          p.nome, p.Nome, p.NomeCompleto, p.nominativo, p.name,
          p.cognome, p.Cognome, p.surname,
          p.telefono, p.cell1, p.cell2, p.tel1, p.tel2,
          p.Cellulare, p.Telefono, p.cellulare,
          p.email, p.Email,
          p.indirizzo, p.Indirizzo, p.citta, p.Citta,
          p.codiceFiscale, p.CodiceFiscale, p.codice_fiscale,
        ].filter(Boolean).join(' '));
        return s.includes(q);
      });
    }

    // 3. Sort: newest createdAt first → oldest → no date last
    const toMs = (p: any): number => {
      const ms = createdAtMs(p);
      return ms > 0 ? ms : -1;
    };
    list.sort((a: any, b: any) => {
      const aMs = toMs(a);
      const bMs = toMs(b);
      if (aMs === -1 && bMs === -1) return 0;
      if (aMs === -1) return 1;
      if (bMs === -1) return -1;
      return bMs - aMs;
    });

    return list;
  }, [allProprietari, debouncedSearch]);

  // Reset visibleCount on search change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [debouncedSearch]);
  
  // Form state
  const [formData, setFormData] = useState<Partial<Proprietario>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Slide-over state
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [selectedProprietario, setSelectedProprietario] = useState<Proprietario | null>(null);
  const [activeTab, setActiveTab] = useState<"dati" | "documenti" | "immobili">("dati");

  // B4: Dynamic page title
  useEffect(() => {
    if (isSlideOverOpen && selectedProprietario) {
      const nome = (selectedProprietario.nome || '').trim();
      const cognome = (selectedProprietario.cognome || '').trim();
      const label = [nome, cognome].filter(Boolean).join(' ') || 'Nuovo Proprietario';
      document.title = `${label} — Proprietari | Pantaleo CRM`;
    } else if (isSlideOverOpen) {
      document.title = 'Nuovo Proprietario — Proprietari | Pantaleo CRM';
    } else {
      document.title = 'Proprietari | Pantaleo CRM';
    }
    return () => { document.title = 'Pantaleo CRM'; };
  }, [isSlideOverOpen, selectedProprietario]);

  // B5: Offline indicator
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Client properties state
  const [clientProperties, setClientProperties] = useState<any[]>([]);
  const [isFetchingProperties, setIsFetchingProperties] = useState(false);

  // Property assignment
  const [assignCode, setAssignCode] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const fetchClientProperties = () => {
    if (selectedProprietario?.id) {
      setIsFetchingProperties(true);
      fetch(`/api/proprietari/${selectedProprietario.id}/immobili`)
        .then(res => res.json())
        .then(data => {
          setClientProperties(data || []);
          setIsFetchingProperties(false);
        })
        .catch(err => {
          console.error("Error fetching client properties:", err);
          setIsFetchingProperties(false);
        });
    }
  };

  useEffect(() => {
    if (isSlideOverOpen && activeTab === "immobili") {
      fetchClientProperties();
    }
  }, [isSlideOverOpen, activeTab, selectedProprietario]);

  const handleAssignProperty = async () => {
    if (!assignCode.trim() || !selectedProprietario?.id) return;
    setIsAssigning(true);
    try {
      const res = await fetch(`/api/proprietari/${selectedProprietario.id}/immobili`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codice: assignCode.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore');
      
      alert("Immobile collegato con successo!");
      setAssignCode("");
      fetchClientProperties();
      refresh();
    } catch (e: any) {
      alert(`Errore: ${e.message}`);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassignProperty = async (propertyId: string) => {
    if (!selectedProprietario?.id) return;
    const ok = await confirm({
      title: 'Scollegare l\'immobile?',
      message: 'L\'immobile verrà disassociato dal proprietario. Potrai ricollegarlo successivamente.',
      confirmLabel: 'Scollega',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/proprietari/${selectedProprietario.id}/immobili`, {
         method: 'DELETE',
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ propertyId })
      });
      if (!res.ok) throw new Error("Errore durante lo scollegamento");
      fetchClientProperties();
      refresh();
    } catch (e) {
      alert("Errore scollegando immobile.");
    }
  };
  const openSlideOver = (prop?: Proprietario) => {
    setSelectedProprietario(prop || null);
    setFormData(prop || {
      stato: "Attivo",
      nazione: "Italia",
      interessato_vendita: false,
      interessato_locazione: false,
      in_esclusiva: false,
      privacy_accettata: false
    });
    setActiveTab("dati");
    setIsSlideOverOpen(true);

    // La lista è proiettata (campi leggeri, SENZA firmaDigitale/documenti) per
    // non trasferire centinaia di firme base64 a ogni caricamento. Quando si
    // apre la scheda di un proprietario esistente, recuperiamo il documento
    // completo così firma e documenti vengono mostrati/modificati correttamente.
    // Merge { ...full, ...prev }: preserva eventuali modifiche già digitate e
    // aggiunge i campi pesanti mancanti.
    if (prop?.id) {
      fetch(`/api/proprietari?id=${prop.id}`)
        .then(res => (res.ok ? res.json() : null))
        .then(full => {
          if (full && !full.error) {
            setSelectedProprietario(full);
            setFormData(prev => ({ ...full, ...prev }));
          }
        })
        .catch(err => console.error('Error loading full proprietario:', err));
    }
  };
  
  const closeSlideOver = () => setIsSlideOverOpen(false);

  const dialogoScheda = useDialog<HTMLDivElement>({
    abierto: isSlideOverOpen,
    alCerrar: closeSlideOver,
  });
  // Esta ficha ya se cerraba al pinchar el velo, así que el comportamiento se
  // mantiene; el hook además exige que el clic empiece y acabe en el velo, de
  // modo que arrastrar una selección de texto fuera del panel ya no la cierra.
  const fondoScheda = useCierreAlPinchoFuera(closeSlideOver);

  // Search is now client-side via useMemo — no debounce/fetch needed

  // Auto-open new proprietario slide-over from URL param (?new=true or ?open=id)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("new") === "true") {
        setTimeout(() => {
          openSlideOver();
          window.history.replaceState({}, "", "/proprietari");
        }, 500);
      }
      const openId = params.get("open");
      if (openId) {
        // Cross-link: open a specific proprietario's profile
        const tab = params.get("tab") as "dati" | "documenti" | "immobili" | null;
        setTimeout(async () => {
          try {
            const res = await fetch(`/api/proprietari?id=${openId}`);
            if (res.ok) {
              const data = await res.json();
              if (data) {
                openSlideOver(data);
                if (tab === "immobili" || tab === "documenti") setActiveTab(tab);
              }
            }
          } catch (e) {
            console.error("Error opening proprietario from URL:", e);
          }
          window.history.replaceState({}, "", "/proprietari");
        }, 600);
      }
    }
  }, []);


  const handleSaveProprietario = async () => {
    setIsSaving(true);
    try {
      const isNew = !selectedProprietario?.id;
      const method = isNew ? "POST" : "PATCH";
      const payload = { ...formData };
      if (!isNew) payload.id = selectedProprietario!.id;
      
      const res = await fetch("/api/proprietari", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) throw new Error("Error saving");
      const result = await res.json();

      await refresh();

      if (isNew && result.id) {
        // New proprietario starts with 0 immobili and is hidden by the list filter.
        // Keep the panel open on the immobili tab so the user can link a property
        // immediately — it will appear in the list once it has at least one.
        setSelectedProprietario({ ...formData, id: result.id } as Proprietario);
        setActiveTab("immobili");
        alert('Proprietario creato! Aggiungici almeno un immobile per renderlo visibile nella lista principale.');
      } else {
        alert('Proprietario salvato con successo!');
        closeSlideOver();
      }
    } catch (error) {
      console.error("Failed to save:", error);
      alert("Errore durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    try {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      if (!formData.id) {
         alert("Devi prima salvare il proprietario per ottenere un ID prima di allegare documenti.");
         return;
      }
      
      const newDocs: any[] = [];
      for(let i = 0; i < files.length; i++) {
        const file = files[i];
        const formDataUpload = new FormData();
        formDataUpload.append("file", file);
        formDataUpload.append("path", `proprietari_docs/${formData.id}/${fieldName}_${Date.now()}_${file.name}`);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formDataUpload,
        });

        if (res.ok) {
          const data = await res.json();
          newDocs.push({ url: data.url, name: file.name });
        } else {
          alert(`Errore durante l'upload di ${file.name}`);
        }
      }

      setFormData(prev => {
        // Handle migration from old flat strings to arrays on the fly
        let existing = prev.documenti?.[fieldName] || [];
        if (typeof existing === 'string') {
           existing = [{ url: existing, name: 'Documento Legacy' }];
        }
        return {
           ...prev,
           documenti: {
              ...(prev.documenti || {}),
              [fieldName]: [...existing, ...newDocs]
           }
        };
      });

    } catch (error) {
      console.error("Upload error:", error);
      alert("Errore di rete durante l'upload");
    }
  };

  const handleDeleteFile = async (fieldName: string, url: string) => {
     const ok = await confirm({
       title: 'Eliminare il documento?',
       message: 'Il file verrà rimosso definitivamente dal proprietario.',
       danger: true,
     });
     if (!ok) return;
     try {
       await fetch('/api/upload', {
         method: 'DELETE',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ url })
       });
       setFormData(prev => {
          let existing = prev.documenti?.[fieldName] || [];
          if (typeof existing === 'string') {
             existing = []; // if legacy string is deleted, it's empty
          } else {
             existing = existing.filter((doc: any) => doc.url !== url);
          }
          const newDocs = { ...prev.documenti, [fieldName]: existing };
          return { ...prev, documenti: newDocs };
       });
     } catch(e) {
       console.error("Delete error", e);
       alert("Errore durante l'eliminazione");
     }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar spacer if needed, or assume global layout handles sidebar. In NextJS app router, it's usually outside. */}
      
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-6 z-10 flex-shrink-0">
          <div className="max-w-7xl mx-auto w-full">
            <PageHeader
              title="Gestione Proprietari"
              subtitle="Registro Proprietari"
              action={
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openSlideOver()}>
                  Nuovo Proprietario
                </Button>
              }
              search={{
                value: searchTerm,
                onChange: setSearchTerm,
                placeholder: "Cerca per nome, cognome, telefono, o email...",
              }}
            />
          </div>
        </div>

        {/* Contenuto (Tabella Proprietari) */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto w-full">
            {loading ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                     <tr className="border-b border-slate-100">
                        <th className="py-4 px-6 font-bold text-xs uppercase tracking-widest text-slate-400">Contatto</th>
                        <th className="py-4 px-6 font-bold text-xs uppercase tracking-widest text-slate-400">Telefono</th>
                        <th className="py-4 px-6 font-bold text-xs uppercase tracking-widest text-slate-400">Email / Indirizzo</th>
                        <th className="py-4 px-6 font-bold text-xs uppercase tracking-widest text-slate-400">Immobili</th>
                        <th className="py-4 px-6 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">Azioni</th>
                     </tr>
                  </thead>
                  <tbody>
                    {[...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-slate-50 animate-pulse">
                        <td className="py-5 px-6">
                           <div className="h-5 bg-slate-200 rounded w-48 mb-2"></div>
                           <div className="h-3 bg-slate-100 rounded w-24"></div>
                        </td>
                        <td className="py-5 px-6"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                        <td className="py-5 px-6"><div className="h-4 bg-slate-200 rounded w-40"></div></td>
                        <td className="py-5 px-6"><div className="h-8 w-8 bg-slate-200 rounded-full"></div></td>
                        <td className="py-5 px-6 text-right"><div className="h-10 bg-slate-200 rounded-xl w-24 ml-auto"></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : filteredProprietari.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                 <div className="w-20 h-20 bg-slate-50 flex items-center justify-center rounded-full mb-6 relative">
                    <User className="w-10 h-10 text-slate-400" />
                    <Search className="w-5 h-5 text-slate-300 absolute -bottom-1 -right-1" />
                 </div>
                 <h3 className="text-xl font-black text-slate-800 mb-2">Nessun proprietario trovato</h3>
                 <p className="text-slate-500 font-medium max-w-sm">
                   Non ci sono risultati per la tua ricerca o il database è vuoto.
                 </p>
              </div>
            ) : (
              <>
                {/* ═══ GRID CARDS proprietari — 1→2→3→4 col ═══ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {filteredProprietari.slice(0, visibleCount).map((prop) => {
                    const nome = (prop.nome || prop.Nome || '').trim();
                    const cognome = (prop.cognome || prop.Cognome || '').trim();
                    const fullName = [nome, cognome].filter(Boolean).join(' ') || 'Senza nome';
                    const initials = ((nome[0] || '') + (cognome[0] || '')).toUpperCase() || '?';
                    const telefono = prop.cellulare || prop.telefono || prop.cell1 || prop.Cellulare || prop.tel1 || '';
                    const email = prop.email || '';
                    const indirizzo = prop.indirizzo_residenza || prop.indirizzo || '';
                    const nImmobili = prop.numero_immobili || prop.immobili_collegati?.length || 0;

                    // Colore avatar per genere (stessa logica clienti)
                    const nomiMaschiliInA = new Set(['luca','andrea','nicola','mattia','elia','enea','battista','barnaba','geremia','zaccaria','isaia','simca','mirca']);
                    const nomeNorm = nome.toLowerCase();
                    const isFemale = nomeNorm.endsWith('a') && !nomiMaschiliInA.has(nomeNorm);
                    const avatarBg = isFemale ? 'bg-purple-600' : 'bg-blue-600';

                    return (
                      <div
                        key={prop.id}
                        className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:shadow-slate-200/60 hover:-translate-y-0.5 transition-all duration-200 flex flex-col"
                      >
                        {/* Fila 1: Avatar centrato + Nome */}
                        <div className="pt-6 px-5 pb-4 flex flex-col items-center text-center">
                          <div className={`h-16 w-16 rounded-full ${avatarBg} flex items-center justify-center text-white font-black text-xl shadow-md mb-3`}>
                            {initials}
                          </div>
                          <h4 className="font-black text-base text-slate-900 leading-tight">{fullName}</h4>
                        </div>

                        {/* Fila 2: Contatti */}
                        <div className="px-5 pb-4 flex flex-col gap-1.5 text-sm">
                          <div className="flex items-center gap-2 text-slate-600 font-medium">
                            <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{telefono || '—'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-400">
                            <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate text-xs">{email || 'Nessuna email'}</span>
                          </div>
                          {indirizzo && (
                            <div className="flex items-start gap-2 text-slate-400">
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              <span className="truncate text-xs">{indirizzo}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-slate-400">
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">ID:</span>
                            <span className="text-xs font-mono text-slate-400 truncate">{prop.id?.substring(0, 14) || '—'}</span>
                          </div>
                        </div>

                        {/* Fila 3: Badge immobili + azioni */}
                        <div className="mt-auto border-t border-slate-100 px-4 py-3 flex items-center justify-between gap-2">
                          {/* Badge proprietà */}
                          <button
                            onClick={() => { openSlideOver(prop); setActiveTab("immobili"); }}
                            className={cn(
                              "inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-xl text-xs font-black border transition-all",
                              nImmobili > 0
                                ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                : "bg-slate-50 text-slate-400 border-slate-200 cursor-default"
                            )}
                          >
                            <Building2 className="w-3.5 h-3.5" />
                            {nImmobili} PROPRIETÀ
                          </button>

                          {/* Azioni rapide */}
                          <div className="flex items-center gap-1">
                            {telefono && (
                              <a
                                href={`https://wa.me/39${telefono.replace(/\D/g, '')}`}
                                target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="h-9 w-9 flex items-center justify-center rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all border border-[#25D366]/20 text-[10px] font-black"
                                title="WhatsApp"
                                aria-label={`Scrivi su WhatsApp a ${fullName}`}
                              >
                                WA
                              </a>
                            )}
                            <button
                              onClick={() => openSlideOver(prop)}
                              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-primary hover:border-primary/30 transition-all"
                              title="Visualizza / Modifica"
                              aria-label={`Visualizza o modifica ${fullName}`}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <a
                              href={`/immobili?new=true&proprietarioId=${prop.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-all"
                              title="Aggiungi Immobile"
                              aria-label={`Aggiungi un immobile a ${fullName}`}
                            >
                              <Home className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {visibleCount < filteredProprietari.length && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                      className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-full shadow-sm hover:bg-slate-50 hover:text-primary hover:border-primary/30 transition-all flex items-center gap-2 text-sm"
                    >
                      <ChevronRight className="w-4 h-4 rotate-90" />
                      Carica altri {Math.min(PAGE_SIZE, filteredProprietari.length - visibleCount)} ({filteredProprietari.length - visibleCount} rimanenti)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* MODAL CENTRAL */}
      {isSlideOverOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200" {...fondoScheda} />

          <div
            ref={dialogoScheda.ref}
            {...dialogoScheda.props}
            aria-labelledby="titolo-scheda-proprietario"
            className="bg-slate-50 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden relative z-10 animate-in zoom-in-95 duration-200 outline-none"
          >

              {/* B5: Offline banner */}
              {!isOnline && (
                <div className="bg-amber-500 text-white text-sm font-bold text-center py-2 px-4 rounded-t-2xl">
                  ⚠️ Connessione assente — le modifiche non verranno salvate finché non torni online.
                </div>
              )}

              {/* Slide-over Header */}
              <div className="bg-white px-8 py-6 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <User className="w-6 h-6" />
                   </div>
                   <div>
                      <h2 id="titolo-scheda-proprietario" className="text-2xl font-black text-slate-800">
                        {selectedProprietario ? "Scheda Cliente" : "Nuovo Proprietario"}
                      </h2>
                      <p className="text-slate-500 font-medium text-sm">
                        {selectedProprietario ? `ID: ${selectedProprietario.id}` : "Inserimento nuovo contatto"}
                      </p>
                   </div>
                </div>
                <button onClick={closeSlideOver} aria-label="Chiudi la scheda" className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Tabs */}
              <div className="bg-white px-8 border-b border-slate-200 flex gap-8 flex-shrink-0">
                 <button 
                   onClick={() => setActiveTab("dati")}
                   className={cn("py-4 text-sm font-bold border-b-2 transition-colors", activeTab === "dati" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700")}
                 >
                    👤 Dati Personali
                 </button>
                 <button 
                   onClick={() => setActiveTab("documenti")}
                   className={cn("py-4 text-sm font-bold border-b-2 transition-colors", activeTab === "documenti" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700")}
                 >
                    📄 Documentazione
                 </button>
                 <button 
                   onClick={() => setActiveTab("immobili")}
                   className={cn("py-4 text-sm font-bold border-b-2 transition-colors", activeTab === "immobili" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700")}
                 >
                    🏠 Lista Proprietà
                 </button>
              </div>

              {/* Slide-over Content */}
              <div className="flex-1 overflow-y-auto p-8">
                 {activeTab === "dati" && (
                <div className="flex flex-col gap-8">
                      {/* Identificazione */}
                      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative">
                         {/* Toggle Stato */}
                         <div className="absolute top-6 right-6 flex items-center gap-3">
                            <span className="text-sm font-bold text-slate-500">
                               {formData.stato === "Attivo" || formData.stato === true ? "Attivo" : "Disattivato"}
                            </span>
                            <button 
                               onClick={() => setFormData(prev => ({...prev, stato: prev.stato === "Attivo" || prev.stato === true ? "Disattivato" : "Attivo"}))}
                               aria-label="Attiva o disattiva il proprietario"
                               className={cn("w-12 h-6 rounded-full transition-colors relative flex items-center", (formData.stato === "Attivo" || formData.stato === true) ? "bg-green-500" : "bg-slate-300")}
                            >
                               <span className={cn("w-4 h-4 bg-white rounded-full shadow-sm transition-transform absolute", (formData.stato === "Attivo" || formData.stato === true) ? "translate-x-7" : "translate-x-1")} />
                            </button>
                         </div>

                         <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                           Identificazione
                         </h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label htmlFor="prop-codice-cliente" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Codice Cliente</label>
                              <input id="prop-codice-cliente" type="text" disabled value={selectedProprietario?.id || "- Autogenerato -"} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-500 font-medium cursor-not-allowed" />
                            </div>
                            <div>
                              <label htmlFor="prop-codice-fiscale" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cod. Fiscale / P.IVA</label>
                              <input id="prop-codice-fiscale" type="text" value={formData.note_riservate || ""} onChange={(e) => setFormData({...formData, note_riservate: e.target.value})} placeholder="Incolla Codice Fiscale..." className="w-full bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" />
                            </div>
                            <div>
                              <label htmlFor="prop-nome" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome</label>
                              <input id="prop-nome" type="text" value={formData.nome || formData.Nome || ""} onChange={(e) => setFormData({...formData, nome: e.target.value, Nome: e.target.value})} className="w-full bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" />
                            </div>
                            <div>
                              <label htmlFor="prop-cognome" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cognome / Rag. Sociale</label>
                              <input id="prop-cognome" type="text" value={formData.cognome || formData.Cognome || ""} onChange={(e) => setFormData({...formData, cognome: e.target.value, Cognome: e.target.value})} className="w-full bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" />
                            </div>
                         </div>
                      </section>

                      {/* Ubicazione */}
                      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                         <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                           Ubicazione
                         </h3>
                         <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                            <div className="md:col-span-12">
                               <label htmlFor="prop-nazione" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nazione</label>
                               <input id="prop-nazione" type="text" value={formData.nazione || "Italia"} onChange={(e) => setFormData({...formData, nazione: e.target.value})} className="w-full bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" />
                            </div>
                            <div className="md:col-span-9">
                              <label htmlFor="prop-indirizzo" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Indirizzo</label>
                              <input id="prop-indirizzo" type="text" value={formData.indirizzo_residenza || formData.indirizzo || ""} onChange={(e) => setFormData({...formData, indirizzo_residenza: e.target.value, indirizzo: e.target.value})} className="w-full bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" />
                            </div>
                            <div className="md:col-span-3">
                              <label htmlFor="prop-numero-civico" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Num. Civico</label>
                              <input id="prop-numero-civico" type="text" value={formData.numero_civico || ""} onChange={(e) => setFormData({...formData, numero_civico: e.target.value})} className="w-full bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" />
                            </div>
                         </div>
                      </section>

                      {/* Contatti */}
                      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                         <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                           Contatti
                         </h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label htmlFor="prop-cellulare" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cellulare Principale</label>
                              <div className="flex gap-2">
                                 <input id="prop-cellulare" type="tel" inputMode="tel" value={formData.cellulare || formData.telefono || formData.cell1 || formData.Cellulare || ""} onChange={(e) => {
                                     const val = e.target.value.replace(/[^0-9+\s-]/g, '');
                                     setFormData(prev => ({...prev, cellulare: val, telefono: val, cell1: val, Cellulare: val}));
                                 }} className="flex-1 bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" />
                                 {(formData.cellulare || formData.telefono || formData.cell1 || formData.Cellulare) && (
                                   <a 
                                     href={`https://wa.me/39${(formData.cellulare || formData.telefono || formData.cell1 || formData.Cellulare || "").replace(/\\s+/g, '')}`} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="bg-green-500 hover:bg-green-600 text-white px-4 rounded-xl font-bold text-sm transition-colors shadow-sm flex items-center justify-center" aria-label="WhatsApp"
                                   >
                                      WA
                                   </a>
                                 )}
                              </div>
                            </div>
                            <div>
                              <label htmlFor="prop-cellulare2" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cellulare Secondario</label>
                              <div className="flex gap-2">
                                 <input id="prop-cellulare2" type="tel" inputMode="tel" value={formData.cellulare2 || formData.telefono2 || ""} onChange={(e) => {
                                     const val = e.target.value.replace(/[^0-9+\s-]/g, '');
                                     setFormData(prev => ({...prev, cellulare2: val, telefono2: val}));
                                 }} className="flex-1 bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" />
                              </div>
                            </div>
                            <div>
                              <label htmlFor="prop-telefono-fisso" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Telefono Fisso</label>
                              <input id="prop-telefono-fisso" type="tel" inputMode="tel" value={formData.telefono_fisso || formData.tel1 || ""} onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9+\s-]/g, '');
                                  setFormData(prev => ({...prev, telefono_fisso: val, tel1: val}));
                              }} className="w-full bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" />
                            </div>
                            <div>
                              <label htmlFor="prop-email" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Email</label>
                              <input id="prop-email" type="email" value={formData.email || ""} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" />
                            </div>
                            <div className="md:col-span-2">
                              <label htmlFor="prop-note" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Note / Annotazioni</label>
                              <textarea id="prop-note" value={formData.note || ""} onChange={(e) => setFormData({...formData, note: e.target.value})} rows={3} className="w-full bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all placeholder:text-slate-400" placeholder="Aggiungi note sui contatti, orari chiamate..."></textarea>
                            </div>
                         </div>
                      </section>

                      {/* Info Commerciali */}
                      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                         <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                           Preferenze Commerciali
                         </h3>
                         <div className="flex flex-col gap-4">
                            <label className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                               <input type="checkbox" checked={formData.interessato_vendita} onChange={(e) => setFormData({...formData, interessato_vendita: e.target.checked})} className="w-5 h-5 text-primary rounded border-slate-300 focus:ring-primary" />
                               <span className="font-bold text-slate-700">Interessato alla Vendita</span>
                            </label>
                            <label className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                               <input type="checkbox" checked={formData.interessato_locazione} onChange={(e) => setFormData({...formData, interessato_locazione: e.target.checked})} className="w-5 h-5 text-primary rounded border-slate-300 focus:ring-primary" />
                               <span className="font-bold text-slate-700">Interessato alla Locazione</span>
                            </label>
                            <label className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                               <input type="checkbox" checked={formData.in_esclusiva} onChange={(e) => setFormData({...formData, in_esclusiva: e.target.checked})} className="w-5 h-5 text-primary rounded border-slate-300 focus:ring-primary" />
                               <span className="font-bold text-slate-700">In Esclusiva</span>
                            </label>
                         </div>
                      </section>

                      {/* Consenso e Firma */}
                      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                         <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                           Consenso e Firma Digitale
                         </h3>
                         <div className="flex flex-col gap-6">
                            <label className="flex items-start gap-3 cursor-pointer">
                               <input type="checkbox" checked={formData.privacy_accettata} onChange={(e) => setFormData({...formData, privacy_accettata: e.target.checked})} className="w-5 h-5 mt-0.5 text-primary rounded border-slate-300 focus:ring-primary flex-shrink-0" />
                               <span className="text-sm font-medium text-slate-600">
                                 Accetto la politica sulla privacy e acconsento al trattamento dei dati personali ai fini della gestione dell&apos;intermediazione immobiliare.
                               </span>
                            </label>
                            
                            <SignaturePad
                              title="Firma Proprietario"
                              value={formData.firmaDigitale || ''}
                              onSave={(b64) => setFormData(prev => ({ ...prev, firmaDigitale: b64 }))}
                              onClear={() => setFormData(prev => ({ ...prev, firmaDigitale: '' }))}
                            />
                         </div>
                      </section>

                   </div>
                 )}

                 {activeTab === "documenti" && (
                   <div className="space-y-6">
                      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                         <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                           Documenti del Proprietario
                         </h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* Documenti Helper Render */}
                            {[ 
                              { id: "identita", label: "Documento d'Identità Proprietario" },
                              { id: "planimetria", label: "Planimetria" },
                              { id: "atto", label: "Atto Immobile / Provenienza" },
                              { id: "extra", label: "Documenti Extra" }
                            ].map(docType => {
                               let filesRaw = formData?.documenti?.[docType.id] || [];
                               if (typeof filesRaw === 'string') filesRaw = [{ url: filesRaw, name: 'Documento Legacy' }];
                               const files = filesRaw as any[];

                               return (
                                 <div key={docType.id} className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex flex-col gap-3">
                                    <label htmlFor={`prop-doc-${docType.id}`} className="block text-xs font-bold text-slate-500 uppercase tracking-widest">{docType.label}</label>
                                    
                                    {/* Lista Documentos Existentes */}
                                    {files.length > 0 && (
                                       <div className="flex flex-col gap-2">
                                          {files.map((fileObj, idx) => (
                                             <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                                                   <FileText className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                   <p className="text-sm font-bold text-slate-700 truncate">{fileObj.name || `Documento ${idx + 1}`}</p>
                                                   <a href={fileObj.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:text-blue-700">Scarica / Vedi PDF</a>
                                                </div>
                                                <button onClick={() => handleDeleteFile(docType.id, fileObj.url)} className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors shrink-0" title="Elimina Documento" aria-label={`Elimina il documento ${fileObj.name || `Documento ${idx + 1}`}`}>
                                                  <Trash2 className="w-4 h-4" />
                                                </button>
                                             </div>
                                          ))}
                                       </div>
                                    )}

                                    {/* Dropzone sempre attiva */}
                                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-200 rounded-xl hover:bg-white hover:border-slate-300 transition-colors cursor-pointer group">
                                       <UploadCloud className="w-6 h-6 text-slate-300 group-hover:text-primary transition-colors mb-2" />
                                       <span className="text-xs font-bold text-slate-400 group-hover:text-slate-600">Clicca per caricare altri File</span>
                                       <input id={`prop-doc-${docType.id}`} type="file" multiple accept=".pdf, image/*" className="hidden" onChange={(e) => handleFileUpload(e, docType.id)} />
                                    </label>
                                 </div>
                               );
                            })}
                         </div>
                      </section>

                      {/* Stato Chiavi Restored */}
                      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                         <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                           Gestione Chiavi Immobile
                         </h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                               <label htmlFor="prop-stato-chiavi" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Stato Chiavi</label>
                               <select id="prop-stato-chiavi" value={formData.stato_chiavi || ""} onChange={(e) => setFormData({...formData, stato_chiavi: e.target.value})} className="w-full bg-white border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all appearance-none cursor-pointer">
                                  <option value="">Seleziona...</option>
                                  <option value="Disponibili">Disponibili</option>
                                  <option value="Non disponibili">Non disponibili</option>
                               </select>
                            </div>
                         </div>
                      </section>
                   </div>
                 )}

                 {activeTab === "immobili" && (
                   <div className="space-y-4">
                      {/* Assign Field */}
                      {selectedProprietario?.id && (
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
                           <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                              Assegna Immobile
                           </h3>
                           <div className="flex gap-4 items-end">
                              <div className="flex-1">
                                 <label htmlFor="prop-assegna-codice" className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tramite Codice / RIF / ID</label>
                                 <input
                                    id="prop-assegna-codice"
                                    type="text"
                                    placeholder="Es. 7405" 
                                    value={assignCode} 
                                    onChange={(e) => setAssignCode(e.target.value)} 
                                    onKeyDown={(e) => e.key === 'Enter' && handleAssignProperty()}
                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-xl px-4 py-3 text-slate-800 font-medium transition-all" 
                                 />
                              </div>
                              <button 
                                 onClick={handleAssignProperty}
                                 disabled={isAssigning || !assignCode.trim()}
                                 className="px-6 py-3 bg-primary text-white font-black rounded-xl hover:opacity-90 shadow-sm disabled:opacity-50 transition-all flex items-center gap-2"
                              >
                                 {isAssigning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                 Aggiungi
                              </button>
                           </div>
                        </div>
                      )}

                      {isFetchingProperties ? (
                         <div className="flex flex-col items-center justify-center py-20 opacity-50">
                            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                               <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                            </div>
                            <p className="text-slate-500 font-bold">Caricamento immobili del cliente in corso...</p>
                         </div>
                      ) : clientProperties.length === 0 ? (
                         <div className="flex flex-col items-center justify-center py-20 opacity-50 bg-white rounded-2xl border border-slate-200 border-dashed">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 text-slate-300">
                               <Building2 className="w-8 h-8" />
                            </div>
                            <p className="text-slate-500 font-bold">Nessun immobile collegato a questo proprietario.</p>
                         </div>
                      ) : (
                         <div className="grid grid-cols-1 gap-4">
                         {clientProperties.map(imm => {
                              const foto = (imm.immagini && imm.immagini.length > 0) ? (typeof imm.immagini[0] === 'string' ? imm.immagini[0] : imm.immagini[0].url) : (imm.imagenPrincipal || imm.fotoGrande || imm.img2 || imm.img3 || "");
                              const tipologia = imm.tipologia || imm.categoria || imm?.DatiBase?.Tipologia || 'Immobile';
                              const rif = imm.codiceImmobile || imm.rif || imm?.DatiBase?.Codice || imm?.DatiBase?.Riferimento || imm.id;
                              const citta = imm.città || imm.citta || imm.luogo || imm.indirizzo || imm?.DatiBase?.Citta || imm?.DatiBase?.Indirizzo || "Indirizzo Sconosciuto";
                              let prezzo = imm.prezzo || imm.prezzoAcquisto || imm?.GestioneCommerciale?.PrezzoVendita || imm?.GestioneCommerciale?.PrezzoAffitto || imm?.DatiEconomici?.Prezzo;
                              const titolo = imm.titolo || imm.descrizione || imm?.Textos?.Descrizione || "Nuovo Incarico";
                               
                              return (
                                <div key={imm.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-4 items-center hover:border-blue-200 transition-colors group">
                                   <div className="w-20 h-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0 relative">
                                      {foto ? (
                                        <NextImage src={foto} alt={tipologia} fill className="object-cover" sizes="80px" loading="lazy" unoptimized={esFuenteLocal(foto)} />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                          <Building2 className="w-6 h-6" />
                                        </div>
                                      )}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                         <span className="text-xs font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">
                                            RIF: {rif}
                                         </span>
                                         <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                                            {tipologia}
                                         </span>
                                      </div>
                                      <h4 className="font-bold text-slate-800 text-sm truncate">{titolo}</h4>
                                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                         <span className="flex items-center gap-1 font-medium"><MapPin className="w-3.5 h-3.5" /> {citta}</span>
                                         <span className="font-bold text-slate-700">
                                            {prezzo ? `€ ${Number(prezzo).toLocaleString('it-IT')}` : 'Prezzo su richiesta'}
                                         </span>
                                      </div>
                                   </div>
                                   
                                   {/* Su touch non esiste l'hover: sotto md le azioni restano sempre visibili,
                                       l'apparizione al passaggio del mouse vale solo da desktop in su. */}
                                   <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                     <button
                                        onClick={() => handleUnassignProperty(imm.id)}
                                        className="p-3 bg-red-50 text-red-500 hover:text-white hover:bg-red-500 rounded-xl transition-colors shrink-0"
                                        title="Scollega Immobile"
                                        aria-label={`Scollega l'immobile RIF ${rif}`}
                                     >
                                        <Trash2 className="w-5 h-5" />
                                     </button>
                                     <a href={`/immobili?id=${imm.id}`} target="_blank" rel="noopener noreferrer" className="p-3 bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-xl transition-colors shrink-0" title="Vedi scheda immobile" aria-label={`Vedi la scheda dell'immobile RIF ${rif}`}>
                                       <ChevronRight className="w-5 h-5" />
                                     </a>
                                   </div>
                                </div>
                              );
                         })}
                         </div>
                      )}
                   </div>
                 )}
              </div>

              {/* Slide-over Footer (Actions) */}
              <div className="bg-white px-8 py-6 border-t border-slate-200 flex justify-end gap-4 flex-shrink-0">
                 <Button variant="secondary" onClick={closeSlideOver} disabled={isSaving}>
                   Annulla
                 </Button>
                 <Button
                   variant="primary"
                   onClick={handleSaveProprietario}
                   loading={isSaving}
                 >
                   Salva Proprietario
                 </Button>
              </div>

            </div>
          </div>
      )}
    </div>
  );
}
