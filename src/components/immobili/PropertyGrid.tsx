"use client";

import { memo } from "react";
import { ChevronDown, Home } from "lucide-react";
import { PropertyCard } from "@/components/immobili/PropertyCard";

interface PropertyGridProps {
  items: any[];
  /** Cuántas tarjetas se pintan; la paginación es visual, sin red. */
  visibleCount: number;
  loading: boolean;
  /** Cambió un filtro y SWR trae datos nuevos: se oculta la lista vieja. */
  isTransitioning: boolean;
  /** Cuántas quedan por pintar, para el texto del botón. */
  remaining: number;
  openMenuId: string | null;
  onToggleMenu: (item: any) => void;
  onOpenDetail: (item: any) => void;
  onQuickStatusChange: (item: any, sospeso: boolean) => void;
  onLoadMore: () => void;
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-3xl overflow-hidden bg-white border border-slate-100 shadow-sm animate-pulse">
          <div className="h-52 bg-slate-100" />
          <div className="p-4 space-y-3">
            <div className="h-3 bg-slate-100 rounded-full w-1/4" />
            <div className="h-5 bg-slate-100 rounded-full w-2/3" />
            <div className="h-3 bg-slate-100 rounded-full w-1/2" />
            <div className="mt-2 h-12 bg-slate-50 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-24 text-center">
      <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-200 mb-4">
        <Home className="h-10 w-10" />
      </div>
      <h3 className="text-xl font-bold text-slate-900">Nessun immobile trovato</h3>
      <p className="text-slate-500 max-w-xs mx-auto mt-2 font-medium">
        Prova a cambiare i filtri o il termine di ricerca.
      </p>
    </div>
  );
}

/**
 * Listado de inmuebles: esqueleto de carga, rejilla de tarjetas, botón de
 * cargar más y estado vacío.
 *
 * Va memoizado, y eso es el objetivo del componente, no la reducción de
 * líneas. La ficha de un inmueble vive en la misma página que esta lista, así
 * que cada tecla del formulario de edición re-renderizaba la página entera y,
 * con ella, este `.map()`. Las tarjetas ya se libraban por su propio memo, pero
 * la rejilla se recorría igual. Con el memo aquí, mientras no cambien los
 * inmuebles ni el menú abierto, todo el subárbol se salta.
 */
function PropertyGridBase({
  items,
  visibleCount,
  loading,
  isTransitioning,
  remaining,
  openMenuId,
  onToggleMenu,
  onOpenDetail,
  onQuickStatusChange,
  onLoadMore,
}: PropertyGridProps) {
  if (loading || isTransitioning) return <GridSkeleton />;
  if (items.length === 0) return <EmptyState />;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-8">
        {items.slice(0, visibleCount).map((item: any, idx: number) => (
          <PropertyCard
            key={item.id}
            item={item}
            priority={idx < 6}
            menuOpen={openMenuId === item.id}
            onToggleMenu={onToggleMenu}
            onOpenDetail={onOpenDetail}
            onQuickStatusChange={onQuickStatusChange}
          />
        ))}
      </div>

      {/* Cargar más: solo visual, no hay red. */}
      {visibleCount < items.length && (
        <div className="flex justify-center mt-6 mb-4">
          <button
            onClick={onLoadMore}
            className="px-8 py-3 rounded-full border border-slate-200 bg-white text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-2 text-slate-700 hover:text-indigo-600 hover:border-indigo-200"
          >
            <ChevronDown className="h-4 w-4" />
            {remaining <= 15
              ? `Carica i ${remaining} restanti`
              : `Carica altri 15 (${remaining} restanti)`}
          </button>
        </div>
      )}
    </>
  );
}

export const PropertyGrid = memo(PropertyGridBase);
