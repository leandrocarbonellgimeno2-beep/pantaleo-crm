"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import dynamic from 'next/dynamic';
import {
  FileText, Search, Plus, Printer, Download, Share2,
  ChevronRight, Clock, User, CheckCircle2, Trash2, Filter, Upload, Loader2, Eye, Wand2, Home as HomeIcon, Users, Building2, Sparkles, Pencil
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentoTemplate } from "@/types/documento";

// Lazy load form components
const formLoader = () => <div className="fixed inset-0 z-50 bg-slate-100 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
const FoglioVisitaForm = dynamic(() => import('@/components/documenti/FoglioVisitaForm'), { ssr: false, loading: formLoader });
const IncaricoLocazioneForm = dynamic(() => import('@/components/documenti/IncaricoLocazioneForm'), { ssr: false, loading: formLoader });
const IncaricoStagionaleForm = dynamic(() => import('@/components/documenti/IncaricoStagionaleForm'), { ssr: false, loading: formLoader });
const IncaricoAcquistoForm = dynamic(() => import('@/components/documenti/IncaricoAcquistoForm'), { ssr: false, loading: formLoader });
const IncaricoEsclusivaForm = dynamic(() => import('@/components/documenti/IncaricoEsclusivaForm'), { ssr: false, loading: formLoader });

// ═══ Document Template Registry ═══
// ═══ ONLY real document templates ═══
type FormType = 'foglio-visita' | 'incarico-locazione' | 'incarico-stagionale' | 'incarico-acquisto' | 'incarico-esclusiva';
interface DocTemplate { id: string; name: string; desc: string; icon: string; color: string; formType: FormType }
const DOC_TEMPLATES: Record<string, Record<string, DocTemplate[]>> = {
  clienti: {
    affitto: [
      { id: "cl-aff-fv", name: "Foglio di Visita", desc: "Verbale di visita immobiliare per locazione", icon: "📋", color: "bg-blue-500", formType: "foglio-visita" },
      { id: "cl-aff-il", name: "Incarico Locazione", desc: "Impegnativa d'affitto per il conduttore", icon: "📝", color: "bg-emerald-500", formType: "incarico-locazione" },
      { id: "cl-aff-st", name: "Incarico Stagionale", desc: "Impegnativa locazione a uso transitorio/stagionale", icon: "🏖️", color: "bg-amber-500", formType: "incarico-stagionale" },
    ],
    vendita: [
      { id: "cl-ven-fv", name: "Foglio di Visita", desc: "Verbale di visita immobiliare per acquisto", icon: "📋", color: "bg-blue-500", formType: "foglio-visita" },
      { id: "cl-ven-ia", name: "Incarico Per Acquisto", desc: "Impegnativa d'acquisto immobile", icon: "📝", color: "bg-emerald-500", formType: "incarico-acquisto" },
    ],
  },
  proprietari: {
    affitto: [
      { id: "pr-aff-il", name: "Incarico Locazione", desc: "Mandato di locazione per il proprietario", icon: "📋", color: "bg-blue-500", formType: "incarico-locazione" },
    ],
    vendita: [
      { id: "pr-ven-ie", name: "Incarico d'Esclusiva", desc: "Mandato esclusivo di vendita/affitto", icon: "⭐", color: "bg-amber-500", formType: "incarico-esclusiva" },
    ],
  },
};

export default function DocumentiPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreator, setShowCreator] = useState(false);
  const [documents, setDocuments] = useState<DocumentoTemplate[]>([]);
  const [generatedDocs, setGeneratedDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingGen, setLoadingGen] = useState(true);
  
  // Upload states
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newDocTitolo, setNewDocTitolo] = useState("");
  const [newDocCategoria, setNewDocCategoria] = useState("Modello Generico");

  // Compile states
  const [showCompiler, setShowCompiler] = useState(false);
  const [docToCompile, setDocToCompile] = useState<DocumentoTemplate | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  const [personResults, setPersonResults] = useState<any[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [immSearch, setImmSearch] = useState("");
  const [immResults, setImmResults] = useState<any[]>([]);
  const [selectedImmobile, setSelectedImmobile] = useState<any>(null);
  const [isCompiling, setIsCompiling] = useState(false);

  // Tab navigation for contract generator
  const [mainTab, setMainTab] = useState<"clienti" | "proprietari">("clienti");
  const [subTab, setSubTab] = useState<string>("affitto");
  // Toast
  const [toast, setToast] = useState<string | null>(null);

  // Active form overlay
  const [activeForm, setActiveForm] = useState<FormType | null>(null);
  // Saved form data for "Edit" mode (restores all fields + signatures)
  const [editFormData, setEditFormData] = useState<Record<string, unknown> | null>(null);
  // Increments on every open so the same form type always remounts fresh
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  // Reset sub-tab when main tab changes
  useEffect(() => {
    setSubTab("affitto");
  }, [mainTab]);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/documenti');
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching docs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGeneratedDocs = useCallback(async () => {
    setLoadingGen(true);
    try {
      const res = await fetch('/api/documenti-generati');
      const data = await res.json();
      setGeneratedDocs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching generated docs:", error);
    } finally {
      setLoadingGen(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchGeneratedDocs();
  }, [fetchDocuments, fetchGeneratedDocs]);

  // When a form closes, refresh generated docs and clear edit state
  const handleFormClose = useCallback(() => {
    setActiveForm(null);
    setEditFormData(null);
    fetchGeneratedDocs();
  }, [fetchGeneratedDocs]);

  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const search = `${doc.titolo} ${doc.categoria}`.toLowerCase();
      return search.includes(searchTerm.toLowerCase());
    }).sort((a, b) => String(b.dataCreazione || "").localeCompare(String(a.dataCreazione || "")));
  }, [documents, searchTerm]);

  // Dynamically filter Generated Docs strictly based on creation context
  const filteredGeneratedDocs = useMemo(() => {
    return generatedDocs.filter((doc) => {
      // 1. Strict contextual filtering (only show docs generated in this exact tab combination)
      // For retro-compatibility with older test docs, if 'sezione' is missing we can hide them 
      // or implement fallback. The user requested strict mirroring, so strict equality is applied:
      if (doc.sezione !== mainTab || doc.azione !== subTab) {
        return false;
      }

      // 2. Filter by search query
      const txt = `${doc.nomeFile || ''} ${doc.categoria || ''} ${doc.clienteNome || ''}`.toLowerCase();
      if (searchTerm && !txt.includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      return true;
    }).sort((a, b) => String(b.dataCreazione || "").localeCompare(String(a.dataCreazione || "")));
  }, [generatedDocs, searchTerm, mainTab, subTab]);

  const searchPeople = async (q: string) => {
    setPersonSearch(q);
    if (q.length < 2) { setPersonResults([]); return; }
    const res = await fetch(`/api/clienti?q=${encodeURIComponent(q)}&limit=5`);
    const data = await res.json();
    setPersonResults(Array.isArray(data) ? data : []);
  };

  const searchImmobili = async (q: string) => {
    setImmSearch(q);
    if (q.length < 2) { setImmResults([]); return; }
    const res = await fetch(`/api/immobili?q=${encodeURIComponent(q)}&limit=5`);
    const data = await res.json();
    setImmResults(Array.isArray(data) ? data : []);
  };

  const handleCompile = async () => {
    if (!docToCompile) return;
    setIsCompiling(true);
    try {
      const { compileSmartDocument } = await import('@/lib/pdfUtils');
      const pdfBytes = await compileSmartDocument(docToCompile.url, selectedCliente, selectedImmobile);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Compilato_${docToCompile.titolo.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setShowCompiler(false);
      setSelectedCliente(null);
      setSelectedImmobile(null);
      setPersonSearch("");
      setImmSearch("");
    } catch (error) {
      console.error(error);
      alert("Errore durante la compilazione del documento.");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    
    if (!newDocTitolo.trim()) {
      alert("Inserisci prima il Titolo del documento obbligatorio.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      formData.append("path", `templates/${Date.now()}_${safeName}`);

      const resUpload = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const dataUpload = await resUpload.json();

      if (resUpload.ok && dataUpload.url) {
        const docData: DocumentoTemplate = {
          titolo: newDocTitolo.trim(),
          categoria: newDocCategoria,
          url: dataUpload.url,
          dataCreazione: new Date().toISOString(),
          fileName: file.name,
          size: file.size
        };

        const resDb = await fetch('/api/documenti', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(docData)
        });

        if (resDb.ok) {
          await fetchDocuments();
          setShowCreator(false);
          setNewDocTitolo("");
          setNewDocCategoria("Modello Generico");
        } else {
          alert("Errore salvataggio database.");
        }
      } else {
        alert("Errore caricamento Storage: " + dataUpload.error);
      }
    } catch (err) {
      console.error(err);
      alert("Errore caricamento. Riprova.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: DocumentoTemplate) => {
    if (!confirm("Sei sicuro di voler eliminare questo documento definitivamente? Verrà rimosso l'accesso pubblico a questo Link.")) return;
    
    try {
      const resDb = await fetch(`/api/documenti?id=${doc.id}`, { method: 'DELETE' });
      if (!resDb.ok) throw new Error("Errore database");
      
      await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: doc.url })
      });

      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      console.error(err);
      alert("Errore durante l'eliminazione.");
    }
  };

  // Current templates based on tab selection
  const currentTemplates = DOC_TEMPLATES[mainTab]?.[subTab] || [];
  const subTabOptions = mainTab === "clienti" ? ["affitto", "vendita"] : ["affitto", "vendita"];
  const subTabLabels: Record<string, string> = { affitto: "Affitto", vendita: "Vendita" };

  return (
    <div className="space-y-10">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[100] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-2 bg-indigo-600 text-white animate-in slide-in-from-right-5 fade-in duration-300">
          <Sparkles className="h-4 w-4" /> {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-foreground">Documenti & Contratti</h2>
          <p className="text-muted-foreground mt-1 text-base font-medium">
            Genera contratti, gestisci archivi e moduli in Cloud.
          </p>
        </div>
        <button 
          onClick={() => setShowCreator(true)}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 shadow-lg shadow-primary/25"
        >
          <Plus className="mr-2 h-4 w-4" />
          Carica Documento
        </button>
      </div>

      {/* ═══ CONTRACT GENERATOR ═══ */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Section Header */}
        <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-indigo-50/80 to-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">Generatore Contratti</h3>
              <p className="text-xs text-slate-400 font-bold">Seleziona destinatario e tipo di documento</p>
            </div>
          </div>
        </div>

        {/* Main Tabs: Clienti / Proprietari */}
        <div className="px-6 pt-4 flex gap-2">
          <button
            onClick={() => setMainTab("clienti")}
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-all",
              mainTab === "clienti"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <Users className="h-4 w-4" /> Clienti
          </button>
          <button
            onClick={() => setMainTab("proprietari")}
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-all",
              mainTab === "proprietari"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <Building2 className="h-4 w-4" /> Proprietari
          </button>
        </div>

        {/* Sub-Tabs: Affitto / Compra|Vendita */}
        <div className="px-6 pt-3 pb-1 flex gap-1">
          {subTabOptions.map(st => (
            <button
              key={st}
              onClick={() => setSubTab(st)}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                subTab === st
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              {subTabLabels[st]}
            </button>
          ))}
        </div>

        {/* Template Cards Grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {currentTemplates.map(tmpl => (
            <div
              key={tmpl.id}
              className="group relative bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden"
            >
              {/* Glow */}
              <div className={cn("absolute top-0 right-0 w-20 h-20 blur-3xl opacity-10 -translate-y-1/2 translate-x-1/2", tmpl.color)} />

              {/* Icon */}
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white mb-4 shadow-lg text-xl", tmpl.color)}>
                {tmpl.icon}
              </div>

              {/* Title & Desc */}
              <h4 className="font-black text-base text-slate-800 leading-tight">{tmpl.name}</h4>
              <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2 font-medium">{tmpl.desc}</p>

              {/* Generate Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFormKey(k => k + 1);
                  setActiveForm(tmpl.formType);
                }}
                className="mt-4 w-full py-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-black uppercase tracking-wider hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" /> Genera Documento
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ GENERATED DOCUMENTS TABLE ═══ */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            📄 Documenti Generati {loadingGen && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            {filteredGeneratedDocs.length > 0 && <span className="ml-2 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-black">{filteredGeneratedDocs.length}</span>}
          </h3>
          <div className="relative w-full sm:w-80 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Cerca per titolo o categoria..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-border">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Documento / Categoria</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Data e Size</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGeneratedDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500 shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 line-clamp-1">{doc.nomeFile || "Senza Titolo"}</p>
                          <p className="text-xs text-muted-foreground italic truncate max-w-[200px]">{doc.categoria || "Generico"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className="text-sm font-medium text-slate-600 line-clamp-1">{doc.clienteNome || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex flex-col gap-0.5">
                         <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" /> {doc.dataCreazione ? new Date(doc.dataCreazione).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                         {doc.size && <span className="text-xs text-slate-500">{(doc.size / 1024).toFixed(0)} KB</span>}
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex items-center justify-end gap-2">
                          <a href={doc.urlDownload} target="_blank" rel="noopener noreferrer" className="h-9 px-3 inline-flex items-center justify-center rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors text-emerald-600 border border-emerald-200 gap-1.5 text-xs font-bold" title="Scarica PDF">
                            <Download className="h-3.5 w-3.5" /> Scarica
                          </a>
                          <a href={doc.urlDownload} target="_blank" rel="noopener noreferrer" className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-blue-600 border border-transparent hover:border-blue-200" title="Apri in nuova scheda">
                            <Eye className="h-4 w-4" />
                          </a>
                          {doc.formData && doc.categoria && (
                            <button
                              onClick={() => {
                                const formTypeMap: Record<string, FormType> = {
                                  'Foglio di Visita': 'foglio-visita',
                                  'Incarico Locazione': 'incarico-locazione',
                                  'Incarico Stagionale': 'incarico-stagionale',
                                  'Incarico Per Acquisto': 'incarico-acquisto',
                                  "Incarico d'Esclusiva": 'incarico-esclusiva',
                                };
                                const ft = formTypeMap[doc.categoria as string];
                                if (ft) {
                                  setFormKey(k => k + 1);
                                  setEditFormData(doc.formData as Record<string, unknown>);
                                  setActiveForm(ft);
                                }
                              }}
                              className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-indigo-50 transition-colors text-slate-400 hover:text-indigo-600 border border-transparent hover:border-indigo-200"
                              title="Riapri e modifica"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          <button onClick={async () => {
                            if (!confirm('Sei sicuro di voler eliminare questo documento?')) return;
                            try {
                              await fetch(`/api/documenti-generati?id=${doc.id}`, { method: 'DELETE' });
                              await fetch('/api/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: doc.urlDownload }) });
                              setGeneratedDocs(prev => prev.filter(d => d.id !== doc.id));
                              setToast('🗑️ Documento eliminato');
                            } catch { setToast('❌ Errore eliminazione'); }
                          }} className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-rose-50 transition-colors text-slate-400 hover:text-rose-500 border border-transparent hover:border-rose-200" title="Elimina">
                            <Trash2 className="h-4 w-4" />
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredGeneratedDocs.length === 0 && !loadingGen && (
               <div className="p-12 text-center">
                 <FileText className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                 <p className="text-slate-500 font-medium">Nessun documento in questa sezione.</p>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ TEMPLATE FILES TABLE ═══ */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <h3 className="text-xl font-bold flex items-center gap-2">📁 Archivio Modelli {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}</h3>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-border">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Documento / Categoria</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">File Name</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Data e Size</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 line-clamp-1">{doc.titolo || "Senza Titolo"}</p>
                          <p className="text-xs text-muted-foreground italic truncate max-w-[200px]">{doc.categoria || "Generico"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className="text-sm font-medium text-slate-600 line-clamp-1 max-w-[200px]">{doc.fileName || "N/A"}</span>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex flex-col gap-0.5">
                         <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" /> {new Date(doc.dataCreazione).toLocaleDateString()}</span>
                         {doc.size && <span className="text-xs text-slate-500">{(doc.size / 1024 / 1024).toFixed(2)} MB</span>}
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setDocToCompile(doc); setShowCreator(false); setShowCompiler(true); }} className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-indigo-50 transition-colors text-indigo-400 hover:text-indigo-600 border border-transparent hover:border-indigo-200" title="🪄 Compila Smart">
                            <Wand2 className="h-4 w-4" />
                          </button>
                          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-blue-600 border border-transparent hover:border-blue-200" title="Apri / Scarica">
                            <Eye className="h-4 w-4" />
                          </a>
                          <button onClick={() => handleDelete(doc)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-rose-50 transition-colors text-slate-400 hover:text-rose-500 border border-transparent hover:border-rose-200" title="Elimina defintivamente">
                            <Trash2 className="h-4 w-4" />
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredDocs.length === 0 && !loading && (
               <div className="p-12 text-center">
                 <FileText className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                 <p className="text-slate-500 font-medium">Nessun modello caricato.</p>
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload / Create Modal */}
      {showCreator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-border flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" /> Carica File Master
              </h3>
              <button 
                onClick={() => { setShowCreator(false); setNewDocTitolo(""); setNewDocCategoria("Modello Generico"); }}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors"
                disabled={uploading}
              >
                <Plus className="h-5 w-5 rotate-45" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                 <div className="col-span-2 space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Titolo Documento *</label>
                    <input type="text" value={newDocTitolo} onChange={e => setNewDocTitolo(e.target.value)} placeholder="es. Incarico Vendita (PDF Bianco)" className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:outline-none focus:border-primary font-medium" />
                 </div>
                 <div className="col-span-2 space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Categoria</label>
                    <select value={newDocCategoria} onChange={e => setNewDocCategoria(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:outline-none focus:border-primary font-medium bg-white">
                      <option value="Modello Generico">Modello Generico</option>
                      <option value="Incarico Vendita">Incarico Vendita</option>
                      <option value="Foglio di Visita">Foglio di Visita</option>
                      <option value="Modulo Privacy">Modulo Privacy</option>
                      <option value="Contratti Locazione">Contratti Locazione</option>
                      <option value="Stagionale">Stagionale</option>
                      <option value="Altro">Altro (Es. Planimetrie Standard)</option>
                    </select>
                 </div>
              </div>

              {/* Drop Zone */}
              <div
                 onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/5'); }}
                 onDragLeave={e => { e.currentTarget.classList.remove('border-primary', 'bg-primary/5'); }}
                 onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-primary', 'bg-primary/5'); handleFileUpload(e.dataTransfer.files); }}
                 onClick={() => !uploading && fileInputRef.current?.click()}
                 className={cn(
                   "mt-4 p-8 rounded-2xl border-2 border-dashed text-center transition-all",
                   uploading ? "border-slate-300 bg-slate-50 cursor-not-allowed opacity-75" : "border-slate-300 bg-white cursor-pointer hover:border-primary hover:bg-primary/5"
                 )}
              >
                 <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.png" className="hidden" onChange={e => handleFileUpload(e.target.files)} disabled={uploading} />
                 {uploading ? (
                   <div className="flex flex-col items-center">
                     <Loader2 className="h-10 w-10 text-primary animate-spin mb-3" />
                     <p className="font-bold text-primary">Caricamento in corso...</p>
                     <p className="text-xs text-slate-500 mt-1">Attendere prego, stiamo salvando in Cloud...</p>
                   </div>
                 ) : (
                   <div className="flex flex-col items-center">
                     <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                       <Upload className="h-6 w-6" />
                     </div>
                     <p className="font-bold text-slate-700">Trascina qui il file (PDF, Image) o clicca</p>
                     <p className="text-xs text-rose-500 mt-1">Devi inserire prima il Titolo obbligatorio.</p>
                   </div>
                 )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compile Smart Document Modal */}
      {showCompiler && docToCompile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-border flex justify-between items-center bg-indigo-50">
              <h3 className="text-xl font-bold flex items-center gap-2 text-indigo-900">
                <Wand2 className="h-5 w-5 text-indigo-600" /> Compila Smart Document
              </h3>
              <button 
                onClick={() => setShowCompiler(false)} 
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-indigo-100 transition-colors text-indigo-600"
              >
                <Plus className="h-5 w-5 rotate-45" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-sm font-bold text-slate-700">Template selezionato:</p>
                <p className="text-lg font-black text-indigo-600 mt-1">{docToCompile.titolo}</p>
              </div>
              
              <div className="relative">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Seleziona Cliente</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium shadow-sm leading-normal"
                    placeholder="Cerca cliente per nome..."
                    value={personSearch}
                    onChange={(e) => searchPeople(e.target.value)}
                    disabled={!!selectedCliente}
                    style={{ lineHeight: "normal", color: selectedCliente ? "#1e1b4b" : "inherit" }}
                  />
                  {selectedCliente && (
                    <button onClick={() => { setSelectedCliente(null); setPersonSearch(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-500 hover:bg-rose-50 rounded-full p-1 transition-all">
                      <Plus className="h-4 w-4 rotate-45" />
                    </button>
                  )}
                </div>
                {personResults.length > 0 && !selectedCliente && (
                  <div className="mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto absolute z-20 w-full">
                    {personResults.map((p: any) => (
                      <button 
                        key={p.id} 
                        onClick={() => { 
                          setSelectedCliente(p); 
                          setPersonSearch(`${p.DatiPersonali?.Nome || p.nome} ${p.DatiPersonali?.Cognome || p.cognome}`); 
                          setPersonResults([]); 
                        }} 
                        className="w-full text-left px-4 py-3 hover:bg-indigo-50 text-sm flex items-center gap-3 border-b border-border last:border-0 transition-colors"
                      >
                         <User className="h-4 w-4 text-slate-300" />
                         <span className="font-bold text-slate-800">{p.DatiPersonali?.Nome || p.nome} {p.DatiPersonali?.Cognome || p.cognome}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Seleziona Immobile</label>
                <div className="relative">
                  <HomeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium shadow-sm leading-normal"
                    placeholder="Cerca immobile..."
                    value={immSearch}
                    onChange={(e) => searchImmobili(e.target.value)}
                    disabled={!!selectedImmobile}
                    style={{ lineHeight: "normal", color: selectedImmobile ? "#1e1b4b" : "inherit" }}
                  />
                  {selectedImmobile && (
                    <button onClick={() => { setSelectedImmobile(null); setImmSearch(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-500 hover:bg-rose-50 rounded-full p-1 transition-all">
                      <Plus className="h-4 w-4 rotate-45" />
                    </button>
                  )}
                </div>
                {immResults.length > 0 && !selectedImmobile && (
                  <div className="mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto absolute z-20 w-full">
                    {immResults.map((i: any) => (
                      <button 
                        key={i.id} 
                        onClick={() => { 
                          setSelectedImmobile(i); 
                          setImmSearch(i.DatiBase?.Indirizzo || i.titolo || `RIF: ${i.DatiBase?.Codice || i.rif}`); 
                          setImmResults([]); 
                        }} 
                        className="w-full text-left px-4 py-3 hover:bg-indigo-50 text-sm flex items-center gap-3 border-b border-border last:border-0 transition-colors"
                      >
                         <HomeIcon className="h-4 w-4 text-slate-300 shrink-0" />
                         <span className="font-bold text-slate-800 truncate">{i.DatiBase?.Indirizzo || i.titolo}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="px-8 py-6 bg-slate-50 border-t border-border flex gap-3">
              <button 
                onClick={() => setShowCompiler(false)} 
                className="flex-1 px-4 py-3 rounded-xl border border-border bg-white font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                disabled={isCompiling}
              >
                Annulla
              </button>
              <button 
                onClick={handleCompile} 
                disabled={isCompiling || !selectedCliente || !selectedImmobile} 
                className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/25 hover:opacity-90 transition-all disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isCompiling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Genera PDF Compilato
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ FORM OVERLAYS — key=formKey forces fresh mount on every open ═══ */}
      {activeForm === 'foglio-visita' && <FoglioVisitaForm key={formKey} onClose={handleFormClose} sezione={mainTab} azione={subTab} initialData={editFormData as any ?? undefined} />}
      {activeForm === 'incarico-locazione' && <IncaricoLocazioneForm key={formKey} onClose={handleFormClose} sezione={mainTab} azione={subTab} initialData={editFormData as any ?? undefined} />}
      {activeForm === 'incarico-stagionale' && <IncaricoStagionaleForm key={formKey} onClose={handleFormClose} sezione={mainTab} azione={subTab} initialData={editFormData as any ?? undefined} />}
      {activeForm === 'incarico-acquisto' && <IncaricoAcquistoForm key={formKey} onClose={handleFormClose} sezione={mainTab} azione={subTab} initialData={editFormData as any ?? undefined} />}
      {activeForm === 'incarico-esclusiva' && <IncaricoEsclusivaForm key={formKey} onClose={handleFormClose} sezione={mainTab} azione={subTab} initialData={editFormData as any ?? undefined} />}
    </div>
  );
}
