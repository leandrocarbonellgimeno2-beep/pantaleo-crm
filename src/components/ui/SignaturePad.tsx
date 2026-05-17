'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { PenTool, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import SignatureCanvas from 'react-signature-canvas';

// ═══════════════════════════════════════════════════════════════
// Universal Premium Signature Pad — Pantaleo CRM
// Extracted from FoglioVisitaForm premium design.
// Usage:
//   <SignaturePad
//     title="Firma Agente"
//     value={form.firmaAgente}
//     onSave={(base64) => setForm(f => ({...f, firmaAgente: base64}))}
//     onClear={() => setForm(f => ({...f, firmaAgente: ''}))}
//   />
// ═══════════════════════════════════════════════════════════════

export interface SignaturePadProps {
  /** Label displayed above the pad (e.g. "Firma Agente", "Firma Cliente") */
  title: string;
  /** Current saved base64 data URL (empty string = not saved) */
  value: string;
  /** Called with the base64 data URL when the user clicks "Salva Firma" or auto-saves */
  onSave: (base64DataUrl: string) => void;
  /** Called when the user clears the saved signature */
  onClear: () => void;
  /** Pen color for drawing. Default: '#1e1b4b' (indigo-950) */
  penColor?: string;
  /** Height of the canvas area. Default: 'h-44' */
  heightClass?: string;
  /** Icon color accent class. Default: 'text-indigo-500' */
  accentColor?: string;
  /** Additional wrapper className */
  className?: string;
}

export default function SignaturePadComponent({
  title,
  value,
  onSave,
  onClear,
  penColor = '#1e1b4b',
  heightClass = 'h-44',
  accentColor = 'text-indigo-500',
  className,
}: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Avoid SSR hydration issues — only render canvas on client
  useEffect(() => { setIsMounted(true); }, []);

  // After mount: resize canvas backing store to physical pixels for sharp rendering
  // on high-DPR tablets, then pre-load any saved signature.
  //
  // WHY offsetWidth instead of getBoundingClientRect().width:
  // The modal that hosts this component uses a Tailwind `zoom-in-95 duration-200`
  // CSS animation on open. getBoundingClientRect() returns the VISUAL bounding box
  // and includes the CSS transform scale, so during the 200ms animation it returns
  // ~95% of the real width. If we set canvas.width to that scaled value, signature_pad
  // will use it as the coordinate space; after the animation the canvas is at full CSS
  // width but the backing store is 5% narrower — every touch maps to a point 5% to
  // the LEFT of the actual finger position.
  // offsetWidth/offsetHeight returns the CSS LAYOUT dimensions, which are unaffected
  // by transforms and stable from the very first frame. Correct choice here.
  //
  // WHY clear() after resize:
  // Manually setting canvas.width/height invalidates the drawing context but does NOT
  // notify signature_pad. signature_pad caches its pixel-ratio on init; after we resize
  // the backing store, calling clear() forces it to reinitialize and recompute the ratio.
  useEffect(() => {
    if (!isMounted || !sigRef.current) return;
    const canvas = sigRef.current.getCanvas();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.offsetWidth;
    const cssHeight = canvas.offsetHeight;
    if (cssWidth > 0 && cssHeight > 0) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      // Restore ctx scale — setting canvas.width/height resets the 2D context to
      // identity, wiping the ctx.scale(dpr,dpr) that react-signature-canvas applies
      // in _resizeCanvas so signature_pad v2.3.2 can work in CSS pixel coordinates.
      // Without this, strokes on a 2× tablet appear at 1/dpr of the touch position.
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
      sigRef.current.clear(); // force signature_pad to re-read canvas dimensions
    }
    if (value) {
      sigRef.current.fromDataURL(value);
    }
  }, [isMounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save the signature as soon as the user finishes a stroke
  const handleEndStroke = useCallback(() => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      const base64 = sigRef.current.toDataURL('image/png');
      onSave(base64);
    }
  }, [onSave]);

  const handleClear = useCallback(() => {
    sigRef.current?.clear();
    onClear();
  }, [onClear]);

  return (
    <div className={cn('space-y-2.5 w-full max-w-full overflow-hidden', className)}>
      {/* Header: Title + Action Button */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <PenTool className={cn('h-3.5 w-3.5', accentColor)} />
          {title}
        </label>
        <div className="flex gap-1.5">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-lg bg-red-100 text-red-600 text-[10px] font-black uppercase hover:bg-red-200 transition-colors flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" /> Cancella
            </button>
          )}
        </div>
      </div>

      {/* Canvas / Saved Preview */}
      <div
        className={cn(
          'border-2 rounded-xl overflow-hidden transition-all duration-300 relative',
          heightClass,
          value
            ? 'border-emerald-300 shadow-inner'
            : 'border-dashed border-slate-300 hover:border-indigo-300'
        )}
      >
        {isMounted ? (
          <>
            {/* We always render the canvas so they can draw. If there's a value, we show an overlay badge but let them keep drawing / auto-saving if they want.
                Actually, if we just want auto-save, we can render the canvas underneath and the stroke auto-updates value.
                Wait, if they draw on the canvas, we auto-save, which updates 'value', which triggers a re-render.
                If re-rendering removes the canvas, they can't draw multiple parts (e.g. crossing a "t").
                Instead, we should just let the canvas be the single source of truth and NOT replace it with an <img>!
             */}
            <SignatureCanvas
              ref={sigRef}
              penColor={penColor}
              onEnd={handleEndStroke}
              canvasProps={{
                className: 'w-full h-full cursor-crosshair bg-white absolute inset-0 z-10 touch-none',
              }}
            />
            {/* If there's an active value but we also have the canvas, we don't need the <img> preview covering it,
                because the canvas itself shows the drawing perfectly. We just show a badge in the corner. */}
            {value && (
              <div className="absolute bottom-3 right-3 z-20 pointer-events-none">
                <span className="px-2 py-1 bg-emerald-100 text-[10px] text-emerald-700 font-bold flex items-center gap-1 rounded-md shadow-sm border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" /> Acquisita
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-300 text-sm font-medium">
             Caricamento...
          </div>
        )}
      </div>
    </div>
  );
}
