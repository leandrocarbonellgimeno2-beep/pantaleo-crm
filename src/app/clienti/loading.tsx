// Server component — shown by Next.js while the /clienti JS chunk is loading.
// Mirrors the structural layout of the actual page (search bar + client list).
export default function ClientiLoading() {
  return (
    <div className="min-h-screen bg-slate-50 animate-pulse">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="h-9 w-9 bg-slate-200 rounded-lg" />
        <div className="flex-1 h-9 bg-slate-100 rounded-xl" />
        <div className="h-9 w-20 bg-slate-200 rounded-lg" />
        <div className="h-9 w-9 bg-indigo-100 rounded-lg" />
      </div>

      {/* Filter tabs */}
      <div className="px-4 pt-4 pb-2 flex gap-2">
        <div className="h-8 w-20 bg-slate-200 rounded-full" />
        <div className="h-8 w-24 bg-slate-200 rounded-full" />
        <div className="h-8 w-24 bg-slate-200 rounded-full" />
      </div>

      {/*
        Rejilla, NO lista de una columna.

        El esqueleto pintaba diez tarjetas apiladas y el contenido real es una
        rejilla de hasta cuatro columnas. En un portatil eso significa que al
        llegar los datos TODO se reordena: el salto de maquetacion no era un
        detalle, era la pantalla entera moviendose. Las clases son las mismas
        que usa la rejilla de verdad, a proposito.
      */}
      <div className="px-4 pb-6 mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="h-11 w-11 bg-indigo-100 rounded-full flex-shrink-0" />
              {/* Content */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-5 w-40 bg-slate-200 rounded" />
                  <div className="h-5 w-16 bg-emerald-100 rounded-full" />
                </div>
                {/* Phone */}
                <div className="h-4 w-32 bg-slate-100 rounded" />
                {/* Budget + tipologia tags */}
                <div className="flex gap-2 pt-1">
                  <div className="h-5 w-28 bg-indigo-50 rounded-full" />
                  <div className="h-5 w-24 bg-slate-100 rounded-full" />
                  <div className="h-5 w-20 bg-slate-100 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
