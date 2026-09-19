'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  X, Search, User, Home, Calendar, Percent, ShieldCheck,
  Printer, Send, Save, Loader2, FileText, Sparkles, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDialog } from '@/hooks/useDialog';
import SignaturePad from '@/components/ui/SignaturePad';

// ═══ Types ═══
interface FoglioVisitaData {
  tipoScheda: 'compravendita' | 'locazioni' | 'valutazioni' | 'mutui';
  nome: string;
  residenteIn: string;
  via: string;
  telefono: string;
  perContoEnabled: boolean;
  nomePerConto: string;
  dataVisita: string;
  tipoVisita: 'informazioni' | 'visitato';
  descrizioneImmobile: string;
  provvigionePercent: string;
  provvigioneIva: string;
  canoneMensile: string;
  canoneIva: string;
  privacyAccepted: boolean;
  firmaAgente: string;
  firmaCliente: string;
}

const INITIAL_DATA: FoglioVisitaData = {
  tipoScheda: 'compravendita',
  nome: '',
  residenteIn: '',
  via: '',
  telefono: '',
  perContoEnabled: false,
  nomePerConto: '',
  dataVisita: new Date().toISOString().split('T')[0],
  tipoVisita: 'visitato',
  descrizioneImmobile: '',
  provvigionePercent: '3',
  provvigioneIva: '22',
  canoneMensile: '',
  canoneIva: '22',
  privacyAccepted: false,
  firmaAgente: '',
  firmaCliente: '',
};

export interface FoglioVisitaFormProps {
  onClose: () => void;
  onSave?: (data: FoglioVisitaData) => void;
  sezione: string;
  azione: string;
  /** Pre-populate the form with a previously saved document (restores all fields including signatures) */
  initialData?: Partial<FoglioVisitaData>;
}

const TIPO_SCHEDA_OPTIONS = [
  { value: 'compravendita', label: 'Compravendita', emoji: '🏠', color: 'from-blue-500 to-indigo-600' },
  { value: 'locazioni', label: 'Locazioni', emoji: '🔑', color: 'from-emerald-500 to-teal-600' },
  { value: 'valutazioni', label: 'Valutazioni', emoji: '📊', color: 'from-amber-500 to-orange-600' },
  { value: 'mutui', label: 'Mutui', emoji: '🏦', color: 'from-violet-500 to-purple-600' },
] as const;

// ═══ Section Card wrapper ═══
function SectionCard({ icon: Icon, title, badge, children }: { icon: any; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-indigo-600" />
          </div>
          {title}
        </h2>
        {badge && <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-wider">{badge}</span>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ═══ Input wrapper ═══
function FormInput({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}

const inputClasses = "w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-medium text-sm text-slate-800 transition-all placeholder:text-slate-300";

export default function FoglioVisitaForm({ onClose, sezione, azione, initialData }: FoglioVisitaFormProps) {
  const [form, setForm] = useState<FoglioVisitaData>(() => ({ ...INITIAL_DATA, ...initialData }));
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Client search
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteResults, setClienteResults] = useState<any[]>([]);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);

  // Immobile search
  const [immobileSearch, setImmobileSearch] = useState('');
  const [immobileResults, setImmobileResults] = useState<any[]>([]);
  const [showImmobileDropdown, setShowImmobileDropdown] = useState(false);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }
  }, [toast]);

  useEffect(() => {
    import('@react-pdf/renderer').catch(() => {});
    import('@/components/pdf/templates/FoglioVisita').catch(() => {});
    import('@/lib/saveDocumentToCloud').catch(() => {});
  }, []);

  // Search clients. La petición va con debounce: antes salía una por cada
  // tecla, y una búsqueda de clientes escanea la colección entera.
  const fetchClienti = useDebouncedCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/clienti?q=${encodeURIComponent(q)}&limit=6`);
      const data = await res.json();
      setClienteResults(Array.isArray(data) ? data : []);
      setShowClienteDropdown(true);
    } catch { setClienteResults([]); }
  }, 300);

  const searchClienti = useCallback((q: string) => {
    setClienteSearch(q);
    if (q.length < 2) { setClienteResults([]); setShowClienteDropdown(false); return; }
    fetchClienti(q);
  }, [fetchClienti]);

  const selectCliente = (c: any) => {
    const nome = `${c.DatiPersonali?.Nome || c.nome || ''} ${c.DatiPersonali?.Cognome || c.cognome || ''}`.trim();
    const citta = c.DatiPersonali?.CittaResidenza || '';
    const via = c.DatiPersonali?.IndirizzoResidenza || '';
    const tel = c.DatiPersonali?.Telefono || '';
    const cf = c.DatiPersonali?.CodiceFiscale || '';
    setForm(p => ({ ...p, nome, residenteIn: citta, via, telefono: tel, codiceFiscale: cf }));
    setClienteSearch(nome);
    setShowClienteDropdown(false);
    setClienteResults([]);
  };

  // Search immobili, con el mismo debounce que la búsqueda de clientes.
  const fetchImmobili = useDebouncedCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/immobili?q=${encodeURIComponent(q)}&limit=6`);
      const json = await res.json();
      const items = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
      setImmobileResults(items);
      setShowImmobileDropdown(true);
    } catch { setImmobileResults([]); }
  }, 300);

  const searchImmobili = useCallback((q: string) => {
    setImmobileSearch(q);
    if (q.length < 2) { setImmobileResults([]); setShowImmobileDropdown(false); return; }
    fetchImmobili(q);
  }, [fetchImmobili]);

  const selectImmobile = (i: any) => {
    const addr = i.DatiBase?.Indirizzo || '';
    const citta = i.DatiBase?.Citta || '';
    const zona = i.DatiBase?.Zona || '';
    const tipologia = i.DatiBase?.Tipologia || '';
    const rif = i.DatiBase?.Codice || '';
    const desc = `${tipologia} - ${addr}, ${citta}${zona ? ` (${zona})` : ''} — Rif. ${rif}`;
    setForm(p => ({ ...p, descrizioneImmobile: desc }));
    setImmobileSearch(desc);
    setShowImmobileDropdown(false);
    setImmobileResults([]);
  };

  // PDF Generation — uses the proper FoglioVisita template
  const handleGeneratePdf = async () => {
    if (!form.nome || !form.descrizioneImmobile) {
      setToast('⚠️ Compila almeno Nome e Descrizione Immobile');
      return;
    }
    if (!form.privacyAccepted) {
      setToast('⚠️ Devi accettare l\'informativa sulla privacy');
      return;
    }
    setGenerating(true);
    try {
      // Dynamic imports to avoid SSR issues with @react-pdf/renderer
      const [{ pdf }, { default: FoglioVisitaDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf/templates/FoglioVisita'),
      ]);

      // Create the Document element using the template with full form data
      const doc = React.createElement(FoglioVisitaDocument, { data: form });

      // Generate blob and trigger download
      const blob = await pdf(doc as any).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Foglio_Visita_${form.nome.replace(/\s+/g, '_')}_${form.dataVisita}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setToast('✅ PDF generato e scaricato con successo!');
    } catch (err: any) {
      console.error('PDF generation error:', err);
      setToast(`❌ Errore: ${err.message || 'Generazione PDF fallita'}`);
    } finally {
      setGenerating(false);
    }
  };

  const update = (field: keyof FoglioVisitaData, value: any) => setForm(p => ({ ...p, [field]: value }));

  // La página solo monta este componente mientras el formulario está abierto,
  // así que `abierto` no depende de ningún estado de aquí. Escape hace lo mismo
  // que «Annulla». No hay cierre al pinchar fuera a propósito: el formulario
  // ocupa la pantalla entera y un clic de más se llevaría por delante los datos
  // y la firma ya trazada, que no se pueden recuperar.
  const dialogo = useDialog<HTMLDivElement>({ abierto: true, alCerrar: onClose });

  // ═══ RENDER ═══
  return (
    <div
      ref={dialogo.ref}
      {...dialogo.props}
      aria-labelledby="titolo-foglio-visita"
      className="fixed inset-0 z-50 bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50/30 overflow-y-auto outline-none"
    >
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[200] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold bg-slate-900 text-white animate-in slide-in-from-right-5 fade-in duration-200">
          {toast}
        </div>
      )}

      {/* ═══ TOP BAR ═══ */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 id="titolo-foglio-visita" className="text-lg font-black text-slate-800 tracking-tight">Foglio di Visita</h1>
              <p className="text-[11px] text-slate-400 font-bold tracking-wide">Verbale di presa visione immobiliare — Immobiliare Pantaleo</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Chiudi il modulo" className="h-10 w-10 rounded-full bg-slate-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-400 transition-all duration-200">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ═══ FORM BODY ═══ */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 pb-36 space-y-6">

        {/* ═══ 1. TIPO DI SCHEDA ═══ */}
        <SectionCard icon={FileText} title="Tipo di Scheda" badge="Obbligatorio">
          <div className="flex flex-wrap gap-3">
            {TIPO_SCHEDA_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => update('tipoScheda', opt.value)}
                className={cn(
                  "relative px-4 md:px-6 py-3.5 rounded-xl text-sm font-bold border-2 transition-all duration-200 flex items-center gap-2.5 overflow-hidden",
                  form.tipoScheda === opt.value
                    ? "bg-gradient-to-r text-white border-transparent shadow-lg scale-[1.02]"
                    : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 hover:scale-[1.01]",
                  form.tipoScheda === opt.value && opt.color
                )}
              >
                <span className="text-lg">{opt.emoji}</span>
                {opt.label}
                {form.tipoScheda === opt.value && (
                  <CheckCircle2 className="h-4 w-4 ml-1 opacity-80" />
                )}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* ═══ 2. DATI DEL VISITATORE ═══ */}
        <SectionCard icon={User} title="Dati del Visitatore" badge="Sezione 2">
          <div className="space-y-5">
            {/* Client predictive search */}
            <div className="relative">
              <label htmlFor="fv-cerca-cliente" className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Cerca cliente esistente (autocompletamento)
              </label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-300" />
                <input
                  id="fv-cerca-cliente"
                  type="text"
                  value={clienteSearch}
                  onChange={e => searchClienti(e.target.value)}
                  onFocus={() => clienteResults.length > 0 && setShowClienteDropdown(true)}
                  placeholder="Digita nome o cognome per autocompletare..."
                  className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-indigo-100 bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-medium text-sm"
                />
              </div>
              {showClienteDropdown && clienteResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto z-30">
                  {clienteResults.map((c: any) => (
                    <button key={c.id} onClick={() => selectCliente(c)} className="w-full text-left px-4 py-3 hover:bg-indigo-50 text-sm flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                        <User className="h-3.5 w-3.5 text-indigo-500" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-800">{c.DatiPersonali?.Nome || c.nome} {c.DatiPersonali?.Cognome || c.cognome}</span>
                        {c.DatiPersonali?.Telefono && <span className="text-xs text-slate-400 ml-2">📞 {c.DatiPersonali.Telefono}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput label="Il/La sottoscritto/a (Nome Completo) *" htmlFor="fv-nome">
                <input id="fv-nome" type="text" value={form.nome} onChange={e => update('nome', e.target.value)} placeholder="es. Mario Rossi" className={inputClasses} />
              </FormInput>
              <FormInput label="Telefono" htmlFor="fv-telefono">
                <input id="fv-telefono" type="tel" value={form.telefono} onChange={e => update('telefono', e.target.value)} placeholder="es. +39 333 1234567" className={inputClasses} />
              </FormInput>
              <FormInput label="Residente in" htmlFor="fv-residentein">
                <input id="fv-residentein" type="text" value={form.residenteIn} onChange={e => update('residenteIn', e.target.value)} placeholder="es. Marsala (TP)" className={inputClasses} />
              </FormInput>
              <FormInput label="Via" htmlFor="fv-via">
                <input id="fv-via" type="text" value={form.via} onChange={e => update('via', e.target.value)} placeholder="es. Via Roma 23" className={inputClasses} />
              </FormInput>
            </div>

            {/* Per conto di - checkbox toggle */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={cn(
                  "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                  form.perContoEnabled ? "bg-indigo-600 border-indigo-600" : "border-slate-300 group-hover:border-indigo-400"
                )}>
                  {form.perContoEnabled && <CheckCircle2 className="h-3 w-3 text-white" />}
                </div>
                <input type="checkbox" checked={form.perContoEnabled} onChange={e => update('perContoEnabled', e.target.checked)} className="sr-only" />
                <span className="text-sm font-bold text-slate-700">In nome e per conto di (agisce per conto di terzi)</span>
              </label>
              {form.perContoEnabled && (
                <div className="pl-8 animate-in slide-in-from-top-2 duration-200">
                  <input id="fv-nomeperconto" type="text" aria-label="Nome della persona per cui agisce" value={form.nomePerConto} onChange={e => update('nomePerConto', e.target.value)} placeholder="Nome della persona per cui agisce..." className={inputClasses} />
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* ═══ 3. DETTAGLI DELLA VISITA ═══ */}
        <SectionCard icon={Home} title="Dettagli della Visita" badge="Sezione 3">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput label="Data della Visita" htmlFor="fv-datavisita">
                <input id="fv-datavisita" type="date" value={form.dataVisita} onChange={e => update('dataVisita', e.target.value)} className={inputClasses} />
              </FormInput>
              <FormInput label="Tipo di Visita">
                <div className="flex gap-3 pt-0.5">
                  <button
                    onClick={() => update('tipoVisita', 'visitato')}
                    className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all duration-200", form.tipoVisita === 'visitato' ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300")}
                  >🏠 Ha visitato</button>
                  <button
                    onClick={() => update('tipoVisita', 'informazioni')}
                    className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all duration-200", form.tipoVisita === 'informazioni' ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300")}
                  >ℹ️ Informazioni</button>
                </div>
              </FormInput>
            </div>

            {/* Immobile search */}
            <div className="relative">
              <label htmlFor="fv-cerca-immobile" className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Cerca Immobile dal database
              </label>
              <div className="relative">
                <Home className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-300" />
                <input
                  id="fv-cerca-immobile"
                  type="text"
                  value={immobileSearch}
                  onChange={e => searchImmobili(e.target.value)}
                  onFocus={() => immobileResults.length > 0 && setShowImmobileDropdown(true)}
                  placeholder="Digita indirizzo, zona o codice di riferimento..."
                  className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-indigo-100 bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-medium text-sm"
                />
              </div>
              {showImmobileDropdown && immobileResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto z-30">
                  {immobileResults.map((i: any) => (
                    <button key={i.id} onClick={() => selectImmobile(i)} className="w-full text-left px-4 py-3 hover:bg-indigo-50 text-sm flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <Home className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-800">{i.DatiBase?.Indirizzo || 'N/A'}</span>
                        <span className="text-xs text-slate-400 ml-2">{i.DatiBase?.Citta || ''} — Rif. {i.DatiBase?.Codice || ''}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <FormInput label="Descrizione Immobile / Azienda *" htmlFor="fv-descrizioneimmobile">
              <textarea id="fv-descrizioneimmobile" value={form.descrizioneImmobile} onChange={e => update('descrizioneImmobile', e.target.value)} placeholder="Descrizione dettagliata dell'immobile visitato..." rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-medium text-sm resize-none transition-all placeholder:text-slate-300" />
            </FormInput>
          </div>
        </SectionCard>

        {/* ═══ 4. PROVVIGIONE ═══ */}
        <SectionCard icon={Percent} title="Provvigione" badge="Sezione 4">
          {form.tipoScheda === 'locazioni' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput label="Canone Mensile (€)" htmlFor="fv-canonemensile">
                <input id="fv-canonemensile" type="number" value={form.canoneMensile} onChange={e => update('canoneMensile', e.target.value)} placeholder="es. 500" className={inputClasses} />
              </FormInput>
              <FormInput label="IVA (%)" htmlFor="fv-canoneiva">
                <input id="fv-canoneiva" type="number" value={form.canoneIva} onChange={e => update('canoneIva', e.target.value)} placeholder="22" className={inputClasses} />
              </FormInput>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput label="Provvigione (%)" htmlFor="fv-provvigionepercent">
                <input id="fv-provvigionepercent" type="number" value={form.provvigionePercent} onChange={e => update('provvigionePercent', e.target.value)} placeholder="3" className={inputClasses} />
              </FormInput>
              <FormInput label="IVA (%)" htmlFor="fv-provvigioneiva">
                <input id="fv-provvigioneiva" type="number" value={form.provvigioneIva} onChange={e => update('provvigioneIva', e.target.value)} placeholder="22" className={inputClasses} />
              </FormInput>
            </div>
          )}
          <div className="mt-4 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
            <p className="text-xs text-indigo-600 font-semibold">
              {form.tipoScheda === 'locazioni'
                ? `💡 In caso di esito positivo, è dovuta una provvigione pari a un canone mensile di €${form.canoneMensile || '___'} + IVA al ${form.canoneIva || '22'}%.`
                : `💡 In caso di esito positivo, è dovuta una provvigione del ${form.provvigionePercent || '3'}% sul prezzo d'acquisto + IVA al ${form.provvigioneIva || '22'}%.`}
            </p>
          </div>
        </SectionCard>

        {/* ═══ 5. PRIVACY & FIRME ═══ */}
        <SectionCard icon={ShieldCheck} title="Firme e Privacy" badge="Obbligatorio">
          <div className="space-y-6">
            {/* Privacy checkbox */}
            <div className={cn(
              "p-4 rounded-xl border-2 transition-all duration-200",
              form.privacyAccepted ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-slate-50/50"
            )}>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className={cn(
                  "mt-0.5 h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                  form.privacyAccepted ? "bg-emerald-600 border-emerald-600 shadow-sm" : "border-slate-300 group-hover:border-indigo-400"
                )}>
                  {form.privacyAccepted && <CheckCircle2 className="h-4 w-4 text-white" />}
                </div>
                <input type="checkbox" checked={form.privacyAccepted} onChange={e => update('privacyAccepted', e.target.checked)} className="sr-only" />
                <div>
                  <span className="text-sm font-bold text-slate-700">Autorizzazione al trattamento dei dati personali *</span>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">Ai sensi del D.Lgs. 196/2003 e del Regolamento UE 2016/679 (GDPR). Il testo completo dell&apos;informativa verrà automaticamente allegato come ultima pagina del PDF generato.</p>
                </div>
              </label>
            </div>

            {/* Signature Pads — solo firma del cliente */}
            <div className="max-w-md">
              <SignaturePad
                title="Firma Cliente"
                value={form.firmaCliente}
                onSave={(b64) => { update('firmaCliente', b64); }}
                onClear={() => update('firmaCliente', '')}
              />
            </div>
          </div>
        </SectionCard>

      </div>

      {/* ═══ STICKY FOOTER ═══ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4">
          <button onClick={onClose} className="px-4 md:px-6 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-500 font-bold hover:bg-slate-50 hover:border-slate-300 transition-all text-sm">
            Annulla
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGeneratePdf}
              disabled={generating}
              className={cn(
                "px-4 md:px-6 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 text-sm",
                generating
                  ? "bg-indigo-400 text-white cursor-wait"
                  : "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-indigo-600/25 hover:shadow-indigo-600/40 hover:scale-[1.02]"
              )}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {generating ? 'Generando...' : 'Stampa PDF'}
            </button>
            <button
              onClick={() => {
                const docName = "Foglio di Visita";
                const nome = form.nome || 'Cliente';
                const msg = `Gentile ${nome}, ecco il documento "${docName}" pronto per la revisione. La preghiamo di verificare i dati inseriti. Cordiali saluti, Immobiliare Pantaleo.`;
                const tel = (form.telefono || '').replace(/\D/g, '');
                const url = tel ? `https://wa.me/${tel.startsWith('39') ? tel : '39' + tel}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                window.open(url, '_blank');
              }}
              className="px-4 md:px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 hover:scale-[1.02] transition-all flex items-center gap-2 text-sm"
            >
              <Send className="h-4 w-4" /> WhatsApp
            </button>
            <button
              onClick={async () => {
                if (!form.nome || !form.descrizioneImmobile) { setToast('⚠️ Compila almeno Nome e Descrizione'); return; }
                if (!form.privacyAccepted) { setToast('⚠️ Accetta l\'informativa privacy'); return; }
                setSaving(true);
                try {
                  const { default: FoglioVisitaDocument } = await import('@/components/pdf/templates/FoglioVisita');
                  const { saveDocumentToCloud } = await import('@/lib/saveDocumentToCloud');
                  const docElement = React.createElement(FoglioVisitaDocument, { data: form });
                  const result = await saveDocumentToCloud({
                    docElement,
                    nomeFile: `Foglio Visita - ${form.nome}`,
                    categoria: 'Foglio di Visita',
                    clienteNome: form.nome,
                    sezione,
                    azione,
                    formData: form as unknown as Record<string, unknown>,
                  });
                  if (result.success) {
                    setToast('✅ Documento salvato in Cloud!');
                    setTimeout(() => onClose(), 1200);
                  } else {
                    setToast(`❌ ${result.error}`);
                  }
                } catch (e: any) { setToast(`❌ Errore: ${e.message}`); }
                finally { setSaving(false); }
              }}
              disabled={saving}
              className="px-4 md:px-6 py-3 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-white font-bold shadow-lg hover:scale-[1.02] transition-all flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salva'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
