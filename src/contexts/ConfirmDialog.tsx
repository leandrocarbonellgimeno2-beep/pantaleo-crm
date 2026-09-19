"use client";

/**
 * Sostituto di `window.confirm()` con un modal custom. Pattern:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ message: 'Sicuro?' })) {
 *     doIt();
 *   }
 *
 * Identica firma di confirm() ma:
 *  - non blocca l'event loop
 *  - stile coerente con il resto del CRM
 *  - supporta varianti "danger" per azioni distruttive
 *  - dialogo accessibile completo (vedi hooks/useDialog): focus trap reale,
 *    Esc per annullare, Enter per confermare, e il focus torna al pulsante che
 *    ha aperto il dialogo.
 */

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useDialog, useCierreAlPinchoFuera } from "@/hooks/useDialog";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Cambia il colore del bottone primario in rosso. Per delete/distruttive. */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const ConfirmContext = createContext<(opts: ConfirmOptions | string) => Promise<boolean>>(
  () => Promise.resolve(false),
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const ask = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    const o: ConfirmOptions = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setPending({ ...o, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    if (pending) {
      pending.resolve(result);
      setPending(null);
    }
  }, [pending]);

  // Esc e focus trap arrivano dall'hook condiviso, che gestisce anche lo stack
  // dei dialoghi annidati: questo dialogo si apre spesso SOPRA un altro modale
  // (la scheda di un immobile che chiede conferma prima di eliminare).
  const dialogo = useDialog<HTMLDivElement>({
    abierto: pending !== null,
    alCerrar: () => close(false),
  });
  const fondo = useCierreAlPinchoFuera(() => close(false));

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          {...fondo}
        >
          <div
            ref={dialogo.ref}
            {...dialogo.props}
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            // Enter conferma, ma SOLO da dentro il dialogo. Prima stava su
            // document: con un modale sotto, il tasto arrivava anche a quello.
            onKeyDown={(e) => {
              if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
                e.preventDefault();
                close(true);
              }
            }}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden outline-none"
          >
            <div className="px-6 pt-6 pb-4 flex items-start gap-4">
              <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${pending.danger ? "bg-red-100 text-red-600" : "bg-indigo-100 text-indigo-600"}`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="confirm-title" className="text-base font-bold text-slate-900">
                  {pending.title || "Conferma"}
                </h2>
                <p id="confirm-message" className="mt-1.5 text-sm text-slate-600 whitespace-pre-line">{pending.message}</p>
              </div>
              <button
                onClick={() => close(false)}
                aria-label="Chiudi"
                className="flex-shrink-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                onClick={() => close(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {pending.cancelLabel || "Annulla"}
              </button>
              <button
                onClick={() => close(true)}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  pending.danger
                    ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                    : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                }`}
              >
                {pending.confirmLabel || (pending.danger ? "Elimina" : "Conferma")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
