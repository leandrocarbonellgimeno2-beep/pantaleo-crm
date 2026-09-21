import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { ULTIMA_REVISION, faltanDatosPorRellenar } from '@/lib/datos-titular';

/**
 * El marco de las dos páginas legales.
 *
 * Es un componente de SERVIDOR a propósito: son texto, no necesitan ni una
 * línea de JavaScript en el navegador. Y tienen que poder abrirse SIN sesión,
 * porque Google las visita desde su propia infraestructura para publicar la
 * aplicación OAuth (ver `PUBLIC_PATHS` en src/proxy.ts).
 *
 * El aviso de «pendiente de completar» sale solo mientras queden marcadores
 * sin rellenar en lib/datos-titular.ts. Publicar una política con
 * «[RAGIONE SOCIALE]» dentro es peor que no publicarla, y sin el aviso nadie
 * se daría cuenta hasta que lo viera un cliente.
 */
export function PaginaLegale({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  const incompleta = faltanDatosPorRellenar();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna all&apos;accesso
        </Link>

        <header className="mt-6 pb-6 border-b border-slate-200">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">
            Immobiliare Pantaleo
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
            {titulo}
          </h1>
          <p className="mt-2 text-base font-medium text-slate-500">{subtitulo}</p>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">
            Ultimo aggiornamento: {ULTIMA_REVISION}
          </p>
        </header>

        {incompleta && (
          <div
            role="alert"
            className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
          >
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              <strong className="font-black">Documento da completare.</strong>{' '}
              Alcuni dati dell&apos;agenzia sono ancora segnaposto (compaiono tra parentesi
              quadre). Vanno compilati prima della pubblicazione definitiva.
            </p>
          </div>
        )}

        {/*
          `prose` no está instalado en este proyecto, así que los estilos de
          texto van explícitos sobre los hijos. Es menos elegante que un plugin
          pero no añade una dependencia por dos páginas.
        */}
        <article
          className="mt-8 space-y-6 text-[15px] leading-relaxed text-slate-700
            [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-slate-900 [&_h2]:tracking-tight
            [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-slate-800
            [&_p]:mt-3
            [&_ul]:mt-3 [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:marker:text-indigo-400
            [&_ol]:mt-3 [&_ol]:space-y-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:marker:text-indigo-400
            [&_strong]:font-bold [&_strong]:text-slate-900
            [&_a]:font-semibold [&_a]:text-indigo-600 [&_a]:underline [&_a]:underline-offset-2"
        >
          {children}
        </article>

        <footer className="mt-14 border-t border-slate-200 pt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium text-slate-400">
            © 2026 Immobiliare Pantaleo · Marsala (TP)
          </p>
          <nav className="flex items-center gap-4 text-xs font-bold">
            <Link href="/privacy" className="text-slate-500 hover:text-indigo-600 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="text-slate-500 hover:text-indigo-600 transition-colors">
              Termini
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
