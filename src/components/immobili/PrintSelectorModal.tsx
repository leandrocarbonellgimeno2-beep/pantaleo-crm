"use client";

import NextImage from "next/image";
import { X, CheckCircle2, Loader2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

export const MAX_PRINT_PHOTOS = 4;

interface PrintSelectorModalProps {
  /** Fotos disponibles del inmueble, ya resueltas por la página. */
  images: string[];
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  /** Se avisa cuando se intenta superar el máximo de fotos. */
  onLimitReached: () => void;
  customText: string;
  onCustomTextChange: (value: string) => void;
  generating: boolean;
  /** Texto de progreso durante la generación del PDF. */
  status: string;
  onGenerate: () => void;
  onClose: () => void;
}

/**
 * Selector de fotos y texto para el cartel de escaparate.
 *
 * Recibe `images` ya resuelto en lugar de leer el inmueble: antes el guard
 * comprobaba extractImages(property).length pero el map iteraba
 * property.images, dos arrays distintos. Con las fotos en campos legacy,
 * `images` era undefined y el modal reventaba con un TypeError.
 */
export function PrintSelectorModal({
  images,
  selected,
  onSelectedChange,
  onLimitReached,
  customText,
  onCustomTextChange,
  generating,
  status,
  onGenerate,
  onClose,
}: PrintSelectorModalProps) {
  const toggle = (img: string) => {
    if (selected.includes(img)) {
      onSelectedChange(selected.filter(p => p !== img));
    } else if (selected.length < MAX_PRINT_PHOTOS) {
      onSelectedChange([...selected, img]);
    } else {
      onLimitReached();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 print:hidden">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-800">Seleziona Immagini per il Cartello</h2>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Scegli da 1 a {MAX_PRINT_PHOTOS} foto. Selezionate: {selected.length}/{MAX_PRINT_PHOTOS}
            </p>
          </div>
          <button onClick={onClose} className="h-10 w-10 bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 rounded-full flex items-center justify-center transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-slate-100/50">
          {images.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {images.map((img: string, idx: number) => {
                const isSelected = selected.includes(img);
                return (
                  <div
                    key={idx}
                    onClick={() => toggle(img)}
                    className={cn(
                      "relative aspect-video rounded-xl overflow-hidden cursor-pointer border-4 transition-all hover:opacity-90",
                      isSelected ? "border-primary shadow-md scale-[0.98]" : "border-transparent",
                    )}
                  >
                    <NextImage src={img} alt="" fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" loading="lazy" unoptimized />
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-primary text-white rounded-full p-1 shadow-sm">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-slate-500 py-10 font-medium">Nessuna immagine disponibile per questo immobile.</div>
          )}

          <div className="mt-8 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Testo per il Cartello (Modificabile)</label>
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-medium min-h-[160px] resize-none"
              value={customText}
              onChange={(e) => onCustomTextChange(e.target.value)}
              placeholder="Inserisci la descrizione da mostrare sul cartello stampato..."
            />
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 bg-white flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Annulla
          </button>
          <button
            disabled={selected.length === 0 || generating}
            onClick={onGenerate}
            className="px-8 py-2.5 rounded-xl bg-primary text-white font-black shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" />{status || 'Generazione...'}</>
              : <><Printer className="w-4 h-4" />Genera PDF</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
