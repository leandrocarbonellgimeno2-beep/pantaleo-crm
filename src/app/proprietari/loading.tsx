// Server component — shown by Next.js while the /proprietari JS chunk is loading.
// Mirrors the structural layout of the actual page (search bar + owner card list).
export default function ProprietariLoading() {
  return (
    <div className="min-h-screen bg-slate-50 animate-pulse">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="h-9 w-9 bg-slate-200 rounded-lg" />
        <div className="flex-1 h-9 bg-slate-100 rounded-xl" />
        <div className="h-9 w-9 bg-indigo-100 rounded-lg" />
      </div>

      {/* Stats strip */}
      <div className="px-4 pt-4 pb-2 flex gap-3">
        <div className="h-8 w-32 bg-slate-200 rounded-lg" />
        <div className="h-8 w-28 bg-slate-200 rounded-lg" />
      </div>

      {/* Owner cards — 2 columns on tablet, 3 on desktop */}
      <div className="px-4 pb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 mt-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex items-center gap-3 mb-3">
              {/* Avatar */}
              <div className="h-12 w-12 bg-slate-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                {/* Name */}
                <div className="h-5 w-36 bg-slate-200 rounded" />
                {/* Phone */}
                <div className="h-4 w-28 bg-slate-100 rounded" />
              </div>
              {/* Property count badge */}
              <div className="h-8 w-8 bg-indigo-100 rounded-full" />
            </div>
            {/* Email row */}
            <div className="h-4 w-48 bg-slate-100 rounded" />
            {/* Property count label */}
            <div className="mt-3 flex items-center gap-2">
              <div className="h-4 w-4 bg-slate-200 rounded" />
              <div className="h-4 w-24 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
