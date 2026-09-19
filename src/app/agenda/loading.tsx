/**
 * Esqueleto de la agenda.
 *
 * Reproduce la MISMA rejilla que la pagina real, con sus mismos breakpoints.
 * Un esqueleto que no coincide con lo que llega despues no ahorra nada: mueve
 * el contenido cuando aparece, que es justo lo que se intenta evitar.
 */
export default function Loading() {
  return (
    <div className="animate-pulse w-full">
      {/* Cabecera */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="h-8 w-40 bg-slate-200 rounded-lg" />
        <div className="h-9 w-32 bg-indigo-100 rounded-xl" />
      </div>

      {/* Selector de vista */}
      <div className="px-4 pb-3 flex gap-2">
        {['w-16', 'w-20', 'w-16'].map((w, i) => (
          <div key={i} className={`h-8 ${w} bg-slate-200 rounded-lg`} />
        ))}
      </div>

      {/* Rejilla del mes: siete columnas, con las mismas alturas que la real */}
      <div className="px-4 pb-6">
        <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-2xl overflow-hidden border border-slate-200">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={`h${i}`} className="h-8 bg-slate-50" />
          ))}
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[56px] sm:min-h-[72px] md:min-h-[90px] bg-white p-1.5">
              <div className="h-6 w-6 bg-slate-200 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
