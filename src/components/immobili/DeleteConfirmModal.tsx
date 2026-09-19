"use client";

import { Trash2, CheckCircle2, Loader2 } from "lucide-react";
import { useDialog, useCierreAlPinchoFuera } from "@/hooks/useDialog";

interface DeleteConfirmModalProps {
  /** Código del inmueble, para que el usuario confirme que borra el correcto. */
  codice: string;
  /** Casilla obligatoria antes de habilitar el botón. */
  confirmed: boolean;
  onToggleConfirm: (value: boolean) => void;
  /** Segundos que faltan del guardarraíl; con > 0 el botón sigue bloqueado. */
  timer: number;
  saving: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirmación de borrado permanente, con doble guardarraíl: casilla explícita
 * y cuenta atrás. El borrado arrastra también las fotos de Storage, así que no
 * hay vuelta atrás.
 */
export function DeleteConfirmModal({
  codice,
  confirmed,
  onToggleConfirm,
  timer,
  saving,
  onConfirm,
  onClose,
}: DeleteConfirmModalProps) {
  // La página solo monta la confirmación cuando está abierta; además queda por
  // encima de la ficha del inmueble, que sigue montada debajo, y de eso se
  // ocupa la pila del hook.
  const dialogo = useDialog<HTMLDivElement>({ abierto: true, alCerrar: onClose });
  const fondo = useCierreAlPinchoFuera(onClose);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-200" {...fondo}>
      <div
        ref={dialogo.ref}
        {...dialogo.props}
        aria-labelledby="titolo-elimina-immobile"
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-rose-100 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 text-center flex flex-col items-center">
          <div className="h-20 w-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6 ring-8 ring-rose-50/50 shadow-inner">
            <Trash2 className="h-10 w-10 stroke-[1.5]" />
          </div>
          <h2 id="titolo-elimina-immobile" className="text-2xl font-black text-slate-800 tracking-tight leading-tight">
            Sei sicuro di voler eliminare permanentemente la proprietà <span className="text-rose-600 block mt-1">#{codice || 'N/A'}?</span>
          </h2>
          <p className="text-slate-500 mt-4 leading-relaxed font-medium">
            Questa azione eliminerà definitivamente l'immobile dal database e TUTTE le foto associate da Firebase. <strong className="text-rose-500">Questa azione non si può annullare.</strong>
          </p>

          <div className="mt-8 w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left">
            <label htmlFor="delete-confirm-check" className="flex items-start gap-4 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  id="delete-confirm-check"
                  type="checkbox"
                  className="peer sr-only"
                  checked={confirmed}
                  onChange={(e) => onToggleConfirm(e.target.checked)}
                />
                {/* El checkbox real es sr-only, así que el anillo de foco tiene
                    que pintarlo esta caja: si no, tabular hasta el guardarraíl
                    deja el foco en un sitio que no se ve. */}
                <div className="h-6 w-6 rounded-md border-2 border-slate-300 bg-white group-hover:border-rose-400 peer-checked:bg-rose-500 peer-checked:border-rose-500 peer-focus-visible:ring-2 peer-focus-visible:ring-rose-500 peer-focus-visible:ring-offset-2 transition-all flex items-center justify-center">
                  {/* peer-checked NO funcionaba aqui: la variante solo alcanza a
                      los HERMANOS del .peer, y este icono es nieto. La marca no se
                      ha visto nunca desde que existe el guardarrail; el usuario solo
                      notaba que la caja se ponia roja. Se pinta desde el estado. */}
                  <CheckCircle2 className={`h-4 w-4 text-white transition-opacity ${confirmed ? "opacity-100" : "opacity-0"}`} />
                </div>
              </div>
              <span className="text-sm font-bold text-slate-700 leading-snug group-hover:text-slate-900 transition-colors">
                Ho compreso e confermo di voler eliminare definitivamente questo immobile dal CRM e i suoi allegati.
              </span>
            </label>
          </div>

          <div className="mt-8 w-full grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              className="px-5 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors tracking-wide"
            >
              Annulla
            </button>
            <button
              onClick={onConfirm}
              disabled={!confirmed || timer > 0 || saving}
              className="px-5 py-3.5 rounded-xl bg-rose-600 text-white font-black hover:bg-rose-700 hover:shadow-lg hover:shadow-rose-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 tracking-wide"
            >
              {saving ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Eliminazione...</>
              ) : timer > 0 ? (
                `Attendi ${timer}s`
              ) : (
                <><Trash2 className="h-5 w-5" /> Conferma Elimina</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
