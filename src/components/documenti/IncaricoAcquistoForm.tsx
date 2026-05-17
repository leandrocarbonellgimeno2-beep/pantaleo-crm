'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  X, Search, User, Home, Percent, ShieldCheck, Printer, Send, Save, Loader2,
  FileText, CheckCircle2, Sparkles, Building2, MapPin, CalendarDays
} from 'lucide-react';
import { cn } from '@/lib/utils';
import SignaturePad from '@/components/ui/SignaturePad';

function SC({ icon: Icon, title, badge, children }: { icon: any; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white flex items-center justify-between">
        <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center"><Icon className="h-3.5 w-3.5 text-emerald-600" /></div>
          {title}
        </h2>
        {badge && <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider">{badge}</span>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
function FI({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{label}</label>{children}</div>;
}
const ic = "w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 font-medium text-sm text-slate-800 transition-all placeholder:text-slate-300";

interface Props {
  onClose: () => void;
  sezione: string;
  azione: string;
  initialData?: Record<string, any>;
}

export default function IncaricoAcquistoForm({ onClose, sezione, azione, initialData }: Props) {
  const [form, setForm] = useState(() => ({
    /* Acquirente */
    acquirenteNome: '', acquirenteCF: '', acquirenteNascita: '', acquirenteResidenza: '', acquirenteVia: '',
    acquirenteTel: '', acquirenteEmail: '',
    /* Immobile */
    tipologiaImmobile: 'appartamento',
    indirizzo: '', citta: '', piano: '', zona: '',
    /* Catastali */
    foglio: '', particella: '', sub: '', valoreCatastale: '', classeEnergetica: 'G',
    /* Acquisto */
    prezzoAcquisto: '', accontoPrelim: '', saldoRogito: '',
    stipulaEntro: '', condizioniMutuo: false, note: '',
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
    import('@/components/pdf/templates/IncaricoAcquisto').catch(() => {});
    import('@/lib/saveDocumentToCloud').catch(() => {});
  }, []);

  const searchClienti = useCallback(async (q: string) => {
    setCSearch(q);
    if (q.length < 2) { setCResults([]); setCOpen(false); return; }
    try { const r = await fetch(`/api/clienti?q=${encodeURIComponent(q)}&limit=6`); const d = await r.json(); setCResults(Array.isArray(d) ? d : []); setCOpen(true); } catch { setCResults([]); }
  }, []);

  const selectCliente = (c: any) => {
    const nome = `${c.DatiPersonali?.Nome || c.nome || ''} ${c.DatiPersonali?.Cognome || c.cognome || ''}`.trim();
    const cf = c.DatiPersonali?.CodiceFiscale || '';
    const nascita = c.DatiPersonali?.LuogoDiNascita ? `${c.DatiPersonali.LuogoDiNascita}${c.DatiPersonali?.DataDiNascita ? ', ' + c.DatiPersonali.DataDiNascita : ''}` : '';
    setForm(p => ({ ...p, acquirenteNome: nome, acquirenteResidenza: c.DatiPersonali?.CittaResidenza || '', acquirenteVia: c.DatiPersonali?.IndirizzoResidenza || '', acquirenteTel: c.DatiPersonali?.Telefono || '', acquirenteEmail: c.DatiPersonali?.Email || '', acquirenteCF: cf, acquirenteNascita: nascita }));
    setCSearch(nome); setCOpen(false);
  };

  const searchImmobili = useCallback(async (q: string) => {
    setISearch(q);
    if (q.length < 2) { setIResults([]); setIOpen(false); return; }
    try { const r = await fetch(`/api/immobili?q=${encodeURIComponent(q)}&limit=6`); const d = await r.json(); const items = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []); setIResults(items); setIOpen(true); } catch { setIResults([]); }
  }, []);

  const selectImmobile = (i: any) => {
    setForm(p => ({ ...p, indirizzo: i.DatiBase?.Indirizzo || '', citta: i.DatiBase?.Citta || '', zona: i.DatiBase?.Zona || '', tipologiaImmobile: (i.DatiBase?.Tipologia || 'appartamento').toLowerCase() }));
    setISearch(`${i.DatiBase?.Indirizzo || ''}, ${i.DatiBase?.Citta || ''}`); setIOpen(false);
  };

  const u = (f: string, v: any) => setForm(p => ({ ...p, [f]: v }));
  const CLASSI_EN = ['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'];

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const handleGeneratePdf = async () => {
    if (!form.acquirenteNome) { setToast('⚠️ Compila almeno il nome dell\'acquirente'); return; }
    if (!form.privacyAccepted) { setToast('⚠️ Accetta l\'informativa privacy'); return; }
    if (!form.prezzoAcquisto || Number(form.prezzoAcquisto) <= 0) { setToast('⚠️ Inserisci il prezzo di acquisto'); return; }
    setGenerating(true);
    try {
      const [{ pdf }, { default: Doc }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf/templates/IncaricoAcquisto'),
      ]);
      const blob = await pdf(React.createElement(Doc, { data: form } as any) as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `Impegnativa_Acquisto_${form.acquirenteNome.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast('✅ PDF generato e scaricato!');
    } catch (e: any) { console.error(e); setToast(`❌ Errore: ${e.message}`); }
    finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-100 via-slate-50 to-emerald-50/20 overflow-y-auto">
      {toast && <div className="fixed top-4 right-4 z-[200] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold bg-slate-900 text-white animate-in slide-in-from-right-5 fade-in duration-200">{toast}</div>}

      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30"><FileText className="h-5 w-5" /></div>
            <div>
              <h1 className="text-lg font-black text-slate-800 tracking-tight">Impegnativa d&apos;Acquisto</h1>
              <p className="text-[11px] text-slate-400 font-bold tracking-wide">Incarico per acquisto immobile — Immobiliare Pantaleo</p>
            </div>
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-full bg-slate-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-400 transition-all"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 pb-36 space-y-6">

        {/* ACQUIRENTE */}
        <SC icon={User} title="Dati dell'Acquirente" badge="Sezione 1">
          <div className="space-y-4">
            <div className="relative">
              <label className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Cerca cliente</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-300" />
                <input type="text" value={cSearch} onChange={e => searchClienti(e.target.value)} onFocus={() => cResults.length > 0 && setCOpen(true)} placeholder="Digita nome..." className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-emerald-100 bg-emerald-50/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 font-medium text-sm" />
              </div>
              {cOpen && cResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto z-30">
                  {cResults.map((c: any) => (
                    <button key={c.id} onClick={() => selectCliente(c)} className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-sm flex items-center gap-3 border-b border-slate-50 last:border-0">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><User className="h-3.5 w-3.5 text-emerald-500" /></div>
                      <span className="font-bold text-slate-800">{c.DatiPersonali?.Nome || c.nome} {c.DatiPersonali?.Cognome || c.cognome}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FI label="Nome e Cognome *"><input type="text" value={form.acquirenteNome} onChange={e => u('acquirenteNome', e.target.value)} className={ic} placeholder="es. Mario Rossi" /></FI>
              <FI label="Codice Fiscale"><input type="text" value={form.acquirenteCF} onChange={e => u('acquirenteCF', e.target.value)} className={ic} /></FI>
              <FI label="Nato/a a, il"><input type="text" value={form.acquirenteNascita} onChange={e => u('acquirenteNascita', e.target.value)} className={ic} /></FI>
              <FI label="Residente in"><input type="text" value={form.acquirenteResidenza} onChange={e => u('acquirenteResidenza', e.target.value)} className={ic} /></FI>
              <FI label="Via"><input type="text" value={form.acquirenteVia} onChange={e => u('acquirenteVia', e.target.value)} className={ic} /></FI>
              <FI label="Telefono"><input type="tel" value={form.acquirenteTel} onChange={e => u('acquirenteTel', e.target.value)} className={ic} /></FI>
              <FI label="Email" className="md:col-span-2"><input type="email" value={form.acquirenteEmail} onChange={e => u('acquirenteEmail', e.target.value)} className={ic} /></FI>
            </div>
          </div>
        </SC>

        {/* IMMOBILE */}
        <SC icon={Building2} title="Dati Immobile" badge="Sezione 2">
          <div className="space-y-4">
            <div className="relative">
              <label className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Cerca immobile</label>
              <div className="relative">
                <Home className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-300" />
                <input type="text" value={iSearch} onChange={e => searchImmobili(e.target.value)} onFocus={() => iResults.length > 0 && setIOpen(true)} placeholder="Digita indirizzo o codice..." className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-emerald-100 bg-emerald-50/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 font-medium text-sm" />
              </div>
              {iOpen && iResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto z-30">
                  {iResults.map((i: any) => (
                    <button key={i.id} onClick={() => selectImmobile(i)} className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-sm flex items-center gap-3 border-b border-slate-50 last:border-0">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><Home className="h-3.5 w-3.5 text-emerald-600" /></div>
                      <div><span className="font-bold text-slate-800">{i.DatiBase?.Indirizzo || 'N/A'}</span><span className="text-xs text-slate-400 ml-2">{i.DatiBase?.Citta} — Rif. {i.DatiBase?.Codice}</span></div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FI label="Indirizzo *" className="md:col-span-2"><input type="text" value={form.indirizzo} onChange={e => u('indirizzo', e.target.value)} className={ic} /></FI>
              <FI label="Città"><input type="text" value={form.citta} onChange={e => u('citta', e.target.value)} className={ic} /></FI>
              <FI label="Piano"><input type="text" value={form.piano} onChange={e => u('piano', e.target.value)} className={ic} /></FI>
              <FI label="Zona"><input type="text" value={form.zona} onChange={e => u('zona', e.target.value)} className={ic} /></FI>
            </div>
          </div>
        </SC>

        {/* CATASTALI */}
        <SC icon={MapPin} title="Dati Catastali" badge="Sezione 3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <FI label="Foglio"><input type="text" value={form.foglio} onChange={e => u('foglio', e.target.value)} className={ic} /></FI>
            <FI label="Particella"><input type="text" value={form.particella} onChange={e => u('particella', e.target.value)} className={ic} /></FI>
            <FI label="Sub"><input type="text" value={form.sub} onChange={e => u('sub', e.target.value)} className={ic} /></FI>
            <FI label="Valore Catastale (€)"><input type="text" value={form.valoreCatastale} onChange={e => u('valoreCatastale', e.target.value)} className={ic} /></FI>
            <FI label="Classe Energetica" className="col-span-2">
              <select value={form.classeEnergetica} onChange={e => u('classeEnergetica', e.target.value)} className={ic + ' bg-white'}>{CLASSI_EN.map(c => <option key={c} value={c}>{c}</option>)}</select>
            </FI>
          </div>
        </SC>

        {/* PREZZO ACQUISTO */}
        <SC icon={Percent} title="Condizioni di Acquisto" badge="Sezione 4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FI label="Prezzo di Acquisto (€) *"><input type="number" value={form.prezzoAcquisto} onChange={e => u('prezzoAcquisto', e.target.value)} className={ic} placeholder="es. 150000" /></FI>
            <FI label="Acconto a Preliminare (€)"><input type="number" value={form.accontoPrelim} onChange={e => u('accontoPrelim', e.target.value)} className={ic} placeholder="es. 15000" /></FI>
            <FI label="Saldo al Rogito (€)"><input type="number" value={form.saldoRogito} onChange={e => u('saldoRogito', e.target.value)} className={ic} placeholder="es. 135000" /></FI>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <FI label="Da stipularsi entro il"><input type="date" value={form.stipulaEntro} onChange={e => u('stipulaEntro', e.target.value)} className={ic} /></FI>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.condizioniMutuo} onChange={e => u('condizioniMutuo', e.target.checked)} className="sr-only" />
                <div className={cn("h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all", form.condizioniMutuo ? "bg-emerald-600 border-emerald-600" : "border-slate-300")}>{form.condizioniMutuo && <CheckCircle2 className="h-3 w-3 text-white" />}</div>
                <span className="text-sm font-bold text-slate-700">Subordinato a concessione mutuo</span>
              </label>
            </div>
          </div>
          {form.prezzoAcquisto && form.accontoPrelim && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <p className="text-xs text-emerald-700 font-semibold">💰 Saldo residuo: €{(Number(form.prezzoAcquisto) - Number(form.accontoPrelim)).toLocaleString('it-IT')}</p>
            </div>
          )}
          <FI label="Note" className="mt-4"><textarea value={form.note} onChange={e => u('note', e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 font-medium text-sm resize-none placeholder:text-slate-300" placeholder="Condizioni particolari..." /></FI>
        </SC>

        {/* PRIVACY & FIRME */}
        <SC icon={ShieldCheck} title="Firme e Privacy" badge="Obbligatorio">
          <div className="space-y-6">
            <div className={cn("p-4 rounded-xl border-2 transition-all", form.privacyAccepted ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-slate-50/50")}>
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className={cn("mt-0.5 h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0", form.privacyAccepted ? "bg-emerald-600 border-emerald-600" : "border-slate-300 group-hover:border-emerald-400")}>{form.privacyAccepted && <CheckCircle2 className="h-4 w-4 text-white" />}</div>
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
                title="Firma Acquirente"
                value={form.firmaCliente}
                onSave={(b64) => { u('firmaAcquirente', b64); }}
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
            <button onClick={handleGeneratePdf} disabled={generating} className="px-4 md:px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold shadow-lg shadow-emerald-600/25 hover:scale-[1.02] transition-all flex items-center gap-2 text-sm disabled:opacity-50">{generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</> : <><Printer className="h-4 w-4" /> Stampa PDF</>}</button>
            <button onClick={() => {
              const docName = "Impegnativa d'Acquisto";
              const nome = form.acquirenteNome || 'Cliente';
              const msg = `Gentile ${nome}, ecco il documento "${docName}" pronto per la revisione. La preghiamo di verificare i dati inseriti. Cordiali saluti, Immobiliare Pantaleo.`;
              const tel = (form.acquirenteTel || '').replace(/\D/g, '');
              const url = tel ? `https://wa.me/${tel.startsWith('39') ? tel : '39' + tel}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
              window.open(url, '_blank');
            }} className="px-4 md:px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/25 hover:scale-[1.02] transition-all flex items-center gap-2 text-sm"><Send className="h-4 w-4" /> WhatsApp</button>
            <button onClick={async () => {
              if (!form.acquirenteNome) { setToast('⚠️ Compila almeno il nome'); return; }
              if (!form.privacyAccepted) { setToast('⚠️ Accetta la privacy'); return; }
              if (!form.prezzoAcquisto || Number(form.prezzoAcquisto) <= 0) { setToast('⚠️ Inserisci il prezzo di acquisto'); return; }
              setSaving(true);
              try {
                const { default: Doc } = await import('@/components/pdf/templates/IncaricoAcquisto');
                const { saveDocumentToCloud } = await import('@/lib/saveDocumentToCloud');
                const React = (await import('react'));
                const docEl = React.createElement(Doc, { data: form } as any);
                const result = await saveDocumentToCloud({ 
                  docElement: docEl, 
                  nomeFile: `Impegnativa Acquisto - ${form.acquirenteNome}`, 
                  categoria: 'Incarico Acquisto', 
                  clienteNome: form.acquirenteNome,
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
