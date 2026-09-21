"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { urlDeDescarga } from '@/lib/storage-urls';
import { aMilisegundos } from '@/lib/fecha-ms';
import { urlDelSitio } from '@/lib/site-url';
import { esFuenteLocal } from "@/lib/image-optimizable";
import NextImage from "next/image";
import {
  Search, User, Phone, Mail, Plus, Briefcase, MapPin, Home,
  CheckCircle2, Save, Trash2, X, FileSignature, Zap,
  ThumbsUp, ThumbsDown, Loader2, Hash, Printer, Upload, Eye,
  ChevronDown, ChevronUp, MessageCircle, ExternalLink, BarChart3,
  BedDouble, Maximize2, Euro, Tag
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import SignaturePad from "@/components/ui/SignaturePad";
import { Cliente, generateEmptyCliente, TIPOLOGIE_IMMOBILE, ZONE_AGENCIA, STATI_FINITURE, PIANI_PREFERENZA, ARREDAMENTO_OPZIONI, CARATTERISTICHE_LABELS } from "@/types/cliente";
import { hydrateCliente } from "@/lib/hydrate-cliente";
import { useClienti } from "@/hooks/useClienti";
import { useDebounce } from "@/hooks/useDebounce";
import { useDialog } from "@/hooks/useDialog";
import { useConfirm } from "@/contexts/ConfirmDialog";

export default function ClientiPage() {
  const confirm = useConfirm();
  const [isClient, setIsClient] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterVendita, setFilterVendita] = useState(false);
  const [filterAffitto, setFilterAffitto] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [activeTab, setActiveTab] = useState<"profilo" | "ricerca" | "matching" | "documenti" | "firma">("profilo");
  const [saving, setSaving] = useState(false);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchPage, setMatchPage] = useState(0);
  const [matchTotal, setMatchTotal] = useState(0);
  const [matchHasMore, setMatchHasMore] = useState(false);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [matchLoadingMore, setMatchLoadingMore] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SWR-powered data fetching.
  // When only one filter is active push it server-side to reduce payload;
  // when both or neither are active load all and filter client-side.
  const serverTipo = filterVendita && !filterAffitto ? 'vendita'
    : filterAffitto && !filterVendita ? 'affitto'
    : null;
  const { clienti: clientiData, loading, refresh: refreshClienti } = useClienti({ tipo: serverTipo });

  useEffect(() => { setIsClient(true); }, []);

  // B4: Dynamic page title
  useEffect(() => {
    if (isModalOpen && selectedCliente) {
      const nome = selectedCliente.DatiPersonali?.Nome?.trim() || '';
      const cognome = selectedCliente.DatiPersonali?.Cognome?.trim() || '';
      const label = [nome, cognome].filter(Boolean).join(' ') || 'Nuovo Cliente';
      document.title = `${label} — Clienti | Pantaleo CRM`;
    } else {
      document.title = 'Clienti | Pantaleo CRM';
    }
    return () => { document.title = 'Pantaleo CRM'; };
  }, [isModalOpen, selectedCliente?.DatiPersonali?.Nome, selectedCliente?.DatiPersonali?.Cognome]);

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

  // Auto-open new client modal from URL param (?new=true) or specific client (?id=XXX)
  useEffect(() => {
    if (typeof window !== "undefined" && clientiData.length > 0) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("new") === "true") {
        setTimeout(() => {
          handleOpenModal();
          window.history.replaceState({}, "", "/clienti");
        }, 500);
      } else if (params.get("id")) {
        const targetId = params.get("id");
        const found = clientiData.find((c: any) => c.id === targetId);
        if (found) {
          setTimeout(() => {
            handleOpenModal(found);
            window.history.replaceState({}, "", "/clienti");
          }, 300);
        }
      }
    }
  }, [clientiData]);

  // Throws a human-readable error when the session expires mid-session.
  // Middleware redirects to /login (HTML), fetch follows it, and res.json() on HTML
  // throws "Unexpected end of JSON input". This helper catches that case first.
  const safeJson = async (res: Response) => {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Sessione scaduta. Aggiorna la pagina e accedi di nuovo.');
    }
    if (res.status >= 500) {
      throw new Error('Errore del server. Riprova tra qualche secondo o contatta l\'amministratore.');
    }
    if (res.redirected || !res.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Sessione scaduta. Aggiorna la pagina e accedi di nuovo.');
    }
    return res.json();
  };

  const handleSaveCliente = async () => {
    if (!selectedCliente) return;
    // A4 — Validazione minima: almeno nome o cognome obbligatorio
    const nome = selectedCliente.DatiPersonali?.Nome?.trim();
    const cognome = selectedCliente.DatiPersonali?.Cognome?.trim();
    if (!nome && !cognome) {
      alert('⚠️ Inserisci almeno il Nome o il Cognome del cliente prima di salvare.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/clienti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selectedCliente) });
      const result = await safeJson(res);
      if (result.success) {
        if (!selectedCliente.id) setSelectedCliente(prev => prev ? { ...prev, id: result.id } : prev);
        await refreshClienti();
        alert('\u2705 Cliente salvato!');
      } else {
        alert('\u274c ' + (result.error || 'Errore'));
      }
    } catch (e: any) {
      alert('\u274c ' + e.message);
    } finally {
      setSaving(false); // A3 — garantizado incluso si hay excepción inesperada
    }
  };

  const handleDeleteCliente = async () => {
    if (!selectedCliente?.id) return;
    const ok = await confirm({
      title: 'Eliminare il cliente?',
      // El CRM tiene un candado que impide borrar un cliente con documentos
      // generados asociados (api/clienti DELETE, 409). Ese candado compara
      // `clienteId`, y NINGUN formulario de documentos lo escribe: los 320
      // documentos guardados tienen el campo vacio, asi que el candado no ha
      // saltado nunca y no va a saltar. Vincularlos exigiria un selector de
      // cliente en los cinco formularios, que es un cambio de producto.
      //
      // Mientras tanto el aviso dice la verdad, en vez de dejar creer que
      // alguien esta comprobando algo.
      message: 'Il cliente verr\u00e0 eliminato definitivamente dal CRM. L\'azione non pu\u00f2 essere annullata. Attenzione: eventuali fogli di visita o incarichi gi\u00e0 firmati NON verranno eliminati e resteranno nella sezione Documenti, intestati al nome scritto a mano.',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/clienti?id=${selectedCliente.id}`, { method: 'DELETE' });
      const result = await safeJson(res);
      if (result.success) { setIsModalOpen(false); setSelectedCliente(null); await refreshClienti(); }
      else { alert('\u274c ' + result.error); }
    } catch (e: any) { alert('\u274c ' + e.message); }
  };

  const runMatching = async (page = 0) => {
    if (!selectedCliente) return;
    if (page === 0) { setMatchLoading(true); setMatchResults([]); }
    else { setMatchLoadingMore(true); }
    try {
      const bl = selectedCliente.Matching?.ListaNera || [];
      const propostiIds = (selectedCliente.Matching?.Proposti || []).map((p: any) => p.immobileId);
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          richiesta: selectedCliente.Richiesta,
          page,
          pageSize: 10,
          listaNera: bl,
          propostiIds,
        }),
      });
      const json = await safeJson(res);
      if (page === 0) {
        setMatchResults(json.matches || []);
      } else {
        setMatchResults(prev => [...prev, ...(json.matches || [])]);
      }
      setMatchTotal(json.total || 0);
      setMatchHasMore(json.hasMore || false);
      setMatchPage(page);
    } catch (e: any) { alert('Errore: ' + e.message); }
    setMatchLoading(false);
    setMatchLoadingMore(false);
  };

  const loadMoreMatches = () => {
    runMatching(matchPage + 1);
  };

  /** WhatsApp Smart Proposal — genera mensaje profesional y abre wa.me */
  const handleWhatsAppProposal = (match: any) => {
    if (!selectedCliente) return;

    // 1. Limpiar y validar teléfono
    let phone = (selectedCliente.DatiPersonali?.Telefono || '').replace(/[\s\-\.\(\)]/g, '');
    if (!phone) {
      alert('⚠️ Questo cliente non ha un numero di telefono registrato. Aggiungi il numero nella scheda "Dati Personali" prima di inviare una proposta.');
      return;
    }
    if (!phone.startsWith('+')) phone = '+39' + phone;
    const waNumber = phone.replace('+', '');

    // 2. Costruire dati del messaggio
    const clienteNome = selectedCliente.DatiPersonali?.Nome || 'Cliente';
    const codice      = match.codice || match.immobileId || '';
    const tipologia   = match.snippet?.tipologia || 'immobile';
    const zona        = match.snippet?.zona || match.snippet?.citta || '';
    const citta       = match.snippet?.citta || '';
    const localita    = zona || citta;
    const pct         = match.matchPercentage || 0;

    // Prezzi
    const isVendita   = match.snippet?.isVendita ?? true;
    const rawPrezzo   = Number(match.snippet?.prezzo || 0);
    const prezzoStr   = rawPrezzo > 0
      ? `€${rawPrezzo.toLocaleString('it-IT')}${isVendita ? '' : '/mese'}`
      : 'Su richiesta';

    // Dati fisici
    const mq      = match.snippet?.mq || 0;
    const camere  = match.snippet?.camere || 0;
    const bagni   = match.snippet?.bagni || 0;

    // Estratto descrizione (max 100 chars)
    const descrizioneFull = match.snippet?.descrizione || match.descrizione || '';
    const descrizioneExt  = descrizioneFull.length > 100
      ? descrizioneFull.slice(0, 100).trimEnd() + '...'
      : descrizioneFull;

    // Link pubblico all'immobile
    // El dominio ya no se escribe aqui: ver lib/site-url.ts. Estaba a mano y
    // ademas leia una variable de entorno que NO es la que hay configurada en
    // Vercel, asi que cada cambio de dominio dejaba a los clientes recibiendo
    // por WhatsApp un enlace a un sitio que ya no existia.
    const siteUrl   = urlDelSitio();
    const propLink  = codice ? `${siteUrl}/immobili?codice=${codice}` : siteUrl;

    // 3. Costruire messaggio — solo testo ASCII puro (niente emoji, niente simboli)
    const dettagli = [
      mq > 0     ? `Superficie: ${mq} mq` : '',
      camere > 0 ? `Camere: ${camere}`    : '',
      bagni > 0  ? `Bagni: ${bagni}`      : '',
    ].filter(Boolean).join(' - ');

    const lines = [
      `Immobiliare Pantaleo | Nuova Proposta!`,
      `${tipologia}${localita ? ' in ' + localita : ''}`,
      `Prezzo: ${prezzoStr}${dettagli ? ' - ' + dettagli : ''}`,
      `Rif: ${codice}`,
      descrizioneExt ? descrizioneExt : '',
      `Contattaci per maggiori informazioni!`,
    ].filter(Boolean);

    // Sanitizza tutto il messaggio: rimuovi caratteri fuori ASCII 32-126
    const cleanMsg = lines.join('\n').replace(/[^\x20-\x7E\n]/g, '');
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(cleanMsg)}`;
    window.open(url, '_blank');
  };

  const handleScarta = async (immobileId: string) => {
    if (!selectedCliente) return;
    const snapshot = selectedCliente; // guardar estado previo para revertir si falla
    const newBL = [...(snapshot.Matching?.ListaNera || []), immobileId];
    const updated = { ...snapshot, Matching: { ...snapshot.Matching, ListaNera: newBL } };
    setSelectedCliente(updated);
    setMatchResults(prev => prev.filter(p => p.id !== immobileId));
    if (snapshot.id) {
      try {
        // Delta atómico (arrayUnion server-side) — evita la race del array completo.
        const res = await fetch('/api/clienti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: snapshot.id, MatchingOps: { addListaNera: [immobileId] } }) });
        await safeJson(res);
      } catch (e: any) {
        setSelectedCliente(snapshot); // A2 — revertir UI si Firestore falla
        alert('\u26a0\ufe0f Errore nel salvare la lista nera: ' + e.message);
      }
    }
  };
  const handleProponi = async (property: any) => {
    if (!selectedCliente) return;
    const snapshot = selectedCliente;
    const item = { immobileId: property.id, codice: property.DatiBase?.Codice||'', dataProposta: new Date().toISOString().split('T')[0], esito: 'In Attesa' as const, note: '' };
    const newP = [...(snapshot.Matching?.Proposti || []), item].slice(-50);
    const updated = { ...snapshot, Matching: { ...snapshot.Matching, Proposti: newP } };
    setSelectedCliente(updated);
    setMatchResults(prev => prev.filter(p => p.id !== property.id));
    if (snapshot.id) {
      try {
        // Delta atómico (arrayUnion server-side) — evita la race del array completo.
        const res = await fetch('/api/clienti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: snapshot.id, MatchingOps: { addProposti: [item] } }) });
        await safeJson(res);
      } catch (e: any) {
        setSelectedCliente(snapshot); // A2 — revertir UI si Firestore falla
        alert('\u26a0\ufe0f Errore nel salvare la proposta: ' + e.message);
      }
    }
  };

  const handleManualAdd = async () => {
    if (!manualCode.trim() || !selectedCliente) return;
    setManualLoading(true);
    try {
      const res = await fetch(`/api/clienti?codice=${manualCode.trim()}`);
      if (!res.ok) { alert('\u274c Immobile non trovato: ' + manualCode); setManualLoading(false); return; }
      const property = await res.json();
      await handleProponi(property);
      setManualCode('');
    } catch (e: any) { alert('\u274c ' + e.message); }
    setManualLoading(false);
  };

  // Debounced search — input updates instantly, useMemo waits 300ms
  const debouncedSearch = useDebounce(searchTerm, 300);

  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const filteredClienti = useMemo(() => {
    const q = normalize(debouncedSearch);
    let result = clientiData.filter((c) => {
      const dp = c.DatiPersonali || {} as any;
      const matchSearch = normalize(`${dp.Nome||''} ${dp.Cognome||''} ${dp.Telefono||''} ${dp.Email||''}`).includes(q);
      if (!matchSearch) return false;

      if (filterVendita && !filterAffitto) {
        if (!c.Richiesta?.Operazione?.Vendita) return false;
      } else if (filterAffitto && !filterVendita) {
        if (!c.Richiesta?.Operazione?.Affitto) return false;
      } else if (filterVendita && filterAffitto) {
        if (!c.Richiesta?.Operazione?.Vendita && !c.Richiesta?.Operazione?.Affitto) return false;
      }

      return true;
    });

    // `new Date(x)` no entiende un Timestamp de Firestore: devolvia NaN, que
    // al caer a 0 hacia empatar a TODOS los clientes y dejaba el orden al
    // azar. Por eso los dados de alta esta semana aparecian en la posicion
    // 272 y habia que pulsar «Carica altri» nueve veces para verlos.
    result.sort((a, b) => aMilisegundos(b.createdAt) - aMilisegundos(a.createdAt));

    return result;
  }, [debouncedSearch, clientiData, filterVendita, filterAffitto]);

  // ═══ DOCUMENT UPLOAD ═══
  const handleDocUpload = async (files: FileList | null) => {
    if (!files || !selectedCliente?.id) { alert('Salva il cliente prima di caricare documenti.'); return; }
    setDocUploading(true);
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('path', `clienti/${selectedCliente.id}/documenti/${Date.now()}_${file.name}`);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.url) newUrls.push(json.url);
      } catch (e: any) { console.error(e); }
    }
    if (newUrls.length > 0) {
      const allDocs = [...(selectedCliente.Documentazione?.AltriDocumenti || []), ...newUrls];
      const updated = { ...selectedCliente, Documentazione: { ...selectedCliente.Documentazione, AltriDocumenti: allDocs } };
      setSelectedCliente(updated);
      await fetch('/api/clienti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedCliente.id, Documentazione: updated.Documentazione }) });
    }
    setDocUploading(false);
  };

  const handleDocDelete = async (url: string) => {
    if (!selectedCliente?.id) return;
    const ok = await confirm({
      title: 'Eliminare il documento?',
      message: 'Il file verrà rimosso definitivamente.',
      danger: true,
    });
    if (!ok) return;
    try {
      await fetch('/api/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const allDocs = (selectedCliente.Documentazione?.AltriDocumenti || []).filter((u: string) => u !== url);
      const updated = { ...selectedCliente, Documentazione: { ...selectedCliente.Documentazione, AltriDocumenti: allDocs } };
      setSelectedCliente(updated);
      await fetch('/api/clienti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedCliente.id, Documentazione: updated.Documentazione }) });
    } catch (e: any) { alert('Errore: ' + e.message); }
  };

  // ═══ PDF ═══
  const handlePrintPDF = async () => {
    if (!selectedCliente) return;
    const { generateSchedaIncarico } = await import('@/lib/generatePDF');
    generateSchedaIncarico(selectedCliente);
  };

  const handleOpenModal = async (cliente?: Cliente) => {
    if (cliente?.id) {
      // Imposta subito il cliente parziale per aprire il modal istantaneamente.
      // hydrateCliente garantisce la FORMA completa: l'oggetto della lista è
      // proiettato (senza FirmaDigitale né Documentazione) e i documenti legacy
      // non hanno nemmeno DatiPersonali/Richiesta. Senza questo, qualunque
      // accesso annidato nel render fa crashare il modal.
      setSelectedCliente(hydrateCliente(cliente));
      setIsModalOpen(true);
      setActiveTab("profilo");
      setMatchResults([]);

      try {
        const res = await fetch(`/api/clienti?id=${cliente.id}`);
        if (res.ok) {
          const fullCliente = await res.json();
          // Aggiorna lo stato solo se il modal visualizza ancora lo stesso cliente
          setSelectedCliente(prev => prev?.id === cliente.id ? hydrateCliente(fullCliente) : prev);
        }
      } catch (e) {
        console.error('Errore nel caricamento del cliente completo:', e);
      }
    } else {
      setSelectedCliente(generateEmptyCliente());
      setIsModalOpen(true);
      setActiveTab("profilo");
      setMatchResults([]);
    }
  };
  const handleCloseModal = () => { setIsModalOpen(false); setSelectedCliente(null); setMatchResults([]); };
  const updateNestedField = (section: keyof Cliente, field: string, value: any) => {
    setSelectedCliente(prev => {
      if (!prev) return prev;
      return { ...prev, [section]: { ...(prev[section] as any), [field]: value } };
    });
  };

  // La ficha no se cierra al pinchar el fondo: es un formulario de cinco
  // pestanas que no se guarda solo, y un clic fuera al arrastrar una firma o
  // al soltar un texto seleccionado borraria todo lo escrito.
  // `abierto` repite la condicion del JSX para que el hook no se active
  // mientras el panel todavia no existe y la ref esta vacia.
  const dialogoScheda = useDialog<HTMLDivElement>({
    abierto: isModalOpen && !!selectedCliente,
    alCerrar: handleCloseModal,
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Gestione Clienti"
        subtitle="Motore di Matching e Anagrafica Intelligente"
        action={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => handleOpenModal()}>
            Nuovo Lead
          </Button>
        }
        search={{
          value: searchTerm,
          onChange: (v) => { setSearchTerm(v); setVisibleCount(30); },
          placeholder: "Cerca cliente per nome, email o telefono...",
          // Sin esto la lupa nunca se convierte en spinner, al reves que
          // /immobili, y nada indica que la lista todavia se esta trayendo.
          loading,
        }}
      >
        <button
          onClick={() => { setFilterVendita(!filterVendita); setVisibleCount(30); }}
          className={cn(
            "px-4 py-2 rounded-full text-sm font-bold border transition-all flex items-center gap-2",
            filterVendita ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 shadow-sm"
          )}
        >
          <div className={cn("w-2 h-2 rounded-full", filterVendita ? "bg-white" : "bg-indigo-400")} />
          Cerca Acquisto (Vendita)
        </button>
        <button
          onClick={() => { setFilterAffitto(!filterAffitto); setVisibleCount(30); }}
          className={cn(
            "px-4 py-2 rounded-full text-sm font-bold border transition-all flex items-center gap-2",
            filterAffitto ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 shadow-sm"
          )}
        >
          <div className={cn("w-2 h-2 rounded-full", filterAffitto ? "bg-white" : "bg-emerald-400")} />
          Cerca Affitto
        </button>
      </PageHeader>

      {/* ═══ GRID CARDS — responsive: 1 → 2 → 3 → 4 col ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {filteredClienti.slice(0, visibleCount).map((cliente) => {
          const nome = cliente.DatiPersonali?.Nome || (cliente as any).nome || '';
          const cognome = cliente.DatiPersonali?.Cognome || (cliente as any).cognome || '';
          const initials = ((nome[0] || '') + (cognome[0] || '')).toUpperCase() || '?';
          const fullName = [nome, cognome].filter(Boolean).join(' ') || 'Senza nome';
          const telefono = cliente.DatiPersonali?.Telefono || (cliente as any).cell1 || '';
          const email = cliente.DatiPersonali?.Email || (cliente as any).email || '';

          const nomiMaschiliInA = new Set(['luca','andrea','nicola','mattia','elia','enea','battista','barnaba','geremia','zaccaria','isaia','simca','mirca']);
          const nomeNorm = nome.toLowerCase().trim();
          const isFemale = nomeNorm.endsWith('a') && !nomiMaschiliInA.has(nomeNorm);
          const avatarBg = isFemale ? 'bg-purple-600' : 'bg-blue-600';

          const hasVendita = !!cliente.Richiesta?.Operazione?.Vendita;
          const hasAffitto = !!cliente.Richiesta?.Operazione?.Affitto;
          const prezzoVendita = (() => {
            const max = cliente.Richiesta?.BudgetAcquistoMax;
            const min = cliente.Richiesta?.BudgetAcquistoMin;
            if (max) return `€${Number(max).toLocaleString('it-IT')}`;
            if (min) return `Da €${Number(min).toLocaleString('it-IT')}`;
            return 'Da valutare';
          })();
          const prezzoAffitto = (() => {
            const max = cliente.Richiesta?.BudgetAffittoMax;
            return max ? `€${Number(max).toLocaleString('it-IT')}/m` : 'Da valutare';
          })();

          return (
            <div
              key={cliente.id}
              onClick={() => handleOpenModal(cliente)}
              className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:shadow-slate-200/60 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col"
              style={{ contentVisibility: 'auto', containIntrinsicSize: '0 220px' }}
            >
              {/* Fila 1: Avatar centrato + Nome */}
              <div className="pt-6 px-5 pb-4 flex flex-col items-center text-center">
                <div className={`h-16 w-16 rounded-full ${avatarBg} flex items-center justify-center text-white font-black text-xl shadow-md mb-3`}>
                  {initials}
                </div>
                {/* h2 y no h4: cuelga directamente del h1 de la pantalla y
                    saltarse dos niveles rompe el recorrido por encabezados. */}
                <h2 className="font-black text-base text-slate-900 leading-tight">{fullName}</h2>
              </div>

              {/* Fila 2: Contatti + Preferenze */}
              <div className="px-5 pb-4 flex flex-col gap-1.5 text-sm">
                <div className="flex items-center gap-2 text-slate-600 font-medium">
                  <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="truncate">{telefono || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate text-xs">{email || 'Nessuna email'}</span>
                </div>

                {/* Preferenze immobile */}
                <div className="mt-1 pt-1 border-t border-slate-50 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 font-medium">
                  {cliente.Richiesta?.Zone?.length ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      {cliente.Richiesta.Zone[0]}
                    </span>
                  ) : null}
                  {cliente.Richiesta?.Tipologie?.length ? (
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      {cliente.Richiesta.Tipologie[0]}
                    </span>
                  ) : null}
                  {cliente.Richiesta?.SuperficieMin ? (
                    <span className="flex items-center gap-1">
                      <Maximize2 className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      Min {cliente.Richiesta.SuperficieMin} m²
                    </span>
                  ) : null}
                  {cliente.Richiesta?.CamereLettoMin ? (
                    <span className="flex items-center gap-1">
                      <BedDouble className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      {cliente.Richiesta.CamereLettoMin} cam
                    </span>
                  ) : null}
                  {!cliente.Richiesta?.Zone?.length && !cliente.Richiesta?.Tipologie?.length &&
                   !cliente.Richiesta?.SuperficieMin && !cliente.Richiesta?.CamereLettoMin && (
                    <span className="text-slate-300 italic">Requisiti da definire</span>
                  )}
                </div>
              </div>

              {/* Fila 3: Badges operazione + azioni */}
              <div className="mt-auto border-t border-slate-100 px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {hasVendita && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-600 text-white">VENDITA</span>
                      <span className="text-sm font-black text-slate-800">{prezzoVendita}</span>
                    </div>
                  )}
                  {hasAffitto && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-600 text-white">AFFITTO</span>
                      <span className="text-sm font-black text-slate-800">{prezzoAffitto}</span>
                    </div>
                  )}
                  {!hasVendita && !hasAffitto && (
                    <span className="text-[11px] font-bold text-slate-400">N/D</span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {telefono && (
                    <a
                      href={`https://wa.me/39${telefono.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="h-9 w-9 flex items-center justify-center rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all border border-[#25D366]/20 text-[10px] font-black"
                      title="Contatta su WhatsApp"
                      aria-label="Contatta su WhatsApp"
                    >
                      WA
                    </a>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenModal(cliente); }}
                    className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-primary hover:border-primary/30 transition-all"
                    title="Visualizza / Modifica"
                    aria-label="Visualizza o modifica cliente"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Paginazione */}
      {visibleCount < filteredClienti.length && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setVisibleCount(prev => prev + 30)}
            className="px-6 py-2.5 rounded-full border border-slate-200 bg-white text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-2 text-slate-600 hover:text-primary hover:border-primary/30"
          >
            <ChevronDown className="h-4 w-4" />
            Carica altri 30 ({filteredClienti.length - visibleCount} rimanenti)
          </button>
        </div>
      )}

      {/*
        El vacio solo se pinta cuando la busqueda ya TERMINO. Antes salia
        durante la ventana de carga, asi que la pantalla mas usada del CRM
        recibia al agente afirmando que no hay ni un cliente —y acto seguido
        aparecian los 576—. Un falso negativo ahi invita a crear un duplicado.
      */}
      {loading && filteredClienti.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl border border-border bg-white animate-pulse" />
          ))}
        </div>
      )}

      {!loading && filteredClienti.length === 0 && (
        <div className="py-24 text-center animate-in fade-in slide-in-from-bottom-4 bg-white rounded-2xl border border-border">
          <User className="h-16 w-16 text-slate-200 mx-auto" />
          <h3 className="mt-4 text-xl font-bold">Nessun cliente trovato</h3>
          <p className="text-slate-500 mt-2 font-medium">Crea il tuo primo lead o modifica i filtri di ricerca.</p>
        </div>
      )}

      {/* --- MODAL FICHA CLIENTE --- */}
      {isModalOpen && selectedCliente && (
        <div className="fixed inset-0 z-50 flex flex-col p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={dialogoScheda.ref}
            {...dialogoScheda.props}
            aria-labelledby="titolo-scheda-cliente"
            className="w-full max-w-6xl mx-auto flex-1 flex flex-col overflow-hidden bg-slate-50 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 outline-none"
          >

            {/* B5: Offline banner */}
            {!isOnline && (
              <div className="bg-amber-500 text-white text-sm font-bold text-center py-2 px-4 rounded-t-2xl">
                ⚠️ Connessione assente — le modifiche non verranno salvate finché non torni online.
              </div>
            )}

            {/* Header Modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white sticky top-0 z-10 box-border">
               <div className="flex items-center gap-4">
                 <div className="h-12 w-12 bg-gradient-to-br from-indigo-100 to-blue-100 border border-indigo-200 rounded-xl flex items-center justify-center text-indigo-600 font-bold text-xl shadow-inner">
                   {selectedCliente.DatiPersonali?.Nome?.[0] || (selectedCliente as any).nome?.[0] || 'N'}
                 </div>
                 <div>
                   <h2 id="titolo-scheda-cliente" className="text-xl font-black text-slate-800">
                     {selectedCliente.id ? `${selectedCliente.DatiPersonali?.Nome || (selectedCliente as any).nome || ''} ${selectedCliente.DatiPersonali?.Cognome || (selectedCliente as any).cognome || ''}` : 'Nuovo Cliente'}
                   </h2>
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-2">
                     <span className={cn("h-2 w-2 rounded-full", selectedCliente.status === 'Attivo' ? 'bg-emerald-500' : 'bg-slate-400')}></span>
                     {selectedCliente.status}
                   </p>
                 </div>
               </div>
               <div className="flex items-center gap-3">
                 <button onClick={handlePrintPDF} className="h-11 md:h-10 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center gap-2 transition-colors text-sm font-bold border border-indigo-100" title="Stampa Scheda Incarico">
                   <Printer className="h-4 w-4" /> Stampa Scheda
                 </button>
                 <button onClick={handleCloseModal} aria-label="Chiudi scheda cliente" className="h-11 w-11 md:h-10 md:w-10 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center transition-colors">
                   <X className="h-5 w-5" />
                 </button>
               </div>
            </div>

            {/* Navigation Tabs */}
            <div className="px-6 border-b border-slate-200 bg-white flex overflow-x-auto no-scrollbar">
               <button 
                 onClick={() => setActiveTab('profilo')}
                 className={cn("px-5 py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap", activeTab === 'profilo' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300")}
               >
                 <User className="h-4 w-4 inline-block mr-2" /> Dati Personali
               </button>
               <button 
                 onClick={() => setActiveTab('ricerca')}
                 className={cn("px-5 py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap", activeTab === 'ricerca' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300")}
               >
                 <Search className="h-4 w-4 inline-block mr-2" /> Parametri Ricerca
               </button>
               <button 
                 onClick={() => setActiveTab('matching')}
                 className={cn("px-5 py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap", activeTab === 'matching' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300")}
               >
                 <CheckCircle2 className="h-4 w-4 inline-block mr-2" /> Matches & Proposte
               </button>
               <button 
                 onClick={() => setActiveTab('documenti')}
                 className={cn("px-5 py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap", activeTab === 'documenti' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300")}
               >
                 <FileSignature className="h-4 w-4 inline-block mr-2" /> Documenti
               </button>
               <button 
                 onClick={() => setActiveTab('firma')}
                 className={cn("px-5 py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap", activeTab === 'firma' ? "border-indigo-500 text-indigo-500" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300")}
               >
                 <FileSignature className="h-4 w-4 inline-block mr-2" /> Hoja Legal & Firma
               </button>
            </div>

            {/* Content Tabs */}
            <div className="flex-1 overflow-y-auto p-4 pb-24 md:p-8 bg-slate-50/50">
               <div className="max-w-4xl mx-auto space-y-8">
                 
                 {/* TAB: PROFILO */}
                 {activeTab === 'profilo' && (
                   <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                     <h3 className="font-bold text-lg text-slate-800 border-b border-slate-100 pb-4 mb-6 flex items-center gap-2">
                       <User className="h-5 w-5 text-blue-500" />
                       Anagrafica Cliente
                     </h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label htmlFor="cliente-nome" className="text-xs font-bold text-slate-500 uppercase">Nome</label>
                          <input
                            id="cliente-nome"
                            type="text"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-medium"
                            value={selectedCliente.DatiPersonali.Nome}
                            onChange={(e) => updateNestedField('DatiPersonali', 'Nome', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="cliente-cognome" className="text-xs font-bold text-slate-500 uppercase">Cognome</label>
                          <input
                            id="cliente-cognome"
                            type="text"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-medium"
                            value={selectedCliente.DatiPersonali.Cognome}
                            onChange={(e) => updateNestedField('DatiPersonali', 'Cognome', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="cliente-telefono" className="text-xs font-bold text-slate-500 uppercase">Telefono</label>
                          <input
                            id="cliente-telefono"
                            type="tel"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-medium" 
                            value={selectedCliente.DatiPersonali.Telefono}
                            onChange={(e) => updateNestedField('DatiPersonali', 'Telefono', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="cliente-email" className="text-xs font-bold text-slate-500 uppercase">Email</label>
                          <input
                            id="cliente-email"
                            type="email"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-medium" 
                            value={selectedCliente.DatiPersonali.Email}
                            onChange={(e) => updateNestedField('DatiPersonali', 'Email', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label htmlFor="cliente-codice-fiscale" className="text-xs font-bold text-slate-500 uppercase">Codice Fiscale</label>
                          <input
                            id="cliente-codice-fiscale"
                            type="text"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-medium uppercase"
                            value={selectedCliente.DatiPersonali.CodiceFiscale}
                            onChange={(e) => updateNestedField('DatiPersonali', 'CodiceFiscale', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label htmlFor="cliente-residenza" className="text-xs font-bold text-slate-500 uppercase">Residenza / Indirizzo</label>
                          <input
                            id="cliente-residenza"
                            type="text"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-medium" 
                            value={selectedCliente.DatiPersonali.IndirizzoResidenza}
                            onChange={(e) => updateNestedField('DatiPersonali', 'IndirizzoResidenza', e.target.value)}
                          />
                        </div>
                     </div>

                      {/* ── Sezione Interna: Qualifica Creditizia ── */}
                      <div className="mt-8 pt-6 border-t-2 border-dashed border-amber-200/80">
                        <div className="flex items-center gap-2 mb-5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-black text-amber-700 uppercase tracking-widest">
                            🔒 Uso Interno
                          </span>
                          <h4 className="font-bold text-sm text-slate-700">Qualifica Creditizia (Affitti)</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label htmlFor="cliente-professione" className="text-xs font-bold text-slate-500 uppercase">Professione</label>
                            <input
                              id="cliente-professione"
                              type="text"
                              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-400 font-medium bg-amber-50/30" 
                              placeholder="Es. Insegnante, Medico..."
                              value={selectedCliente.DatiPersonali.Professione || ""}
                              onChange={(e) => updateNestedField('DatiPersonali', 'Professione', e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label htmlFor="cliente-reddito" className="text-xs font-bold text-slate-500 uppercase">Reddito Mensile/Annuo</label>
                            <input
                              id="cliente-reddito"
                              type="text"
                              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-400 font-medium bg-amber-50/30" 
                              placeholder="Es. 25.000 €"
                              value={selectedCliente.DatiPersonali.RedditoAnnuo || ""}
                              onChange={(e) => updateNestedField('DatiPersonali', 'RedditoAnnuo', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                 {/* TAB: RICERCA */}
                 {activeTab === 'ricerca' && (
                   <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">

                      {/* SEZIONE 1: Operazione & Budget */}
                      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-lg text-slate-800 border-b border-slate-100 pb-4 mb-6 flex items-center gap-2">
                          <Search className="h-5 w-5 text-emerald-500" />
                          Operazione & Budget
                        </h3>
                        <div className="mb-6">
                          {/* Il gruppo e composto da pulsanti, non da un singolo campo: l'etichetta
                              si collega con aria-labelledby invece che con htmlFor. */}
                          <label id="richiesta-operazione-label" className="text-xs font-bold text-slate-500 uppercase block mb-3">Operazione (Scegli una o entrambe)</label>
                          <div role="group" aria-labelledby="richiesta-operazione-label" className="flex gap-4">
                            <button
                              onClick={() => updateNestedField('Richiesta', 'Operazione', { ...(selectedCliente.Richiesta.Operazione || {}), Vendita: !selectedCliente.Richiesta.Operazione?.Vendita })}
                              className={cn("flex-1 py-3 px-4 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2", selectedCliente.Richiesta.Operazione?.Vendita ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")}
                            >
                              <CheckCircle2 className={cn("h-4 w-4", selectedCliente.Richiesta.Operazione?.Vendita ? "text-indigo-600" : "opacity-0 hidden")} />
                              Compra (Vendita)
                            </button>
                            <button
                              onClick={() => updateNestedField('Richiesta', 'Operazione', { ...(selectedCliente.Richiesta.Operazione || {}), Affitto: !selectedCliente.Richiesta.Operazione?.Affitto })}
                              className={cn("flex-1 py-3 px-4 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2", selectedCliente.Richiesta.Operazione?.Affitto ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")}
                            >
                              <CheckCircle2 className={cn("h-4 w-4", selectedCliente.Richiesta.Operazione?.Affitto ? "text-emerald-600" : "opacity-0 hidden")} />
                              Affitto
                            </button>
                          </div>
                        </div>
                        {(selectedCliente.Richiesta.Operazione?.Vendita || selectedCliente.Richiesta.Operazione?.Affitto) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-5 border border-slate-100 rounded-2xl">
                            {selectedCliente.Richiesta.Operazione?.Vendita && (
                              <div className="flex flex-col gap-4">
                                <h4 className="text-xs font-black text-indigo-800 uppercase tracking-widest border-b border-indigo-100 pb-2">Vendita - Limiti di Budget</h4>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1"><label htmlFor="richiesta-budget-acquisto-min" className="text-[11px] font-bold text-slate-500 uppercase">Min (\u20ac)</label><input id="richiesta-budget-acquisto-min" type="number" className="w-full px-3 py-2.5 rounded-lg border border-indigo-200 focus:border-indigo-500 font-medium bg-white" value={selectedCliente.Richiesta.BudgetAcquistoMin || ""} onChange={e => updateNestedField('Richiesta', 'BudgetAcquistoMin', e.target.value)} placeholder="0" /></div>
                                  <div className="space-y-1"><label htmlFor="richiesta-budget-acquisto-max" className="text-[11px] font-bold text-slate-500 uppercase">Max (\u20ac)</label><input id="richiesta-budget-acquisto-max" type="number" className="w-full px-3 py-2.5 rounded-lg border border-indigo-200 focus:border-indigo-500 font-black text-indigo-700 bg-white" value={selectedCliente.Richiesta.BudgetAcquistoMax || ""} onChange={e => updateNestedField('Richiesta', 'BudgetAcquistoMax', e.target.value)} placeholder="Tetto" /></div>
                                </div>
                              </div>
                            )}
                            {selectedCliente.Richiesta.Operazione?.Affitto && (
                              <div className="flex flex-col gap-4">
                                <h4 className="text-xs font-black text-emerald-800 uppercase tracking-widest border-b border-emerald-100 pb-2">Affitto - Limiti Mensili</h4>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1"><label htmlFor="richiesta-budget-affitto-min" className="text-[11px] font-bold text-slate-500 uppercase">Min (\u20ac/m)</label><input id="richiesta-budget-affitto-min" type="number" className="w-full px-3 py-2.5 rounded-lg border border-emerald-200 focus:border-emerald-500 font-medium bg-white" value={selectedCliente.Richiesta.BudgetAffittoMin || ""} onChange={e => updateNestedField('Richiesta', 'BudgetAffittoMin', e.target.value)} placeholder="0" /></div>
                                  <div className="space-y-1"><label htmlFor="richiesta-budget-affitto-max" className="text-[11px] font-bold text-slate-500 uppercase">Max (\u20ac/m)</label><input id="richiesta-budget-affitto-max" type="number" className="w-full px-3 py-2.5 rounded-lg border border-emerald-200 focus:border-emerald-500 font-black text-emerald-700 bg-white" value={selectedCliente.Richiesta.BudgetAffittoMax || ""} onChange={e => updateNestedField('Richiesta', 'BudgetAffittoMax', e.target.value)} placeholder="Tetto" /></div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* SEZIONE 2: Tipologie & Zone (PREDEFINITE) */}
                      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-lg text-slate-800 border-b border-slate-100 pb-4 mb-6 flex items-center gap-2">
                          <MapPin className="h-5 w-5 text-orange-500" />
                          Tipologia & Zone (Predefinite)
                        </h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Tipologie - ESPEJO EXACTO del select de immobili */}
                          <div className="space-y-3">
                            <label id="richiesta-tipologie-label" className="text-xs font-bold text-slate-500 uppercase">Tipologie Desiderate</label>
                            <div role="group" aria-labelledby="richiesta-tipologie-label" className="grid grid-cols-2 gap-2">
                              {TIPOLOGIE_IMMOBILE.map(tipo => {
                                const isSelected = selectedCliente.Richiesta.Tipologie.includes(tipo);
                                return (
                                  <button key={tipo} onClick={() => { const arr = isSelected ? selectedCliente.Richiesta.Tipologie.filter(t => t !== tipo) : [...selectedCliente.Richiesta.Tipologie, tipo]; updateNestedField('Richiesta', 'Tipologie', arr); }}
                                    className={cn("px-3 py-2 text-[13px] font-bold rounded-lg border text-left flex items-center gap-2 transition-all", isSelected ? "border-primary bg-primary/10 text-primary" : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white")}
                                  >
                                    <div className={cn("w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors flex-shrink-0", isSelected ? "bg-primary border-primary text-white" : "border-slate-300")}>{isSelected && <CheckCircle2 className="w-3 h-3" />}</div>
                                    {tipo}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {/* Zone - MULTI-SELECT desde zonas.json */}
                          <div className="space-y-3">
                            <label id="richiesta-zone-label" className="text-xs font-bold text-slate-500 uppercase">Zone di Interesse ({selectedCliente.Richiesta.Zone.length} selezionate)</label>
                            <div role="group" aria-labelledby="richiesta-zone-label" className="max-h-[300px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 divide-y divide-slate-100">
                              {ZONE_AGENCIA.map(zona => {
                                const isSelected = selectedCliente.Richiesta.Zone.includes(zona);
                                return (
                                  <button key={zona} onClick={() => { const arr = isSelected ? selectedCliente.Richiesta.Zone.filter(z => z !== zona) : [...selectedCliente.Richiesta.Zone, zona]; updateNestedField('Richiesta', 'Zone', arr); }}
                                    className={cn("w-full px-4 py-2.5 text-left text-sm font-medium flex items-center justify-between transition-all hover:bg-white", isSelected ? "bg-blue-50 text-blue-800" : "text-slate-600")}
                                  >
                                    <span className="truncate">{zona}</span>
                                    <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors", isSelected ? "border-blue-600 bg-blue-600" : "border-slate-300")}>{isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* SEZIONE 3: Requisiti Fisici */}
                      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-lg text-slate-800 border-b border-slate-100 pb-4 mb-6 flex items-center gap-2">
                          <Home className="h-5 w-5 text-sky-500" />
                          Requisiti Fisici & Condizioni
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                          <div className="space-y-1.5"><label htmlFor="richiesta-superficie-min" className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Superf. Min (m\u00b2)</label><input id="richiesta-superficie-min" type="number" value={selectedCliente.Richiesta.SuperficieMin || ""} onChange={e => updateNestedField('Richiesta', 'SuperficieMin', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-primary" /></div>
                          <div className="space-y-1.5"><label htmlFor="richiesta-superficie-max" className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Superf. Max (m\u00b2)</label><input id="richiesta-superficie-max" type="number" value={selectedCliente.Richiesta.SuperficieMax || ""} onChange={e => updateNestedField('Richiesta', 'SuperficieMax', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-primary" /></div>
                          <div className="space-y-1.5"><label htmlFor="richiesta-camere-letto-min" className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Cam. Letto (Min)</label><input id="richiesta-camere-letto-min" type="number" value={selectedCliente.Richiesta.CamereLettoMin || ""} onChange={e => updateNestedField('Richiesta', 'CamereLettoMin', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-primary" /></div>
                          <div className="space-y-1.5"><label htmlFor="richiesta-bagni-min" className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Bagni (Min)</label><input id="richiesta-bagni-min" type="number" value={selectedCliente.Richiesta.BagniMin || ""} onChange={e => updateNestedField('Richiesta', 'BagniMin', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-primary" /></div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                          {/* Stato Finiture - Multi-select */}
                          <div className="space-y-2">
                            <label id="richiesta-finiture-label" className="text-xs font-bold text-slate-500 uppercase">Stato Finiture Accettate</label>
                            <div role="group" aria-labelledby="richiesta-finiture-label" className="flex flex-col gap-1.5">
                              {STATI_FINITURE.map(stato => {
                                const isSelected = (selectedCliente.Richiesta.StatoFinitureAccettati || []).includes(stato);
                                return (
                                  <button key={stato} onClick={() => { const arr = isSelected ? (selectedCliente.Richiesta.StatoFinitureAccettati || []).filter(s => s !== stato) : [...(selectedCliente.Richiesta.StatoFinitureAccettati || []), stato]; updateNestedField('Richiesta', 'StatoFinitureAccettati', arr); }}
                                    className={cn("px-3 py-2 text-sm font-semibold rounded-lg border flex items-center justify-between transition-all", isSelected ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-500 bg-white hover:border-slate-300")}
                                  >
                                    {stato}
                                    <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center transition-colors", isSelected ? "border-amber-500 bg-amber-500" : "border-slate-300")}>{isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {/* Piano */}
                          <div className="space-y-2">
                            <label htmlFor="richiesta-piano" className="text-xs font-bold text-slate-500 uppercase">Piano Preferito</label>
                            <select id="richiesta-piano" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-bold text-slate-800 bg-white" value={selectedCliente.Richiesta.PianoPreferenza || "Qualsiasi"} onChange={e => updateNestedField('Richiesta', 'PianoPreferenza', e.target.value)}>
                              {PIANI_PREFERENZA.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                          {/* Arredamento */}
                          <div className="space-y-2">
                            <label htmlFor="richiesta-arredamento" className="text-xs font-bold text-slate-500 uppercase">Arredamento</label>
                            <select id="richiesta-arredamento" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-bold text-slate-800 bg-white" value={selectedCliente.Richiesta.ArredamentoPreferenza || "Indifferente"} onChange={e => updateNestedField('Richiesta', 'ArredamentoPreferenza', e.target.value)}>
                              {ARREDAMENTO_OPZIONI.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* SEZIONE 4: Caratteristiche - Espejo EXACTO de immobili.Caratteristiche */}
                      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-lg text-slate-800 border-b border-slate-100 pb-4 mb-6 flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-rose-500" />
                          Caratteristiche Desiderate (Specchio Immobili)
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {Object.entries(CARATTERISTICHE_LABELS).map(([key, label]) => {
                            const charState = selectedCliente.Richiesta.Caratteristiche || {} as any;
                            const isChecked = charState[key];
                            return (
                              <button key={key} onClick={() => updateNestedField('Richiesta', 'Caratteristiche', { ...charState, [key]: !isChecked })}
                                className={cn("px-4 py-3 rounded-xl border text-sm font-semibold flex items-center justify-between transition-all border-b-4 active:border-b", isChecked ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm" : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white")}
                              >
                                <span className="truncate mr-2">{label as string}</span>
                                <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors", isChecked ? "border-emerald-600 bg-emerald-600" : "border-slate-300")}>{isChecked && <CheckCircle2 className="w-4 h-4 text-white" />}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* SEZIONE 5: Urgenza & Note */}
                      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-3">
                            <label htmlFor="richiesta-urgenza" className="text-xs font-bold text-slate-500 uppercase">Urgenza</label>
                            <select id="richiesta-urgenza" className="w-full px-4 py-3 rounded-xl border border-rose-200 bg-rose-50/50 focus:border-rose-500 font-bold text-rose-800" value={selectedCliente.Richiesta.Urgenza} onChange={e => updateNestedField('Richiesta', 'Urgenza', e.target.value)}>
                              <option value="">Seleziona Livello...</option>
                              <option value="Alta">Alta (Immediata)</option>
                              <option value="Media">Media (3-6 mesi)</option>
                              <option value="Bassa">Bassa (&gt; 6 mesi)</option>
                            </select>
                          </div>
                          <div className="space-y-3 md:col-span-2">
                            <label htmlFor="richiesta-note" className="text-xs font-bold text-slate-500 uppercase">Note Interne sull'Incarico</label>
                            <textarea id="richiesta-note" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-medium min-h-[80px]" value={selectedCliente.Richiesta.NoteRichiesta} onChange={e => updateNestedField('Richiesta', 'NoteRichiesta', e.target.value)} placeholder="Il cliente ha fretta, lavora fuori regione, disponibile solo nei weekend..." />
                          </div>
                        </div>
                      </div>

                   </div>
                 )}

                 {/* TAB: SMART MATCHING & PROPOSTE */}
                 {activeTab === 'matching' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                      {/* Smart Matching Engine Header */}
                      <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 md:p-8 rounded-2xl text-white shadow-xl relative overflow-hidden">
                        <div className="absolute inset-0 opacity-10">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/4" />
                          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white rounded-full translate-y-1/2 -translate-x-1/4" />
                        </div>
                        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div>
                            <h3 className="font-black text-2xl flex items-center gap-2"><BarChart3 className="h-6 w-6" /> Smart Matching AI</h3>
                            <p className="text-indigo-200 text-sm mt-1.5 max-w-md">Analisi intelligente con scoring ponderato, tolleranze fuzzy e matching per adiacenza geografica.</p>
                          </div>
                          <button onClick={() => runMatching(0)} disabled={matchLoading} className="bg-white text-indigo-700 px-8 py-3.5 rounded-xl font-black shadow-lg hover:bg-indigo-50 hover:scale-105 transition-all disabled:opacity-50 flex items-center gap-2 flex-shrink-0">
                            {matchLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                            {matchLoading ? 'Analisi in corso...' : 'Lancia Matching'}
                          </button>
                        </div>
                        {matchTotal > 0 && (
                          <div className="relative z-10 mt-4 pt-4 border-t border-white/20 flex items-center gap-6 text-sm">
                            <span className="font-bold">{matchTotal} risultati trovati</span>
                            <span className="text-indigo-200">Top {matchResults.length} visualizzati</span>
                          </div>
                        )}
                      </div>

                      {/* Smart Match Results */}
                      {matchResults.length > 0 && (
                        <div className="space-y-3">
                          {matchResults.map((match: any) => {
                            const pct = match.matchPercentage;
                            const isExpanded = expandedMatchId === match.immobileId;
                            const colorClass = pct >= 80 ? 'emerald' : pct >= 60 ? 'amber' : pct >= 40 ? 'orange' : 'rose';
                            const colorMap: Record<string, { bg: string; text: string; ring: string; bar: string; badge: string }> = {
                              emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
                              amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',   bar: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-800 border-amber-200' },
                              orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  ring: 'ring-orange-200',  bar: 'bg-orange-500',  badge: 'bg-orange-100 text-orange-800 border-orange-200' },
                              rose:    { bg: 'bg-rose-50',    text: 'text-rose-600',    ring: 'ring-rose-200',    bar: 'bg-rose-400',    badge: 'bg-rose-100 text-rose-700 border-rose-200' },
                            };
                            const colors = colorMap[colorClass];
                            const labelMatch = pct >= 80 ? 'Eccellente' : pct >= 60 ? 'Buono' : pct >= 40 ? 'Parziale' : 'Basso';

                            // Generate quick summary
                            const topCriteria = (match.breakdown || []).filter((b: any) => b.score >= 0.9 && b.peso >= 10).map((b: any) => b.label);
                            const weakCriteria = (match.breakdown || []).filter((b: any) => b.score < 0.5 && b.peso >= 5).map((b: any) => b.label);

                            return (
                              <div key={match.immobileId} className={cn("bg-white rounded-2xl border shadow-sm transition-all hover:shadow-md", isExpanded ? 'border-indigo-200 shadow-indigo-100/50' : 'border-slate-200')}>
                                {/* Main Card Row */}
                                <div className="p-4 flex items-center gap-4">
                                  {/* Score Badge */}
                                  <div className={cn("w-16 h-16 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 border", colors.badge)}>
                                    <span className={cn("text-xl font-black leading-none", colors.text)}>{pct}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5 opacity-70">%</span>
                                  </div>

                                  {/* Photo */}
                                  <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 relative">
                                    {match.snippet?.mainImage ? (
                                      <NextImage src={match.snippet.mainImage} alt="" fill className="object-cover" sizes="64px" loading="lazy" unoptimized={esFuenteLocal(match.snippet.mainImage)} />
                                    ) : (
                                      <Home className="w-8 h-8 text-slate-300 m-auto mt-4" />
                                    )}
                                  </div>

                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-bold text-slate-800 truncate">Rif #{match.codice} — {match.snippet?.tipologia}</p>
                                      <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border flex-shrink-0", colors.badge)}>{labelMatch}</span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                      {match.snippet?.zona && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{match.snippet.zona}</span>}
                                      {match.snippet?.mq > 0 && <span>{match.snippet.mq} m²</span>}
                                      {match.snippet?.camere > 0 && <span>{match.snippet.camere} cam</span>}
                                    </div>
                                    <p className="text-sm font-black text-slate-900 mt-1">€{Number(match.snippet?.prezzo || 0).toLocaleString()}</p>
                                    {/* Quick summary */}
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                      {topCriteria.slice(0, 3).map((c: string) => (
                                        <span key={c} className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">✓ {c}</span>
                                      ))}
                                      {weakCriteria.slice(0, 2).map((c: string) => (
                                        <span key={c} className="text-[10px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded-md">⚠ {c}</span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                                    <button onClick={() => handleScarta(match.immobileId)} title="Scarta" aria-label={`Scarta immobile ${match.codice}`} className="h-9 w-9 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-colors border border-rose-100">
                                      <ThumbsDown className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => handleProponi({ id: match.immobileId, DatiBase: { Codice: match.codice } })} title="Proponi" aria-label={`Proponi immobile ${match.codice} al cliente`} className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors border border-emerald-100">
                                      <ThumbsUp className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => setExpandedMatchId(isExpanded ? null : match.immobileId)} title="Dettagli" aria-expanded={isExpanded} aria-label={isExpanded ? 'Nascondi dettagli del punteggio' : 'Mostra dettagli del punteggio'} className={cn("h-9 w-9 rounded-lg flex items-center justify-center transition-colors border", isExpanded ? 'bg-indigo-100 text-indigo-600 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100')}>
                                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </button>
                                  </div>
                                </div>

                                {/* Expanded Breakdown */}
                                {isExpanded && (
                                  <div className="px-4 pb-4 pt-0 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="bg-slate-50/80 rounded-xl p-4 mt-3">
                                      <h5 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Desglose del Punteggio</h5>
                                      <div className="space-y-2.5">
                                        {(match.breakdown || []).map((b: any) => (
                                          <div key={b.criterio} className={cn("flex items-center gap-3", b.wildcard && 'opacity-50')}>
                                            <span className={cn("text-xs font-bold w-24 text-right flex-shrink-0", b.wildcard ? 'text-slate-400 italic' : 'text-slate-600')}>{b.label}</span>
                                            <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                                              <div
                                                className={cn("h-full rounded-full transition-all duration-500",
                                                  b.wildcard ? 'bg-slate-300' :
                                                  b.score >= 0.8 ? 'bg-emerald-500' : b.score >= 0.5 ? 'bg-amber-500' : b.score > 0 ? 'bg-orange-400' : 'bg-slate-300'
                                                )}
                                                style={{ width: `${Math.round(b.score * 100)}%` }}
                                              />
                                            </div>
                                            <span className={cn("text-xs font-bold w-14 flex-shrink-0", b.wildcard ? 'text-slate-400' : 'text-slate-500')}>{b.puntos}/{b.peso}</span>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200">
                                        <span className="text-sm font-black text-slate-800">Totale: {pct}/100</span>
                                        <div className="flex gap-2">
                                          <a href={`/immobili?id=${match.immobileId}`} target="_blank" className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                                            <ExternalLink className="h-3.5 w-3.5" /> Vedi Immobile
                                          </a>
                                          <button
                                            onClick={() => handleWhatsAppProposal(match)}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                                          >
                                            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Load More Button */}
                          {matchHasMore && (
                            <div className="flex justify-center pt-2">
                              <button
                                onClick={loadMoreMatches}
                                disabled={matchLoadingMore}
                                className="px-8 py-3 rounded-xl border-2 border-dashed border-indigo-300 text-indigo-600 font-bold hover:bg-indigo-50 hover:border-indigo-400 transition-all flex items-center gap-2 disabled:opacity-50"
                              >
                                {matchLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                                {matchLoadingMore ? 'Caricamento...' : `Carica altri 10 risultati (${matchTotal - matchResults.length} rimanenti)`}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {matchResults.length === 0 && !matchLoading && (
                        <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-200 text-center">
                          <BarChart3 className="h-16 w-16 text-slate-200 mx-auto mb-4" />
                          <h4 className="font-bold text-lg text-slate-600">Nessun risultato</h4>
                          <p className="text-slate-400 mt-1 font-medium max-w-sm mx-auto">Premi "Lancia Matching" per analizzare tutte le proprietà attive con il motore di scoring intelligente.</p>
                        </div>
                      )}

                      {/* Proposed List */}
                      {(selectedCliente.Matching?.Proposti || []).length > 0 && (
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-200">
                          <h4 className="font-bold text-lg text-emerald-800 mb-4">👍 Proposti ({selectedCliente.Matching.Proposti.length})</h4>
                          <div className="divide-y divide-slate-100">
                            {selectedCliente.Matching.Proposti.map((p: any, i: number) => (
                              <div key={i} className="py-3 flex items-center justify-between">
                                <div><span className="font-bold text-slate-800">#{p.codice || p.immobileId}</span> <span className="text-xs text-slate-500 ml-2">{p.dataProposta}</span></div>
                                <span className={cn("px-3 py-1 rounded-full text-xs font-bold", p.esito === 'In Attesa' ? 'bg-amber-100 text-amber-700' : p.esito === 'Interessato' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')}>{p.esito}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Manual Add by Code */}
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2"><Hash className="h-4 w-4 text-primary" /> Aggiungi Immobile Manualmente (Tramite Codice)</h4>
                        <div className="flex gap-3">
                          <input id="matching-codice-manuale" aria-label="Codice dell'immobile da aggiungere" type="text" value={manualCode} onChange={e => setManualCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleManualAdd()} placeholder="Es. 7405" className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 font-bold focus:border-primary" />
                          <button onClick={handleManualAdd} disabled={manualLoading} className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                            {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Aggiungi
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                 {/* TAB: DOCUMENTI */}
                 {activeTab === 'documenti' && (
                   <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                     {/* Drop Zone */}
                     <div
                       onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/5'); }}
                       onDragLeave={e => { e.currentTarget.classList.remove('border-primary', 'bg-primary/5'); }}
                       onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-primary', 'bg-primary/5'); handleDocUpload(e.dataTransfer.files); }}
                       onClick={() => fileInputRef.current?.click()}
                       className="bg-white p-10 rounded-2xl shadow-sm border-2 border-dashed border-slate-300 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
                     >
                       <input id="documenti-file-input" aria-label="Seleziona i documenti da caricare" ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => handleDocUpload(e.target.files)} />
                       {docUploading ? (
                         <><Loader2 className="h-12 w-12 text-primary mx-auto animate-spin mb-3" /><p className="font-bold text-primary">Caricamento in corso...</p></>
                       ) : (
                         <><Upload className="h-12 w-12 text-slate-300 mx-auto mb-3" /><p className="font-bold text-slate-600">Trascina qui i file oppure clicca per selezionare</p><p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG, WebP — Max 10MB per file</p></>
                       )}
                     </div>

                     {/* Document List */}
                     {(selectedCliente.Documentazione?.AltriDocumenti || []).length > 0 && (
                       <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                         <h4 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2"><FileSignature className="h-5 w-5 text-primary" /> Documenti Caricati ({selectedCliente.Documentazione.AltriDocumenti.length})</h4>
                         <div className="divide-y divide-slate-100">
                           {selectedCliente.Documentazione.AltriDocumenti.map((url: string, i: number) => {
                             const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || `Documento_${i + 1}`);
                             const isImage = /\.(jpg|jpeg|png|webp)/i.test(name);
                             return (
                               <div key={i} className="py-3 flex items-center justify-between gap-3">
                                 <div className="flex items-center gap-3 min-w-0">
                                   <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0", isImage ? 'bg-blue-50 text-blue-500' : 'bg-rose-50 text-rose-500')}>
                                     <FileSignature className="h-5 w-5" />
                                   </div>
                                   <span className="text-sm font-medium text-slate-700 truncate">{name.substring(name.indexOf('_') + 1)}</span>
                                 </div>
                                 <div className="flex gap-2 flex-shrink-0">
                                   <a href={urlDeDescarga(url)} target="_blank" rel="noopener noreferrer" aria-label="Apri il documento in una nuova scheda" className="h-11 w-11 md:h-9 md:w-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-colors"><Eye className="h-4 w-4" /></a>
                                   <button onClick={() => handleDocDelete(url)} aria-label="Elimina documento" className="h-9 w-9 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-colors"><Trash2 className="h-4 w-4" /></button>
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       </div>
                     )}
                     {(selectedCliente.Documentazione?.AltriDocumenti || []).length === 0 && !docUploading && (
                       <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center text-slate-400"><p className="font-medium">Nessun documento caricato per questo cliente.</p></div>
                     )}
                   </div>
                 )}

                 {/* TAB: FIRMA DIGITAL */}
                 {activeTab === 'firma' && (
                   <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                     <div className="bg-indigo-900 text-white p-8 rounded-2xl shadow-lg relative overflow-hidden">
                       <FileSignature className="absolute right-0 bottom-0 opacity-10 h-64 w-64 translate-x-1/4 translate-y-1/4" />
                       <h3 className="font-black text-2xl relative z-10">Firma Digitale Tablet-Ready</h3>
                       <p className="text-indigo-200 mt-2 font-medium max-w-lg relative z-10">
                         Utilizza questo pannello quando il cliente è in ufficio o in mobilità. La firma catturata verrà automaticamente stampata sul foglio privacy generato dal sistema.
                       </p>
                     </div>

                     <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                       <SignaturePad
                         title="Firma Cliente"
                         value={selectedCliente.FirmaDigitale?.UrlFirma || ''}
                         onSave={(b64) => {
                           setSelectedCliente(prev => prev ? {
                             ...prev,
                             FirmaDigitale: { ...(prev.FirmaDigitale || {}), UrlFirma: b64, HasFirma: true }
                           } : prev);
                         }}
                         onClear={() => {
                           setSelectedCliente(prev => prev ? {
                             ...prev,
                             FirmaDigitale: { ...(prev.FirmaDigitale || {}), UrlFirma: '', HasFirma: false }
                           } : prev);
                         }}
                         heightClass="h-[300px] md:h-[400px]"
                       />
                     </div>
                   </div>
                 )}

               </div>
            </div>

            {/* Footer Modal Sticky */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-slate-50 flex flex-wrap items-center justify-between gap-2 z-10">
               <button onClick={handleDeleteCliente} aria-label="Elimina cliente" className="flex items-center text-sm font-bold text-rose-500 hover:text-rose-600 transition-colors shrink-0">
                 {selectedCliente.id && <><Trash2 className="h-4 w-4 mr-1.5" /><span className="hidden xs:inline">Elimina Cliente</span></>}
               </button>
               <div className="flex gap-2 sm:gap-3">
                 <Button variant="secondary" onClick={handleCloseModal}>Chiudi</Button>
                 <Button
                   variant="primary"
                   onClick={handleSaveCliente}
                   loading={saving}
                   icon={<Save className="h-4 w-4" />}
                 >
                   {saving ? 'Salvando...' : 'Salva'}
                 </Button>
               </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
