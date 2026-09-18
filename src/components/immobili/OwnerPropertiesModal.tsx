"use client";

import NextImage from "next/image";
import { Home, X, MapPin, ChevronRight } from "lucide-react";

interface OwnerPropertiesModalProps {
  /** Nombre ya resuelto del propietario; la página decide cómo componerlo. */
  ownerName: string;
  properties: any[];
  /** Al elegir un inmueble el modal se cierra y se abre su ficha. */
  onSelect: (property: any) => void;
  onClose: () => void;
}

/** Precio de portada: venta si la hay, si no alquiler, si no N/D. */
function formatPrice(prop: any): string {
  if (prop.GestioneCommerciale?.InVendita) {
    return `€${Number(prop.GestioneCommerciale?.PrezzoVendita || 0).toLocaleString()}`;
  }
  if (prop.GestioneCommerciale?.InAffitto) {
    return `€${Number(prop.GestioneCommerciale?.PrezzoAffitto || 0).toLocaleString()}/mese`;
  }
  return 'N/D';
}

/** Lista de los demás inmuebles del mismo propietario. */
export function OwnerPropertiesModal({
  ownerName,
  properties,
  onSelect,
  onClose,
}: OwnerPropertiesModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-lg mx-4 bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md shadow-indigo-200/50">
              <Home className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Altre proprietà di {ownerName}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">{properties.length} immobil{properties.length === 1 ? 'e' : 'i'} trovati</p>
            </div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-all shadow-sm">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* List */}
        <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden p-3 space-y-2">
          {properties.map((prop: any) => (
            <button
              key={prop.id}
              onClick={() => onSelect(prop)}
              className="w-full group rounded-2xl p-3 flex items-center gap-4 hover:bg-indigo-50/50 transition-all border border-transparent hover:border-indigo-100 text-left"
            >
              {/* Thumbnail */}
              <div className="relative w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-200/80 group-hover:border-indigo-200 transition-colors">
                {prop.images?.[0] ? (
                  <NextImage src={prop.images[0]} alt="" fill className="object-cover" sizes="64px" loading="lazy" unoptimized />
                ) : (
                  <Home className="w-6 h-6 text-slate-300" />
                )}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-md border border-indigo-100 tracking-wider">
                    #{prop.DatiBase?.Codice || 'N/A'}
                  </span>
                  <h4 className="font-bold text-sm text-slate-800 truncate">
                    {prop.DatiBase?.Tipologia || 'Immobile'}
                  </h4>
                </div>
                <p className="text-xs text-slate-400 font-medium flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  {prop.DatiBase?.Citta || 'N/D'}{prop.DatiBase?.Zona ? ` — ${prop.DatiBase.Zona}` : ''}
                </p>
              </div>
              {/* Price */}
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-extrabold text-indigo-600">{formatPrice(prop)}</div>
                <div className="flex items-center gap-1 justify-end mt-1">
                  {prop.DettagliFisici?.MetriCommerciali && (
                    <span className="text-[10px] font-bold text-slate-400">{prop.DettagliFisici.MetriCommerciali} m²</span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
