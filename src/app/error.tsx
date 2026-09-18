"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

/**
 * Límite de error de ruta.
 *
 * Hasta ahora el proyecto no tenía NINGUNO: ni error.tsx en ninguna ruta ni un
 * ErrorBoundary en ningún componente. Como todo el árbol es cliente, cualquier
 * excepción durante el render desmontaba la aplicación entera y dejaba al
 * agente ante una pantalla en blanco, sin mensaje y sin forma de recuperarse
 * salvo recargar a mano.
 *
 * Next monta este componente en lugar del subárbol que falló, manteniendo el
 * layout (barra lateral y navegación inferior siguen ahí), y `reset()` reintenta
 * el render sin recargar la página.
 *
 * El `digest` es el identificador que Next asigna al error y que aparece también
 * en los logs del servidor: es lo que permite cruzar lo que vio el usuario con
 * lo que pasó de verdad.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry solo reporta si hay DSN configurado; sin él es un no-op silencioso.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-500 ring-8 ring-amber-50/50">
          <AlertTriangle className="h-8 w-8 stroke-[1.5]" />
        </div>

        <h2 className="text-xl font-black tracking-tight text-slate-800">
          Qualcosa è andato storto
        </h2>
        <p className="mt-3 font-medium leading-relaxed text-slate-500">
          Si è verificato un errore in questa schermata. I tuoi dati non sono
          stati modificati.
        </p>

        {error.digest && (
          <p className="mt-4 font-mono text-[11px] tracking-wider text-slate-400">
            Rif. errore: {error.digest}
          </p>
        )}

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700"
          >
            <RotateCcw className="h-4 w-4" />
            Riprova
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Home className="h-4 w-4" />
            Home
          </a>
        </div>
      </div>
    </div>
  );
}
