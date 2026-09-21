/**
 * Esqueleto de documentos.
 *
 * Pintaba una lista de ocho tarjetas, y la pantalla real son DOS TABLAS, una
 * debajo de otra: los documentos generados y el archivo de modelos. Al llegar
 * los datos se reordenaba todo.
 *
 * Ahora imita lo que hay: cabecera, y dos bloques de tabla con sus titulos.
 */
function FilaDeTabla({ i }: { i: number }) {
  return (
    <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 last:border-0">
      <div className="h-9 w-9 bg-slate-200 rounded-xl flex-shrink-0" />
      <div className="h-4 w-1/3 bg-slate-200 rounded" />
      <div className="h-3 w-24 bg-slate-100 rounded hidden sm:block" />
      <div className="h-3 w-20 bg-slate-100 rounded hidden md:block" />
      <div className="h-8 w-24 bg-slate-100 rounded-lg ml-auto" />
    </div>
  );
}

function BloqueDeTabla({ filas }: { filas: number }) {
  return (
    <div className="space-y-4">
      <div className="h-6 w-56 bg-slate-200 rounded-lg" />
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
        {/* Cabecera de la tabla */}
        <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100">
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-200 rounded hidden sm:block" />
          <div className="h-3 w-16 bg-slate-200 rounded hidden md:block" />
        </div>
        {Array.from({ length: filas }).map((_, i) => <FilaDeTabla key={i} i={i} />)}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="animate-pulse w-full space-y-8 px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 bg-slate-200 rounded-lg" />
        <div className="h-9 w-36 bg-indigo-100 rounded-xl" />
      </div>

      <div className="flex gap-2">
        {['w-24', 'w-20', 'w-28'].map((w, i) => (
          <div key={i} className={`h-8 ${w} bg-slate-200 rounded-full`} />
        ))}
      </div>

      {/* Documenti generati */}
      <BloqueDeTabla filas={6} />

      {/* Archivio modelli */}
      <BloqueDeTabla filas={4} />
    </div>
  );
}
