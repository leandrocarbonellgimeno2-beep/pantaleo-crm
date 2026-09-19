/**
 * Esqueleto de documentos: la tabla de modelos.
 */
export default function Loading() {
  return (
    <div className="animate-pulse w-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="h-8 w-48 bg-slate-200 rounded-lg" />
        <div className="h-9 w-36 bg-indigo-100 rounded-xl" />
      </div>

      <div className="px-4 pb-3 flex gap-2">
        {['w-24', 'w-20', 'w-28'].map((w, i) => (
          <div key={i} className={`h-8 ${w} bg-slate-200 rounded-full`} />
        ))}
      </div>

      <div className="px-4 pb-6 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4">
            <div className="h-10 w-10 bg-slate-200 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-slate-200 rounded" />
              <div className="h-3 w-1/5 bg-slate-100 rounded" />
            </div>
            <div className="h-8 w-20 bg-slate-100 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
