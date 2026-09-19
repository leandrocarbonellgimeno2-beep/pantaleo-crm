'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useDialog } from "@/hooks/useDialog";
import {
  X, Search, User, Home, Percent, ShieldCheck, Printer, Send, Save, Loader2,
  FileText, CheckCircle2, Sparkles, Building2, CreditCard, MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import SignaturePad from '@/components/ui/SignaturePad';

/* ═══ Shared UI blocks ═══ */
function SC({ icon: Icon, title, badge, children }: { icon: any; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center"><Icon className="h-3.5 w-3.5 text-indigo-600" /></div>
          {title}
        </h2>
        {badge && <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-wider">{badge}</span>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
function FI({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}><label htmlFor={htmlFor} className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{label}</label>{children}</div>;
}
const ic = "w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-medium text-sm text-slate-800 transition-all placeholder:text-slate-300";

interface Props {
  onClose: () => void;
  sezione: string;
  azione: string;
  initialData?: Record<string, any>;
}

export default function IncaricoLocazioneForm({ onClose, sezione, azione, initialData }: Props) {
  const [form, setForm] = useState(() => ({
    /* Locatore */
    locatoreNome: '', locatoreCF: '', locatoreNascita: '', locatoreResidenza: '', locatoreVia: '',
    locatoreTel: '', locatoreEmail: '', locatoreProfessione: '',
    /* Conduttore */
    conduttoreNome: '', conduttoreCF: '', conduttoreNascita: '', conduttoreResidenza: '', conduttoreVia: '',
    conduttoreTel: '', conduttoreEmail: '', conduttoreProfessione: '', conduttoreReddito: '',
    /* Immobile */
    tipologiaImmobile: 'appartamento' as string,
    indirizzo: '', citta: '', piano: '', scala: '', interno: '',
    /* Catastali */
    foglio: '', particella: '', sub: '', valoreCatastale: '', classeEnergetica: 'G',
    /* Condizioni */
    prezzoRichiesto: '', condominio: '', cauzione: '', mesiAnticipati: '1',
    durataContratto: '4+4', dataDisponibilita: '',
    arredato: false, garageIncluso: false, note: '',
    /* Mediazione */
    mediazioneTipo: 'contanti' as string,
    mediazioneImporto: '', mediazioneIva: '22',
    /* Privacy & Firme */
    privacyAccepted: false, firmaAgente: '', firmaCliente: '',
    ...initialData,
  }));
  const [toast, setToast] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Client search */
  const [cSearch, setCSearch] = useState('');
  const [cResults, setCResults] = useState<any[]>([]);
  const [cOpen, setCOpen] = useState(false);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

  useEffect(() => {
    import('@react-pdf/renderer').catch(() => {});
    import('@/components/pdf/templates/IncaricoLocazione').catch(() => {});
    import('@/lib/saveDocumentToCloud').catch(() => {});
  }, []);

  // El padre solo monta este formulario cuando toca abrirlo, asi que estar
  // renderizandose ya significa abierto. Sin cierre al pinchar fuera: es un
  // formulario largo y un clic despistado se llevaria por delante todo lo
  // escrito; Escape basta, y va al mismo `onClose` que el boton Annulla.
  const dialogo = useDialog<HTMLDivElement>({
    abierto: true,
    alCerrar: onClose,
  });

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

  const selectCliente = (c: any, target: 'locatore' | 'conduttore') => {
    const nome = `${c.DatiPersonali?.Nome || c.nome || ''} ${c.DatiPersonali?.Cognome || c.cognome || ''}`.trim();
    const citta = c.DatiPersonali?.CittaResidenza || '';
    const via = c.DatiPersonali?.IndirizzoResidenza || '';
    const tel = c.DatiPersonali?.Telefono || '';
    const email = c.DatiPersonali?.Email || '';
    const cf = c.DatiPersonali?.CodiceFiscale || '';
    const nascita = c.DatiPersonali?.LuogoDiNascita ? `${c.DatiPersonali.LuogoDiNascita}${c.DatiPersonali?.DataDiNascita ? ', ' + c.DatiPersonali.DataDiNascita : ''}` : '';
    const professione = c.DatiPersonali?.Professione || '';
    if (target === 'locatore') {
      setForm(p => ({ ...p, locatoreNome: nome, locatoreResidenza: citta, locatoreVia: via, locatoreTel: tel, locatoreEmail: email, locatoreCF: cf, locatoreNascita: nascita, locatoreProfessione: professione }));
    } else {
      setForm(p => ({ ...p, conduttoreNome: nome, conduttoreResidenza: citta, conduttoreVia: via, conduttoreTel: tel, conduttoreEmail: email, conduttoreCF: cf, conduttoreNascita: nascita, conduttoreProfessione: professione }));
    }
    setCSearch(nome); setCOpen(false); setCResults([]);
  };

  const u = (f: string, v: any) => setForm(p => ({ ...p, [f]: v }));

  const handleGeneratePdf = async () => {
    if (!form.locatoreNome) { setToast('⚠️ Compila almeno il nome del locatore'); return; }
    if (!form.privacyAccepted) { setToast('⚠️ Accetta l\'informativa privacy'); return; }
    if (!form.indirizzo?.trim()) { setToast('⚠️ Inserisci l\'indirizzo dell\'immobile'); return; }
    if (!form.prezzoRichiesto || Number(form.prezzoRichiesto) <= 0) { setToast('⚠️ Inserisci il prezzo di locazione'); return; }
    setGenerating(true);
    try {
      const [{ pdf }, { default: Doc }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf/templates/IncaricoLocazione'),
      ]);
      const blob = await pdf(React.createElement(Doc, { data: form } as any) as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `Incarico_Locazione_${form.locatoreNome.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast('✅ PDF generato e scaricato!');
    } catch (e: any) { console.error(e); setToast(`❌ Errore: ${e.message}`); }
    finally { setGenerating(false); }
  };

  const TIPOLOGIE = ['Appartamento', 'Villa', 'Villetta', 'Attico', 'Monolocale', 'Bilocale', 'Ufficio', 'Negozio', 'Box/Garage', 'Altro'];
  const CLASSI_EN = ['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'];
  const DURATE = ['4+4', '3+2', '6+6', 'Transitorio', 'Stagionale', 'Concordato', 'Altro'];
  const PAGAMENTI = [
    { value: 'contanti', label: 'Contanti', icon: '💵' },
    { value: 'assegno', label: 'Assegno', icon: '📝' },
    { value: 'pos', label: 'POS', icon: '💳' },
    { value: 'bonifico', label: 'Bonifico', icon: '🏦' },
  ];

  return (
    <div
      ref={dialogo.ref}
      {...dialogo.props}
      aria-labelledby="titolo-incarico-locazione"
      className="fixed inset-0 z-50 bg-gradient-to-br from-slate-100 via-slate-50 to-emerald-50/30 overflow-y-auto outline-none"
    >
      {toast && <div className="fixed top-4 right-4 z-[200] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold bg-slate-900 text-white animate-in slide-in-from-right-5 fade-in duration-200">{toast}</div>}

      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 id="titolo-incarico-locazione" className="text-lg font-black text-slate-800 tracking-tight">Incarico di Locazione</h1>
              <p className="text-[11px] text-slate-400 font-bold tracking-wide">Impegnativa d&apos;affitto — Immobiliare Pantaleo</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Chiudi il modulo" className="h-10 w-10 rounded-full bg-slate-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-400 transition-all"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 pb-36 space-y-6">

        {/* ═══ LOCATORE ═══ */}
        <SC icon={User} title="Dati del Locatore (Proprietario)" badge="Sezione 1">
          <div className="space-y-4">
            <div className="relative">
              <label htmlFor="loc-cerca-proprietario" className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Cerca proprietario</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-300" />
                <input id="loc-cerca-proprietario" type="text" value={cSearch} onChange={e => searchClienti(e.target.value)} onFocus={() => cResults.length > 0 && setCOpen(true)} placeholder="Digita nome proprietario..." className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-indigo-100 bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-medium text-sm" />
              </div>
              {cOpen && cResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto z-30">
                  {cResults.map((c: any) => (
                    <button key={c.id} onClick={() => selectCliente(c, 'locatore')} className="w-full text-left px-4 py-3 hover:bg-indigo-50 text-sm flex items-center gap-3 border-b border-slate-50 last:border-0 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0"><User className="h-3.5 w-3.5 text-indigo-500" /></div>
                      <span className="font-bold text-slate-800">{c.DatiPersonali?.Nome || c.nome} {c.DatiPersonali?.Cognome || c.cognome}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FI label="Nome e Cognome *" htmlFor="loc-locatorenome"><input id="loc-locatorenome" type="text" value={form.locatoreNome} onChange={e => u('locatoreNome', e.target.value)} className={ic} placeholder="es. Mario Rossi" /></FI>
              <FI label="Codice Fiscale" htmlFor="loc-locatorecf"><input id="loc-locatorecf" type="text" value={form.locatoreCF} onChange={e => u('locatoreCF', e.target.value)} className={ic} placeholder="RSSMRA80A01..." /></FI>
              <FI label="Nato/a a, il" htmlFor="loc-locatorenascita"><input id="loc-locatorenascita" type="text" value={form.locatoreNascita} onChange={e => u('locatoreNascita', e.target.value)} className={ic} placeholder="es. Marsala, 01/01/1980" /></FI>
              <FI label="Residente in" htmlFor="loc-locatoreresidenza"><input id="loc-locatoreresidenza" type="text" value={form.locatoreResidenza} onChange={e => u('locatoreResidenza', e.target.value)} className={ic} placeholder="es. Marsala (TP)" /></FI>
              <FI label="Via" htmlFor="loc-locatorevia"><input id="loc-locatorevia" type="text" value={form.locatoreVia} onChange={e => u('locatoreVia', e.target.value)} className={ic} placeholder="es. Via Roma 23" /></FI>
              <FI label="Telefono" htmlFor="loc-locatoretel"><input id="loc-locatoretel" type="tel" value={form.locatoreTel} onChange={e => u('locatoreTel', e.target.value)} className={ic} placeholder="+39 333..." /></FI>
              <FI label="Email" htmlFor="loc-locatoreemail"><input id="loc-locatoreemail" type="email" value={form.locatoreEmail} onChange={e => u('locatoreEmail', e.target.value)} className={ic} placeholder="email@esempio.it" /></FI>
              <FI label="Professione" htmlFor="loc-locatoreprofessione"><input id="loc-locatoreprofessione" type="text" value={form.locatoreProfessione} onChange={e => u('locatoreProfessione', e.target.value)} className={ic} placeholder="es. Libero professionista" /></FI>
            </div>
          </div>
        </SC>

        {/* ═══ CONDUTTORE ═══ */}
        <SC icon={User} title="Dati del Conduttore (Inquilino)" badge="Sezione 2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FI label="Nome e Cognome *" htmlFor="loc-conduttorenome"><input id="loc-conduttorenome" type="text" value={form.conduttoreNome} onChange={e => u('conduttoreNome', e.target.value)} className={ic} placeholder="es. Luigi Bianchi" /></FI>
            <FI label="Codice Fiscale" htmlFor="loc-conduttorecf"><input id="loc-conduttorecf" type="text" value={form.conduttoreCF} onChange={e => u('conduttoreCF', e.target.value)} className={ic} placeholder="BNCLGU85..." /></FI>
            <FI label="Nato/a a, il" htmlFor="loc-conduttorenascita"><input id="loc-conduttorenascita" type="text" value={form.conduttoreNascita} onChange={e => u('conduttoreNascita', e.target.value)} className={ic} placeholder="es. Trapani, 15/06/1985" /></FI>
            <FI label="Residente in" htmlFor="loc-conduttoreresidenza"><input id="loc-conduttoreresidenza" type="text" value={form.conduttoreResidenza} onChange={e => u('conduttoreResidenza', e.target.value)} className={ic} placeholder="es. Trapani (TP)" /></FI>
            <FI label="Via" htmlFor="loc-conduttorevia"><input id="loc-conduttorevia" type="text" value={form.conduttoreVia} onChange={e => u('conduttoreVia', e.target.value)} className={ic} placeholder="es. Via Garibaldi 10" /></FI>
            <FI label="Telefono" htmlFor="loc-conduttoretel"><input id="loc-conduttoretel" type="tel" value={form.conduttoreTel} onChange={e => u('conduttoreTel', e.target.value)} className={ic} placeholder="+39 320..." /></FI>
            <FI label="Email" htmlFor="loc-conduttoreemail"><input id="loc-conduttoreemail" type="email" value={form.conduttoreEmail} onChange={e => u('conduttoreEmail', e.target.value)} className={ic} placeholder="email@esempio.it" /></FI>
            <FI label="Professione" htmlFor="loc-conduttoreprofessione"><input id="loc-conduttoreprofessione" type="text" value={form.conduttoreProfessione} onChange={e => u('conduttoreProfessione', e.target.value)} className={ic} placeholder="es. Impiegato" /></FI>
            <FI label="Reddito Annuo (€)" className="md:col-span-2" htmlFor="loc-conduttorereddito"><input id="loc-conduttorereddito" type="text" value={form.conduttoreReddito} onChange={e => u('conduttoreReddito', e.target.value)} className={ic} placeholder="es. 25.000" /></FI>
          </div>
        </SC>

        {/* ═══ IMMOBILE ═══ */}
        <SC icon={Building2} title="Tipologia e Ubicazione Immobile" badge="Sezione 3">
          <div className="space-y-5">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2.5 block">Tipologia</label>
              <div className="flex flex-wrap gap-2">
                {TIPOLOGIE.map(t => (
                  <button key={t} onClick={() => u('tipologiaImmobile', t.toLowerCase())} className={cn("px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all", form.tipologiaImmobile === t.toLowerCase() ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300")}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FI label="Indirizzo *" className="md:col-span-2" htmlFor="loc-indirizzo"><input id="loc-indirizzo" type="text" value={form.indirizzo} onChange={e => u('indirizzo', e.target.value)} className={ic} placeholder="es. Via Roma 23" /></FI>
              <FI label="Città" htmlFor="loc-citta"><input id="loc-citta" type="text" value={form.citta} onChange={e => u('citta', e.target.value)} className={ic} placeholder="es. Marsala" /></FI>
              <FI label="Piano" htmlFor="loc-piano"><input id="loc-piano" type="text" value={form.piano} onChange={e => u('piano', e.target.value)} className={ic} placeholder="es. 3°" /></FI>
              <FI label="Scala" htmlFor="loc-scala"><input id="loc-scala" type="text" value={form.scala} onChange={e => u('scala', e.target.value)} className={ic} placeholder="es. A" /></FI>
              <FI label="Interno" htmlFor="loc-interno"><input id="loc-interno" type="text" value={form.interno} onChange={e => u('interno', e.target.value)} className={ic} placeholder="es. 12" /></FI>
            </div>
          </div>
        </SC>

        {/* ═══ DATI CATASTALI ═══ */}
        <SC icon={MapPin} title="Dati Catastali" badge="Sezione 4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <FI label="Foglio" htmlFor="loc-foglio"><input id="loc-foglio" type="text" value={form.foglio} onChange={e => u('foglio', e.target.value)} className={ic} placeholder="—" /></FI>
            <FI label="Particella" htmlFor="loc-particella"><input id="loc-particella" type="text" value={form.particella} onChange={e => u('particella', e.target.value)} className={ic} placeholder="—" /></FI>
            <FI label="Sub" htmlFor="loc-sub"><input id="loc-sub" type="text" value={form.sub} onChange={e => u('sub', e.target.value)} className={ic} placeholder="—" /></FI>
            <FI label="Valore Catastale (€)" htmlFor="loc-valorecatastale"><input id="loc-valorecatastale" type="text" value={form.valoreCatastale} onChange={e => u('valoreCatastale', e.target.value)} className={ic} placeholder="—" /></FI>
            <FI label="Classe Energetica" className="col-span-2" htmlFor="loc-classeenergetica">
              <select id="loc-classeenergetica" value={form.classeEnergetica} onChange={e => u('classeEnergetica', e.target.value)} className={ic + ' bg-white'}>
                {CLASSI_EN.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FI>
          </div>
        </SC>

        {/* ═══ CONDIZIONI ═══ */}
        <SC icon={Percent} title="Condizioni di Locazione" badge="Sezione 5">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FI label="Prezzo Richiesto (€/mese) *" htmlFor="loc-prezzorichiesto"><input id="loc-prezzorichiesto" type="number" value={form.prezzoRichiesto} onChange={e => u('prezzoRichiesto', e.target.value)} className={ic} placeholder="es. 500" /></FI>
              <FI label="Spese Condominio (€/mese)" htmlFor="loc-condominio"><input id="loc-condominio" type="number" value={form.condominio} onChange={e => u('condominio', e.target.value)} className={ic} placeholder="es. 50" /></FI>
              <FI label="Cauzione (mesi)" htmlFor="loc-cauzione"><input id="loc-cauzione" type="number" value={form.cauzione} onChange={e => u('cauzione', e.target.value)} className={ic} placeholder="es. 2" /></FI>
              <FI label="Mesi Anticipati" htmlFor="loc-mesianticipati"><input id="loc-mesianticipati" type="number" value={form.mesiAnticipati} onChange={e => u('mesiAnticipati', e.target.value)} className={ic} placeholder="1" /></FI>
              <FI label="Durata Contratto" htmlFor="loc-duratacontratto">
                <select id="loc-duratacontratto" value={form.durataContratto} onChange={e => u('durataContratto', e.target.value)} className={ic + ' bg-white'}>
                  {DURATE.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </FI>
              <FI label="Data Disponibilità" htmlFor="loc-datadisponibilita"><input id="loc-datadisponibilita" type="date" value={form.dataDisponibilita} onChange={e => u('dataDisponibilita', e.target.value)} className={ic} /></FI>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.arredato} onChange={e => u('arredato', e.target.checked)} className="sr-only peer" />
                <div className={cn("h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all", form.arredato ? "bg-indigo-600 border-indigo-600" : "border-slate-300")}>{form.arredato && <CheckCircle2 className="h-3 w-3 text-white" />}</div>
                <span className="text-sm font-bold text-slate-700">Arredato</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.garageIncluso} onChange={e => u('garageIncluso', e.target.checked)} className="sr-only peer" />
                <div className={cn("h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all", form.garageIncluso ? "bg-indigo-600 border-indigo-600" : "border-slate-300")}>{form.garageIncluso && <CheckCircle2 className="h-3 w-3 text-white" />}</div>
                <span className="text-sm font-bold text-slate-700">Garage incluso</span>
              </label>
            </div>
            <FI label="Note aggiuntive" htmlFor="loc-note"><textarea id="loc-note" value={form.note} onChange={e => u('note', e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 font-medium text-sm resize-none placeholder:text-slate-300" placeholder="Eventuali note o condizioni particolari..." /></FI>
          </div>
        </SC>

        {/* ═══ MEDIAZIONE ═══ */}
        <SC icon={CreditCard} title="Pagamento Mediazione" badge="Sezione 6">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {PAGAMENTI.map(p => (
                <button key={p.value} onClick={() => u('mediazioneTipo', p.value)} className={cn("px-5 py-3 rounded-xl text-sm font-bold border-2 transition-all flex items-center gap-2", form.mediazioneTipo === p.value ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300")}>
                  <span className="text-base">{p.icon}</span> {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FI label="Importo Mediazione (€)" htmlFor="loc-mediazioneimporto"><input id="loc-mediazioneimporto" type="number" value={form.mediazioneImporto} onChange={e => u('mediazioneImporto', e.target.value)} className={ic} placeholder="es. 500" /></FI>
              <FI label="IVA (%)" htmlFor="loc-mediazioneiva"><input id="loc-mediazioneiva" type="number" value={form.mediazioneIva} onChange={e => u('mediazioneIva', e.target.value)} className={ic} placeholder="22" /></FI>
            </div>
          </div>
        </SC>

        {/* ═══ PRIVACY & FIRME ═══ */}
        <SC icon={ShieldCheck} title="Firme e Privacy" badge="Obbligatorio">
          <div className="space-y-6">
            <div className={cn("p-4 rounded-xl border-2 transition-all", form.privacyAccepted ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-slate-50/50")}>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className={cn("mt-0.5 h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0", form.privacyAccepted ? "bg-emerald-600 border-emerald-600" : "border-slate-300 group-hover:border-indigo-400")}>{form.privacyAccepted && <CheckCircle2 className="h-4 w-4 text-white" />}</div>
                <input type="checkbox" checked={form.privacyAccepted} onChange={e => u('privacyAccepted', e.target.checked)} className="sr-only" />
                <div><span className="text-sm font-bold text-slate-700">Autorizzazione al trattamento dei dati personali *</span><p className="text-xs text-slate-400 mt-1">Ai sensi del D.Lgs. 196/2003 e GDPR UE 2016/679.</p></div>
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
                title="Firma Cliente"
                value={form.firmaCliente}
                onSave={(b64) => { u('firmaCliente', b64); }}
                onClear={() => u('firmaCliente', '')}
              />
            </div>
          </div>
        </SC>
      </div>

      {/* ═══ STICKY FOOTER ═══ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4">
          <button onClick={onClose} className="px-4 md:px-6 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-500 font-bold hover:bg-slate-50 transition-all text-sm">Annulla</button>
          <div className="flex items-center gap-3">
            <button onClick={handleGeneratePdf} disabled={generating} className="px-4 md:px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/25 hover:scale-[1.02] transition-all flex items-center gap-2 text-sm disabled:opacity-50">{generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</> : <><Printer className="h-4 w-4" /> Stampa PDF</>}</button>
            <button onClick={() => {
              const docName = "Incarico di Locazione";
              const nome = form.locatoreNome || 'Cliente';
              const msg = `Gentile ${nome}, ecco il documento "${docName}" pronto per la revisione. La preghiamo di verificare i dati inseriti. Cordiali saluti, Immobiliare Pantaleo.`;
              const tel = (form.locatoreTel || '').replace(/\D/g, '');
              const url = tel ? `https://wa.me/${tel.startsWith('39') ? tel : '39' + tel}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
              window.open(url, '_blank');
            }} className="px-4 md:px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/25 hover:scale-[1.02] transition-all flex items-center gap-2 text-sm"><Send className="h-4 w-4" /> WhatsApp</button>
            <button onClick={async () => {
              if (!form.locatoreNome) { setToast('⚠️ Compila almeno il nome'); return; }
              if (!form.privacyAccepted) { setToast('⚠️ Accetta la privacy'); return; }
              if (!form.indirizzo?.trim()) { setToast('⚠️ Inserisci l\'indirizzo dell\'immobile'); return; }
              if (!form.prezzoRichiesto || Number(form.prezzoRichiesto) <= 0) { setToast('⚠️ Inserisci il prezzo di locazione'); return; }
              setSaving(true);
              try {
                const { default: Doc } = await import('@/components/pdf/templates/IncaricoLocazione');
                const { saveDocumentToCloud } = await import('@/lib/saveDocumentToCloud');
                const React = (await import('react'));
                const docEl = React.createElement(Doc, { data: form } as any);
                const result = await saveDocumentToCloud({ 
                  docElement: docEl, 
                  nomeFile: `Incarico Locazione - ${form.locatoreNome}`, 
                  categoria: 'Incarico Locazione', 
                  clienteNome: form.locatoreNome,
                  sezione,
                  azione
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
