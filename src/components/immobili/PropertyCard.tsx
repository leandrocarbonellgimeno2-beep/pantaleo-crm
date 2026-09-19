"use client";

import { memo } from "react";
import { esFuenteLocal } from "@/lib/image-optimizable";
import NextImage from "next/image";
import { CheckCircle2, Eye, Home, Camera, MapPin, Maximize2, BedDouble, Bath, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PropertyCardProps {
  item: any;
  /** true para las primeras tarjetas: next/image las carga con prioridad (LCP). */
  priority: boolean;
  menuOpen: boolean;
  /**
   * Los callbacks reciben `item` de vuelta en lugar de capturarlo en un
   * closure del padre. Así el padre puede declararlos con useCallback una sola
   * vez y el React.memo de abajo sirve de algo: con arrow functions inline las
   * props cambiaban en cada render y las 15 tarjetas visibles se reconciliaban
   * ante cualquier tecla del buscador o del formulario de edición.
   */
  onToggleMenu: (item: any) => void;
  onOpenDetail: (item: any) => void;
  /** Cambio rápido de estado desde el menú contextual. */
  onQuickStatusChange: (item: any, sospeso: boolean) => void;
}

/**
 * Tarjeta de inmueble del listado.
 *
 * Va memoizada: sin esto, cualquier tecla del buscador o del formulario de
 * edición reconciliaba las 15 tarjetas visibles.
 */
function PropertyCardBase({
  item,
  priority,
  menuOpen,
  onToggleMenu,
  onOpenDetail,
  onQuickStatusChange,
}: PropertyCardProps) {
  const photoCount = item.imageCount || item.images?.length || 0;
  const prezzoVendita = item.GestioneCommerciale?.InVendita ? Number(item.GestioneCommerciale?.PrezzoVendita || 0) : 0;
  const prezzoAffitto = item.GestioneCommerciale?.InAffitto ? Number(item.GestioneCommerciale?.PrezzoAffitto || 0) : 0;
  const prezzoDisplay = prezzoVendita > 0
    ? `€${prezzoVendita.toLocaleString('it-IT')}`
    : prezzoAffitto > 0
      ? `€${prezzoAffitto.toLocaleString('it-IT')}/mese`
      : 'Prezzo N/D';
  const isSospeso = item.GestioneCommerciale?.Sospeso;

  return (
  <div
    className="group relative flex flex-col rounded-3xl overflow-hidden bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
    style={{ contentVisibility: 'auto', containIntrinsicSize: '0 400px' }}
  >
    {/* Quick Action ⋮ */}
    {/* En pantalla táctil no hay hover: el botón se ve siempre por debajo de
        md y el efecto de aparición queda solo en escritorio. */}
    <button
      onClick={(e) => { e.stopPropagation(); onToggleMenu(item); }}
      aria-label="Apri menu azioni immobile"
      className="absolute top-4 right-4 z-20 h-9 w-9 rounded-full bg-black/40 backdrop-blur-md text-white/80 flex items-center justify-center hover:bg-black/70 hover:text-white transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
    </button>
    {menuOpen && (
      <div className="absolute top-14 right-4 z-30 bg-white rounded-2xl shadow-2xl border border-slate-100 w-52 py-2 animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cambia Stato</div>
        <button onClick={() => onQuickStatusChange(item, false)} className={cn("w-full px-3 py-2 text-left text-sm font-bold flex items-center gap-2 hover:bg-emerald-50 transition-colors", !item.GestioneCommerciale?.Sospeso ? "text-emerald-700 bg-emerald-50" : "text-slate-700")}>
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Libero / Attivo
          {!item.GestioneCommerciale?.Sospeso && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-emerald-500" />}
        </button>
        <button onClick={() => onQuickStatusChange(item, true)} className={cn("w-full px-3 py-2 text-left text-sm font-bold flex items-center gap-2 hover:bg-rose-50 transition-colors", item.GestioneCommerciale?.Sospeso ? "text-rose-700 bg-rose-50" : "text-slate-700")}>
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Sospeso
          {item.GestioneCommerciale?.Sospeso && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-rose-500" />}
        </button>
        <div className="border-t border-slate-100 mt-1 pt-1">
          <button onClick={() => onOpenDetail(item)} className="w-full px-3 py-2 text-left text-sm font-bold flex items-center gap-2 text-slate-600 hover:bg-slate-50">
            <Eye className="h-3.5 w-3.5" /> Apri Scheda Completa
          </button>
        </div>
      </div>
    )}

    <div onClick={() => onOpenDetail(item)}>
      {/* ── Hero Photo (55%+ height) ── */}
      <div className="relative h-64 bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center overflow-hidden">
        {item.thumbnail || item.mainImage ? (
          <NextImage
            src={item.thumbnail || item.mainImage}
            alt={`${item.DatiBase?.Tipologia || 'Immobile'} - ${item.DatiBase?.Indirizzo || ''}`}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            loading={priority ? undefined : "lazy"}
            priority={priority}
            unoptimized={esFuenteLocal(item.thumbnail || item.mainImage)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Home className="h-12 w-12 text-slate-200" />
            <span className="text-xs font-medium text-slate-300">Nessuna foto</span>
          </div>
        )}

        {/* Floating Status Badges — Top Left */}
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          {isSospeso && (
            <span className="bg-rose-500 text-white px-3 py-1 text-xs font-bold rounded-full shadow-md shadow-rose-500/30 uppercase tracking-wide">
              Sospeso
            </span>
          )}
          {!isSospeso && item.GestioneCommerciale?.InVendita && (
            <span className="bg-indigo-500 text-white px-3 py-1 text-xs font-bold rounded-full shadow-md shadow-indigo-500/30 uppercase tracking-wide">
              Vendita
            </span>
          )}
          {!isSospeso && item.GestioneCommerciale?.InAffitto && (
            <span className="bg-amber-500 text-white px-3 py-1 text-xs font-bold rounded-full shadow-md shadow-amber-500/30 uppercase tracking-wide">
              Affitto
            </span>
          )}
          {!isSospeso && item.DettagliFisici?.StatoFiniture === 'Nuovo' && (
            <span className="bg-emerald-500 text-white px-3 py-1 text-xs font-bold rounded-full shadow-md shadow-emerald-500/30 uppercase tracking-wide">
              Nuovo
            </span>
          )}
        </div>

        {/* Reference Code — Top Right (behind quick action) */}
        <span className="absolute top-4 right-14 bg-white/90 backdrop-blur-md text-slate-700 px-3 py-1 text-[11px] font-black tracking-wider rounded-full shadow-sm border border-white/50">
          Rif: {item.DatiBase?.Codice ? `#${item.DatiBase.Codice}` : 'N/A'}
        </span>

        {/* Photo Count — Bottom Right */}
        {photoCount > 0 && (
          <span className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-md text-white px-2.5 py-1 text-[10px] font-bold rounded-full flex items-center gap-1.5">
            <Camera className="h-3 w-3" /> {photoCount}
          </span>
        )}

        {/* Gradient overlay for readability */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/15 to-transparent pointer-events-none" />
      </div>

      {/* ── Card Body ── */}
      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Price — Giant & Prominent */}
        <div className="text-2xl font-extrabold text-indigo-600 leading-tight tracking-tight">
          {prezzoDisplay}
        </div>

        {/* Tipologia */}
        <h3 className="text-sm font-bold text-slate-800 line-clamp-1 leading-snug">
          {item.DatiBase?.Tipologia || 'Immobile'}
        </h3>

        {/* Location — Privacy Respecting (Città + Zona only) */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <MapPin className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
          <span className="truncate">
            {item.DatiBase?.Citta || 'Località N/D'}
            {item.DatiBase?.Zona ? ` — ${item.DatiBase.Zona}` : ''}
          </span>
        </div>

        {/* ── Specs Row — Clean bar ── */}
        <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between mt-auto">
          <div className="flex items-center gap-1.5" title="Superficie">
            <Maximize2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-bold text-slate-700">{item.DettagliFisici?.MetriCommerciali || '—'}</span>
            <span className="text-[10px] text-slate-400 font-medium">m²</span>
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <div className="flex items-center gap-1.5" title="Camere">
            <BedDouble className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-bold text-slate-700">{item.DettagliFisici?.CamereLetto || item.DettagliFisici?.Vani || '—'}</span>
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <div className="flex items-center gap-1.5" title="Bagni">
            <Bath className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-bold text-slate-700">{item.DettagliFisici?.Bagni || '—'}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 ml-1 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </div>
  </div>
  );
}

export const PropertyCard = memo(PropertyCardBase);
