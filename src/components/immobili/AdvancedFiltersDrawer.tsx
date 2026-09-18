"use client";

import type { Dispatch, SetStateAction } from "react";
import { SlidersHorizontal, X, Tag, Euro, Maximize2, CheckCircle2, Zap, RotateCcw, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import zonasData from "@/lib/zonas.json";
import type { AdvFilters } from "@/lib/immobili/filters";
import { TIPOLOGIE, PIANI, CLASSI_ENERGETICHE, STATI_FINITURE } from "@/lib/immobili/options";

interface AdvancedFiltersDrawerProps {
  filters: AdvFilters;
  onChange: Dispatch<SetStateAction<AdvFilters>>;
  onReset: () => void;
  onClose: () => void;
  /** Filtros activos, para el contador de la cabecera. */
  activeCount: number;
  /** Resultados que quedan con los filtros actuales. */
  resultCount: number;
}

/**
 * Panel lateral de filtros avanzados.
 *
 * Solo pinta y notifica: la lógica de filtrado y el recuento viven en
 * src/lib/immobili/filters.ts, cubiertos por tests.
 */
export function AdvancedFiltersDrawer({
  filters,
  onChange,
  onReset,
  onClose,
  activeCount,
  resultCount,
}: AdvancedFiltersDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => onClose()}>
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header — Premium */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center text-white border border-white/20">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Filtri Avanzati</h3>
              <p className="text-xs text-slate-400 font-bold">
                {activeCount > 0 ? `${activeCount} filtri attivi · ` : ''}
                {resultCount} risultat{resultCount === 1 ? 'o' : 'i'}
              </p>
            </div>
          </div>
          <button onClick={() => onClose()} className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-7">

          {/* ── SEZIONE: IDENTIFICAZIONE ── */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
              <Tag className="h-3.5 w-3.5" /> Identificazione
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Codice</label>
                <input className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all bg-slate-50/50 hover:bg-white" placeholder="es. 10047" value={filters.codice} onChange={e => onChange(p => ({...p, codice: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Provincia / Città</label>
                <input className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all bg-slate-50/50 hover:bg-white" placeholder="Marsala" value={filters.provincia} onChange={e => onChange(p => ({...p, provincia: e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Tipologia</label>
                <select className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all bg-slate-50/50 hover:bg-white" value={filters.tipologia} onChange={e => onChange(p => ({...p, tipologia: e.target.value}))}>
                  <option value="">Tutte le tipologie</option>
                  {TIPOLOGIE.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Zona</label>
                <select className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all bg-slate-50/50 hover:bg-white" value={filters.zona} onChange={e => onChange(p => ({...p, zona: e.target.value}))}>
                  <option value="">Tutte le Zone</option>
                  <option value="Nessuna Zona">Nessuna Zona</option>
                  {zonasData.filter((z: string) => z !== "-").map((z: string) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ── SEZIONE: PREZZO ── */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
              <Euro className="h-3.5 w-3.5" /> Prezzo (€)
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Da (Min)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">€</span>
                  <input type="number" className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all bg-slate-50/50 hover:bg-white" placeholder="0" value={filters.prezzoMin} onChange={e => onChange(p => ({...p, prezzoMin: e.target.value}))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">A (Max)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">€</span>
                  <input type="number" className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all bg-slate-50/50 hover:bg-white" placeholder="1.000.000" value={filters.prezzoMax} onChange={e => onChange(p => ({...p, prezzoMax: e.target.value}))} />
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ── SEZIONE: SUPERFICIE & DIMENSIONI ── */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
              <Maximize2 className="h-3.5 w-3.5" /> Superficie e Dimensioni
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Sup. Min (m²)</label>
                <input type="number" min="0" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all bg-slate-50/50 hover:bg-white" placeholder="0" value={filters.superficieMin} onChange={e => onChange(p => ({...p, superficieMin: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Sup. Max (m²)</label>
                <input type="number" min="0" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all bg-slate-50/50 hover:bg-white" placeholder="0" value={filters.superficieMax} onChange={e => onChange(p => ({...p, superficieMax: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Camere Min</label>
                <input type="number" min="0" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all bg-slate-50/50 hover:bg-white" placeholder="0" value={filters.camereMin} onChange={e => onChange(p => ({...p, camereMin: e.target.value}))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Bagni Min</label>
                <input type="number" min="0" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all bg-slate-50/50 hover:bg-white" placeholder="0" value={filters.bagniMin} onChange={e => onChange(p => ({...p, bagniMin: e.target.value}))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Piano</label>
              <select className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all bg-slate-50/50 hover:bg-white" value={filters.piano} onChange={e => onChange(p => ({...p, piano: e.target.value}))}>
                <option value="">Qualsiasi piano</option>
                {PIANI.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ── SEZIONE: CARATTERISTICHE ── */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-black text-violet-600 uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" /> Caratteristiche
            </h4>
            <div className="grid grid-cols-2 gap-2.5">
              {([
                ['ascensore', 'Ascensore', '🛗'], ['balcone', 'Balcone', '🏠'], ['terrazza', 'Terrazzo', '☀️'],
                ['garage', 'Garage', '🚗'], ['giardino', 'Giardino', '🌳'], ['arredato', 'Arredato', '🛋️'],
                ['vistaMare', 'Vista Mare', '🌊'], ['ariaCondizionata', 'Aria Cond.', '❄️'], ['riscaldamentoAutonomo', 'Risc. Autonomo', '🔥']
              ] as const).map(([key, label, emoji]) => (
                <label key={key} className={cn(
                  "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-all duration-200",
                  filters[key]
                    ? 'bg-violet-50 border-violet-300 text-violet-700 font-bold shadow-sm shadow-violet-100'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                )}>
                  <input type="checkbox" className="sr-only" checked={filters[key] as boolean} onChange={() => onChange(p => ({...p, [key]: !p[key as keyof typeof p]}))} />
                  <span className="text-base leading-none">{emoji}</span>
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ── SEZIONE: CERTIFICAZIONI ── */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" /> Certificazioni
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Classe Energetica</label>
                <select className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all bg-slate-50/50 hover:bg-white" value={filters.classeEnergetica} onChange={e => onChange(p => ({...p, classeEnergetica: e.target.value}))}>
                  <option value="">Tutte</option>
                  {CLASSI_ENERGETICHE.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Stato Finiture</label>
                <select className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all bg-slate-50/50 hover:bg-white" value={filters.statoFiniture} onChange={e => onChange(p => ({...p, statoFiniture: e.target.value}))}>
                  <option value="">Tutti</option>
                  {STATI_FINITURE.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer — Premium */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-6 py-4 flex gap-3">
          <button onClick={() => { onReset(); }} className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-2">
            <RotateCcw className="h-3.5 w-3.5" />
            Azzera
          </button>
          <button onClick={() => onClose()} className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-black shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all inline-flex items-center justify-center gap-2">
            <Filter className="h-3.5 w-3.5" />
            Mostra {resultCount} risultat{resultCount === 1 ? 'o' : 'i'}
          </button>
        </div>
      </div>
    </div>
  );
}
