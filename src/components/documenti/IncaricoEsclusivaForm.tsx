'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import {
  X, Search, User, Home, Percent, ShieldCheck, Printer, Send, Save, Loader2,
  FileText, CheckCircle2, Sparkles, Building2, MapPin, Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listaDeRespuesta } from "@/lib/lista-respuesta";
import { useDialog } from '@/hooks/useDialog';
import SignaturePad from '@/components/ui/SignaturePad';

function SC({ icon: Icon, title, badge, children }: { icon: any; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center"><Icon className="h-3.5 w-3.5 text-violet-600" /></div>
          {title}
        </h2>
        {badge && <span className="px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[10px] font-black uppercase tracking-wider">{badge}</span>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
function FI({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}><label htmlFor={htmlFor} className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{label}</label>{children}</div>;
}
const ic = "w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 font-medium text-sm text-slate-800 transition-all placeholder:text-slate-300";

interface Props {
  onClose: () => void;
  sezione: string;
  azione: string;
  initialData?: Record<string, any>;
  /** Id del documento que se esta reabriendo. Si viene, guardar ACTUALIZA ese
   *  documento y pisa su PDF, en vez de crear un duplicado. */
  documentoId?: string;
  /** URL guardada de ese documento, para reutilizar su ruta en Storage. */
  urlExistente?: string;
}

const TIPO_OPTIONS = [
  { value: 'vendita', label: 'Vendita', emoji: '🏠', color: 'from-blue-500 to-indigo-600' },
  { value: 'affitto', label: 'Affitto', emoji: '🔑', color: 'from-emerald-500 to-teal-600' },
  { value: 'terreno', label: 'Terreno', emoji: '🌳', color: 'from-green-500 to-lime-600' },
  { value: 'fabbricato', label: 'Fabbricato', emoji: '🏗️', color: 'from-amber-500 to-orange-600' },
  { value: 'commerciale', label: 'Attività Commerciale', emoji: '🏪', color: 'from-violet-500 to-purple-600' },
];

export default function IncaricoEsclusivaForm({ onClose, sezione, azione, initialData, documentoId, urlExistente }: Props) {
  const [form, setForm] = useState(() => ({
    /* Tipo */
    tipoIncarico: 'vendita',
    /* Proprietario */
    proprietarioNome: '', proprietarioCF: '', proprietarioNascita: '', proprietarioResidenza: '',
    proprietarioVia: '', proprietarioTel: '', proprietarioEmail: '',
    /* Immobile */
    indirizzo: '', citta: '', piano: '', zona: '', mq: '', vani: '',
    /* Catastali */
    foglio: '', particella: '', sub: '', valoreCatastale: '', classeEnergetica: 'G', categoria: '',
    /* Esclusiva */
    richiesta: '', durataEsclusiva: '6 mesi', dataInizio: '', dataFine: '',
    provvigionePercent: '3', provvigioneIva: '22', note: '',
    /* Privacy & Firme */
    privacyAccepted: false, firmaAgente: '', firmaCliente: '',
    ...initialData,
  }));
  const [toast, setToast] = useState<string | null>(null);

  const [cSearch, setCSearch] = useState('');
  const [cResults, setCResults] = useState<any[]>([]);
  const [cOpen, setCOpen] = useState(false);
  const [iSearch, setISearch] = useState('');
  const [iResults, setIResults] = useState<any[]>([]);
  const [iOpen, setIOpen] = useState(false);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

  useEffect(() => {
    import('@react-pdf/renderer').catch(() => {});
    import('@/components/pdf/templates/IncaricoEsclusiva').catch(() => {});
    import('@/lib/saveDocumentToCloud').catch(() => {});
  }, []);

  // La peticion va con debounce: antes salia una por cada tecla, y una
  // busqueda de clientes escanea la coleccion entera.
  const fetchClienti = useDebouncedCallback(async (q: string) => {
  try { const r = await fetch(`/api/clienti?q=${encodeURIComponent(q)}&limit=6`); const d = await r.json(); setCResults(Array.isArray(d) ? d : []); setCOpen(true); } catch { setCResults([]); }
  }, 300);

  const searchClienti = useCallback((q: string) => {
    setCSearch(q);
    if (q.length < 2) { setCResults([]); setCOpen(false); return; }
    fetchClienti(q);
  }, [fetchClienti]);

  const selectCliente = (c: any) => {
    const nome = `${c.DatiPersonali?.Nome || c.nome || ''} ${c.DatiPersonali?.Cognome || c.cognome || ''}`.trim();
    const cf = c.DatiPersonali?.CodiceFiscale || '';
    const nascita = c.DatiPersonali?.LuogoDiNascita ? `${c.DatiPersonali.LuogoDiNascita}${c.DatiPersonali?.DataDiNascita ? ', ' + c.DatiPersonali.DataDiNascita : ''}` : '';
    setForm(p => ({ ...p, proprietarioNome: nome, proprietarioResidenza: c.DatiPersonali?.CittaResidenza || '', proprietarioVia: c.DatiPersonali?.IndirizzoResidenza || '', proprietarioTel: c.DatiPersonali?.Telefono || '', proprietarioEmail: c.DatiPersonali?.Email || '', proprietarioCF: cf, proprietarioNascita: nascita }));
    setCSearch(nome); setCOpen(false);
  };

  const searchImmobili = useCallback(async (q: string) => {
    setISearch(q);
    if (q.length < 2) { setIResults([]); setIOpen(false); return; }
    try { const r = await fetch(`/api/immobili?q=${encodeURIComponent(q)}&limit=6`); const d = await r.json(); const items = listaDeRespuesta(d); setIResults(items); setIOpen(true); } catch { setIResults([]); }
  }, []);

  const selectImmobile = (i: any) => {
    setForm(p => ({ ...p, indirizzo: i.DatiBase?.Indirizzo || '', citta: i.DatiBase?.Citta || '', zona: i.DatiBase?.Zona || '' }));
    setISearch(`${i.DatiBase?.Indirizzo || ''}, ${i.DatiBase?.Citta || ''}`); setIOpen(false);
  };

  const u = (f: string, v: any) => setForm(p => ({ ...p, [f]: v }));
  const CLASSI_EN = ['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'];
  const DURATE = ['3 mesi', '6 mesi', '12 mesi', '18 mesi', '24 mesi'];

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const handleGeneratePdf = async () => {
    if (!form.proprietarioNome) { setToast('⚠️ Compila almeno il nome del proprietario'); return; }
    if (!form.privacyAccepted) { setToast('⚠️ Accetta l\'informativa privacy'); return; }
    if (!form.indirizzo?.trim()) { setToast('⚠️ Inserisci l\'indirizzo dell\'immobile'); return; }
    if (!form.richiesta || Number(form.richiesta) <= 0) { setToast('⚠️ Inserisci il prezzo richiesto'); return; }
    if (form.dataInizio && form.dataFine && form.dataInizio >= form.dataFine) { setToast('⚠️ La data di fine deve essere successiva alla data di inizio'); return; }
    setGenerating(true);
    try {
      const [{ pdf }, { default: Doc }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf/templates/IncaricoEsclusiva'),
      ]);
      const blob = await pdf(React.createElement(Doc, { data: form } as any) as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `Incarico_Esclusiva_${form.proprietarioNome.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast('✅ PDF generato e scaricato!');
    } catch (e: any) { console.error(e); setToast(`❌ Errore: ${e.message}`); }
    finally { setGenerating(false); }
  };

  // La pagina solo monta este componente mientras el formulario esta abierto,
  // asi que `abierto` no depende de ningun estado de aqui. Escape hace lo mismo
  // que «Annulla». No hay cierre al pinchar fuera a proposito: el formulario
  // ocupa la pantalla entera y un clic de mas se llevaria por delante los datos
  // y las firmas ya trazadas, que no se pueden recuperar.
  // sinEscape a proposito. Antes de este cambio, Escape no hacia nada aqui;
  // con el hook pasaba a llamar a onClose, que desmonta el formulario SIN
  // preguntar. O sea que una tecla de mas tiraba un incarico entero con las
  // firmas ya trazadas, que no se pueden recuperar. Es justo el agujero que se
  // evito no poniendo cierre al pinchar el fondo: no tiene sentido cerrar la
  // puerta del raton y dejar abierta la del teclado. Se sale por Annulla o por
  // la X, que estan dentro de la trampa de foco y se alcanzan tabulando.
  const dialogo = useDialog<HTMLDivElement>({ abierto: true, sinEscape: true, alCerrar: onClose });

  return (
    <div
      ref={dialogo.ref}
      {...dialogo.props}
      aria-labelledby="titolo-incarico-esclusiva"
      className="fixed inset-0 z-50 bg-gradient-to-br from-slate-100 via-slate-50 to-violet-50/30 overflow-y-auto outline-none"
    >
      {toast && <div className="fixed top-4 right-4 z-[200] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold bg-slate-900 text-white animate-in slide-in-from-right-5 fade-in duration-200">{toast}</div>}

      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white shadow-lg shadow-violet-600/30"><Star className="h-5 w-5" /></div>
            <div>
              <h1 id="titolo-incarico-esclusiva" className="text-lg font-black text-slate-800 tracking-tight">Incarico d&apos;Esclusiva</h1>
              <p className="text-[11px] text-slate-400 font-bold tracking-wide">Mandato esclusivo — Immobiliare Pantaleo</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Chiudi il modulo" className="h-11 w-11 md:h-10 md:w-10 rounded-full bg-slate-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-400 transition-all"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 pb-36 space-y-6">

        {/* TIPO INCARICO */}
        <SC icon={FileText} title="Tipo di Incarico" badge="Obbligatorio">
          <div className="flex flex-wrap gap-3">
            {TIPO_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => u('tipoIncarico', opt.value)}
                className={cn("relative px-4 md:px-6 py-3.5 rounded-xl text-sm font-bold border-2 transition-all flex items-center gap-2.5 overflow-hidden",
                  form.tipoIncarico === opt.value ? "bg-gradient-to-r text-white border-transparent shadow-lg scale-[1.02]" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:bg-violet-50/50 hover:scale-[1.01]",
                  form.tipoIncarico === opt.value && opt.color
                )}>
                <span className="text-lg">{opt.emoji}</span> {opt.label}
                {form.tipoIncarico === opt.value && <CheckCircle2 className="h-4 w-4 ml-1 opacity-80" />}
              </button>
            ))}
          </div>
        </SC>

        {/* PROPRIETARIO */}
        <SC icon={User} title="Dati del Proprietario" badge="Sezione 2">
          <div className="space-y-4">
            <div className="relative">
              <label htmlFor="escl-cerca-proprietario" className="text-[11px] font-black text-violet-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Cerca proprietario</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-300" />
                <input id="escl-cerca-proprietario" type="text" value={cSearch} onChange={e => searchClienti(e.target.value)} onFocus={() => cResults.length > 0 && setCOpen(true)} placeholder="Digita nome..." className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-violet-100 bg-violet-50/30 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 font-medium text-sm" />
              </div>
              {cOpen && cResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto z-30">
                  {cResults.map((c: any) => (
                    <button key={c.id} onClick={() => selectCliente(c)} className="w-full text-left px-4 py-3 hover:bg-violet-50 text-sm flex items-center gap-3 border-b border-slate-50 last:border-0">
                      <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0"><User className="h-3.5 w-3.5 text-violet-500" /></div>
                      <span className="font-bold text-slate-800">{c.DatiPersonali?.Nome || c.nome} {c.DatiPersonali?.Cognome || c.cognome}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FI label="Nome e Cognome *" htmlFor="escl-proprietarionome"><input id="escl-proprietarionome" type="text" value={form.proprietarioNome} onChange={e => u('proprietarioNome', e.target.value)} className={ic} placeholder="es. Mario Rossi" /></FI>
              <FI label="Codice Fiscale" htmlFor="escl-proprietariocf"><input id="escl-proprietariocf" type="text" value={form.proprietarioCF} onChange={e => u('proprietarioCF', e.target.value)} className={ic} /></FI>
              <FI label="Nato/a a, il" htmlFor="escl-proprietarionascita"><input id="escl-proprietarionascita" type="text" value={form.proprietarioNascita} onChange={e => u('proprietarioNascita', e.target.value)} className={ic} /></FI>
              <FI label="Residente in" htmlFor="escl-proprietarioresidenza"><input id="escl-proprietarioresidenza" type="text" value={form.proprietarioResidenza} onChange={e => u('proprietarioResidenza', e.target.value)} className={ic} /></FI>
              <FI label="Via" htmlFor="escl-proprietariovia"><input id="escl-proprietariovia" type="text" value={form.proprietarioVia} onChange={e => u('proprietarioVia', e.target.value)} className={ic} /></FI>
              <FI label="Telefono" htmlFor="escl-proprietariotel"><input id="escl-proprietariotel" type="tel" value={form.proprietarioTel} onChange={e => u('proprietarioTel', e.target.value)} className={ic} /></FI>
              <FI label="Email" className="md:col-span-2" htmlFor="escl-proprietarioemail"><input id="escl-proprietarioemail" type="email" value={form.proprietarioEmail} onChange={e => u('proprietarioEmail', e.target.value)} className={ic} /></FI>
            </div>
          </div>
        </SC>

        {/* IMMOBILE */}
        <SC icon={Building2} title="Dati Immobile" badge="Sezione 3">
          <div className="space-y-4">
            <div className="relative">
              <label htmlFor="escl-cerca-immobile" className="text-[11px] font-black text-violet-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Cerca immobile</label>
              <div className="relative">
                <Home className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-300" />
                <input id="escl-cerca-immobile" type="text" value={iSearch} onChange={e => searchImmobili(e.target.value)} onFocus={() => iResults.length > 0 && setIOpen(true)} placeholder="Digita indirizzo o codice..." className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-violet-100 bg-violet-50/30 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 font-medium text-sm" />
              </div>
              {iOpen && iResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto z-30">
                  {iResults.map((i: any) => (
                    <button key={i.id} onClick={() => selectImmobile(i)} className="w-full text-left px-4 py-3 hover:bg-violet-50 text-sm flex items-center gap-3 border-b border-slate-50 last:border-0">
                      <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0"><Home className="h-3.5 w-3.5 text-violet-600" /></div>
                      <div><span className="font-bold text-slate-800">{i.DatiBase?.Indirizzo || 'N/A'}</span><span className="text-xs text-slate-400 ml-2">{i.DatiBase?.Citta} — Rif. {i.DatiBase?.Codice}</span></div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FI label="Indirizzo" className="md:col-span-2" htmlFor="escl-indirizzo"><input id="escl-indirizzo" type="text" value={form.indirizzo} onChange={e => u('indirizzo', e.target.value)} className={ic} /></FI>
              <FI label="Città" htmlFor="escl-citta"><input id="escl-citta" type="text" value={form.citta} onChange={e => u('citta', e.target.value)} className={ic} /></FI>
              <FI label="Piano" htmlFor="escl-piano"><input id="escl-piano" type="text" value={form.piano} onChange={e => u('piano', e.target.value)} className={ic} /></FI>
              <FI label="Zona" htmlFor="escl-zona"><input id="escl-zona" type="text" value={form.zona} onChange={e => u('zona', e.target.value)} className={ic} /></FI>
              <FI label="MQ" htmlFor="escl-mq"><input id="escl-mq" type="text" value={form.mq} onChange={e => u('mq', e.target.value)} className={ic} /></FI>
              <FI label="Numero Vani" htmlFor="escl-vani"><input id="escl-vani" type="text" value={form.vani} onChange={e => u('vani', e.target.value)} className={ic} /></FI>
            </div>
          </div>
        </SC>

        {/* CATASTALI */}
        <SC icon={MapPin} title="Dati Catastali Completi" badge="Sezione 4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <FI label="Foglio" htmlFor="escl-foglio"><input id="escl-foglio" type="text" value={form.foglio} onChange={e => u('foglio', e.target.value)} className={ic} /></FI>
            <FI label="Particella" htmlFor="escl-particella"><input id="escl-particella" type="text" value={form.particella} onChange={e => u('particella', e.target.value)} className={ic} /></FI>
            <FI label="Sub" htmlFor="escl-sub"><input id="escl-sub" type="text" value={form.sub} onChange={e => u('sub', e.target.value)} className={ic} /></FI>
            <FI label="Categoria Catastale" htmlFor="escl-categoria"><input id="escl-categoria" type="text" value={form.categoria} onChange={e => u('categoria', e.target.value)} className={ic} placeholder="es. A/2" /></FI>
            <FI label="Valore Catastale (€)" htmlFor="escl-valorecatastale"><input id="escl-valorecatastale" type="text" value={form.valoreCatastale} onChange={e => u('valoreCatastale', e.target.value)} className={ic} /></FI>
            <FI label="Classe Energetica" htmlFor="escl-classeenergetica">
              <select id="escl-classeenergetica" value={form.classeEnergetica} onChange={e => u('classeEnergetica', e.target.value)} className={ic + ' bg-white'}>{CLASSI_EN.map(c => <option key={c} value={c}>{c}</option>)}</select>
            </FI>
          </div>
        </SC>

        {/* CONDIZIONI ESCLUSIVA */}
        <SC icon={Star} title="Condizioni dell'Esclusiva" badge="Sezione 5">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FI label="Richiesta (€) *" htmlFor="escl-richiesta"><input id="escl-richiesta" type="number" value={form.richiesta} onChange={e => u('richiesta', e.target.value)} className={ic} placeholder="es. 150000" /></FI>
              <FI label="Durata Esclusiva" htmlFor="escl-durataesclusiva">
                <select id="escl-durataesclusiva" value={form.durataEsclusiva} onChange={e => u('durataEsclusiva', e.target.value)} className={ic + ' bg-white'}>{DURATE.map(d => <option key={d} value={d}>{d}</option>)}</select>
              </FI>
              <FI label="Provvigione (%)" htmlFor="escl-provvigionepercent"><input id="escl-provvigionepercent" type="number" value={form.provvigionePercent} onChange={e => u('provvigionePercent', e.target.value)} className={ic} /></FI>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FI label="Data Inizio" htmlFor="escl-datainizio"><input id="escl-datainizio" type="date" value={form.dataInizio} onChange={e => u('dataInizio', e.target.value)} className={ic} /></FI>
              <FI label="Data Fine" htmlFor="escl-datafine"><input id="escl-datafine" type="date" value={form.dataFine} onChange={e => u('dataFine', e.target.value)} className={ic} /></FI>
              <FI label="IVA (%)" htmlFor="escl-provvigioneiva"><input id="escl-provvigioneiva" type="number" value={form.provvigioneIva} onChange={e => u('provvigioneIva', e.target.value)} className={ic} /></FI>
            </div>
            {form.richiesta && (
              <div className="p-3 rounded-xl bg-violet-50/60 border border-violet-100">
                <p className="text-xs text-violet-700 font-semibold">⭐ Prezzo richiesto: €{Number(form.richiesta).toLocaleString('it-IT')} — Provvigione: {form.provvigionePercent}% + IVA {form.provvigioneIva}% — Durata: {form.durataEsclusiva}</p>
              </div>
            )}
            <FI label="Note" htmlFor="escl-note"><textarea id="escl-note" value={form.note} onChange={e => u('note', e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 font-medium text-sm resize-none placeholder:text-slate-300" placeholder="Condizioni particolari..." /></FI>
          </div>
        </SC>

        {/* PRIVACY & FIRME */}
        <SC icon={ShieldCheck} title="Firme e Privacy" badge="Obbligatorio">
          <div className="space-y-6">
            <div className={cn("p-4 rounded-xl border-2 transition-all", form.privacyAccepted ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-slate-50/50")}>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className={cn("mt-0.5 h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0", form.privacyAccepted ? "bg-emerald-600 border-emerald-600" : "border-slate-300 group-hover:border-violet-400")}>{form.privacyAccepted && <CheckCircle2 className="h-4 w-4 text-white" />}</div>
                <input type="checkbox" checked={form.privacyAccepted} onChange={e => u('privacyAccepted', e.target.checked)} className="sr-only" />
                <div><span className="text-sm font-bold text-slate-700">Autorizzazione privacy *</span><p className="text-xs text-slate-400 mt-1">D.Lgs. 196/2003 e GDPR UE 2016/679.</p></div>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SignaturePad
                title="Firma Agente"
                value={form.firmaAgente}
                onSave={(b64) => { u('firmaAgente', b64); }}
                onClear={() => u('firmaAgente', '')}
              />
              <SignaturePad
                title="Firma Proprietario"
                value={form.firmaCliente}
                onSave={(b64) => { u('firmaCliente', b64); }}
                onClear={() => u('firmaCliente', '')}
              />
            </div>
          </div>
        </SC>
      </div>

      {/* STICKY FOOTER */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4">
          <button onClick={onClose} className="px-4 md:px-6 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-500 font-bold hover:bg-slate-50 transition-all text-sm">Annulla</button>
          <div className="flex items-center gap-3">
            <button onClick={handleGeneratePdf} disabled={generating} className="px-4 md:px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 text-white font-bold shadow-lg shadow-violet-600/25 hover:scale-[1.02] transition-all flex items-center gap-2 text-sm disabled:opacity-50">{generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</> : <><Printer className="h-4 w-4" /> Stampa PDF</>}</button>
            <button onClick={() => {
              const docName = "Incarico d'Esclusiva";
              const nome = form.proprietarioNome || 'Cliente';
              const msg = `Gentile ${nome}, ecco il documento "${docName}" pronto per la revisione. La preghiamo di verificare i dati inseriti. Cordiali saluti, Immobiliare Pantaleo.`;
              const tel = (form.proprietarioTel || '').replace(/\D/g, '');
              const url = tel ? `https://wa.me/${tel.startsWith('39') ? tel : '39' + tel}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
              window.open(url, '_blank');
            }} className="px-4 md:px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/25 hover:scale-[1.02] transition-all flex items-center gap-2 text-sm"><Send className="h-4 w-4" /> WhatsApp</button>
            <button onClick={async () => {
              if (!form.proprietarioNome) { setToast('⚠️ Compila almeno il nome'); return; }
              if (!form.privacyAccepted) { setToast('⚠️ Accetta la privacy'); return; }
              if (!form.indirizzo?.trim()) { setToast('⚠️ Inserisci l\'indirizzo dell\'immobile'); return; }
              if (!form.richiesta || Number(form.richiesta) <= 0) { setToast('⚠️ Inserisci il prezzo richiesto'); return; }
              if (form.dataInizio && form.dataFine && form.dataInizio >= form.dataFine) { setToast('⚠️ Data di fine deve essere successiva alla data di inizio'); return; }
              setSaving(true);
              try {
                const { default: Doc } = await import('@/components/pdf/templates/IncaricoEsclusiva');
                const { saveDocumentToCloud } = await import('@/lib/saveDocumentToCloud');
                const React = (await import('react'));
                const docEl = React.createElement(Doc, { data: form } as any);
                const result = await saveDocumentToCloud({ 
                  docElement: docEl, 
                  nomeFile: `Incarico Esclusiva - ${form.proprietarioNome}`, 
                  categoria: 'Incarico Esclusiva', 
                  clienteNome: form.proprietarioNome,
                  sezione,
                  azione,
                  documentoId,
                  urlExistente
                });
                if (result.success) { setToast('✅ Documento salvato in Cloud!'); setTimeout(() => onClose(), 1200); }
                else { setToast(`❌ ${result.error}`); }
              } catch (e: any) { setToast(`❌ Errore: ${e.message}`); }
              finally { setSaving(false); }
            }} disabled={saving} className="px-4 md:px-6 py-3 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-white font-bold shadow-lg hover:scale-[1.02] transition-all flex items-center gap-2 text-sm disabled:opacity-50">{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : <><Save className="h-4 w-4" /> Salva</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
