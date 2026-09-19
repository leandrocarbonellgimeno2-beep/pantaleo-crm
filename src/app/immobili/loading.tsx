// Server component — shown by Next.js while the /immobili JS chunk is loading.
// Mirrors the structural layout of the actual page (search bar + property card grid).
export default function ImmobiliLoading() {
  return (
    <div className="min-h-screen bg-slate-50 animate-pulse">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="h-9 w-9 bg-slate-200 rounded-lg" />
        <div className="flex-1 h-9 bg-slate-100 rounded-xl" />
        <div className="h-9 w-24 bg-slate-200 rounded-lg" />
        <div className="h-9 w-9 bg-indigo-100 rounded-lg" />
      </div>

      {/* Filter chips */}
      <div className="px-4 pt-4 pb-2 flex gap-2">
        {/* Anchos como clases COMPLETAS. Tailwind genera su hoja leyendo el
            codigo como texto, asi que `w-${w}` no es una clase que exista y
            estos cuatro elementos salian sin ancho ninguno. */}
        {['w-20', 'w-16', 'w-[72px]', 'w-14'].map((w, i) => (
          <div key={i} className={`h-8 ${w} bg-slate-200 rounded-full`} />
        ))}
      </div>

      {/* Property card grid — 3 columns on desktop */}
      <div className="px-4 pb-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Image placeholder */}
            <div className="h-44 bg-slate-200" />
            {/* Card body */}
            <div className="p-4 space-y-3">
              {/* Codice + status badges */}
              <div className="flex items-center justify-between">
                <div className="h-5 w-24 bg-slate-200 rounded" />
                <div className="flex gap-1">
                  <div className="h-5 w-14 bg-indigo-100 rounded-full" />
                  <div className="h-5 w-14 bg-emerald-100 rounded-full" />
                </div>
              </div>
              {/* Address */}
              <div className="h-4 w-3/4 bg-slate-200 rounded" />
              {/* Price */}
              <div className="h-6 w-1/2 bg-slate-200 rounded" />
              {/* Stats row */}
              <div className="flex gap-3 pt-1">
                <div className="h-4 w-16 bg-slate-100 rounded" />
                <div className="h-4 w-16 bg-slate-100 rounded" />
                <div className="h-4 w-16 bg-slate-100 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
