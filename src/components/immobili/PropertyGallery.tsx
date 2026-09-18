"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PropertyGalleryProps {
  images: string[];
  /** Abre el visor a pantalla completa en la foto indicada. */
  onOpenLightbox: (index: number) => void;
}

/**
 * Carrusel de fotos de la ficha del inmueble.
 *
 * El índice vive DENTRO del componente y se reinicia al cambiar de lista.
 * Antes era un estado de la página que no se limpiaba al abrir otro inmueble:
 * si estabas en la foto 9 de un inmueble con 10 y saltabas a otro con 2 desde
 * el modal de propiedades del propietario, se pasaba `src={undefined}` a
 * next/image y la ficha reventaba. El clamp lo cubre incluso si la lista se
 * acorta sin cambiar de inmueble (al borrar fotos).
 */
export function PropertyGallery({ images, onOpenLightbox }: PropertyGalleryProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [images]);

  if (images.length === 0) {
    return (
      <div className="w-full h-48 bg-slate-100 rounded-3xl flex flex-col items-center justify-center text-slate-400">
        <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
        <span className="text-sm font-bold uppercase tracking-widest">Nessuna foto disponibile</span>
      </div>
    );
  }

  const current = Math.min(index, images.length - 1);

  return (
    <div className="relative w-full h-[300px] md:h-[500px] bg-slate-100 rounded-3xl overflow-hidden shadow-sm group">
      <NextImage
        src={images[current]}
        alt={`Foto ${current + 1}`}
        fill
        className="object-cover cursor-pointer transition-transform duration-500"
        sizes="(max-width: 768px) 100vw, 80vw"
        priority
        unoptimized
        onClick={() => onOpenLightbox(current)}
      />
      {/* Status Bar Top */}
      <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full text-white text-[11px] font-bold tracking-wider">
        {current + 1} / {images.length}
      </div>

      {/* Navigation Arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIndex(prev => (prev === 0 ? images.length - 1 : prev - 1)); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 md:h-12 md:w-12 bg-white/80 hover:bg-white backdrop-blur rounded-full flex items-center justify-center text-slate-800 shadow-xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
          >
            <ChevronLeft className="h-6 w-6 pr-0.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIndex(prev => (prev === images.length - 1 ? 0 : prev + 1)); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 md:h-12 md:w-12 bg-white/80 hover:bg-white backdrop-blur rounded-full flex items-center justify-center text-slate-800 shadow-xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
          >
            <ChevronRight className="h-6 w-6 pl-0.5" />
          </button>
        </>
      )}

      {/* Thumbnail Indicators Bottom */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
        <div className="flex gap-2 p-2 bg-black/40 backdrop-blur-md rounded-2xl overflow-x-auto max-w-xl snap-x">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => { e.stopPropagation(); setIndex(idx); }}
              className={cn(
                "h-1.5 rounded-full transition-all shrink-0 snap-center",
                current === idx ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80 hover:w-3",
              )}
            />
          ))}
        </div>
      </div>

      {/* Floating Button for Gallery grid */}
      <button onClick={() => onOpenLightbox(0)} className="absolute top-4 right-4 bg-white/90 backdrop-blur-md shadow-lg text-slate-800 font-bold h-9 px-4 rounded-full text-xs flex items-center hover:bg-white transition-colors">
        <ImageIcon className="h-3.5 w-3.5 mr-2" /> Schermo Intero
      </button>
    </div>
  );
}
