"use client";

import { X, Phone, Mail, MessageCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDialog, useCierreAlPinchoFuera } from "@/hooks/useDialog";

interface ClienteMatchModalProps {
  /** Resultado del matching inverso: datos del cliente más su porcentaje. */
  cliente: any;
  onClose: () => void;
  /** Envía la propuesta por WhatsApp; la página decide el mensaje. */
  onWhatsApp: (cliente: any) => void;
}

const URGENCY_STYLES: Record<string, string> = {
  Alta: 'bg-rose-100 text-rose-700',
  Media: 'bg-amber-100 text-amber-700',
};

/** Ficha resumida de un cliente candidato, desde el panel "Trova Acquirenti". */
export function ClienteMatchModal({ cliente, onClose, onWhatsApp }: ClienteMatchModalProps) {
  // La página solo monta la ficha cuando hay cliente seleccionado: si esto se
  // renderiza, el diálogo está abierto.
  const dialogo = useDialog<HTMLDivElement>({ abierto: true, alCerrar: onClose });
  // Aquí no se escribe nada, solo se consulta, así que cerrar por el fondo no
  // puede hacer perder trabajo.
  const fondo = useCierreAlPinchoFuera(onClose);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-in fade-in duration-150" {...fondo}>
      <div
        ref={dialogo.ref}
        {...dialogo.props}
        aria-labelledby="titolo-cliente-match"
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-violet-600 to-indigo-600">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 bg-white/20 rounded-xl flex items-center justify-center text-white font-black text-lg">
              {(cliente.nome?.[0] || '?').toUpperCase()}
            </div>
            <div>
              <h2 id="titolo-cliente-match" className="text-lg font-black text-white">
                {cliente.nome} {cliente.cognome}
              </h2>
              <p className="text-violet-200 text-xs font-bold flex items-center gap-1.5 mt-0.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Match {cliente.matchPercentage}% con questo immobile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi scheda cliente"
            className="h-11 w-11 md:h-9 md:w-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Contacts */}
          <div className="grid grid-cols-2 gap-3">
            {cliente.telefono && (
              <a
                href={`tel:${cliente.telefono}`}
                className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 px-4 py-3 rounded-xl hover:bg-emerald-100 transition-colors"
              >
                <Phone className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span className="text-sm font-bold text-slate-700 truncate">{cliente.telefono}</span>
              </a>
            )}
            {cliente.email && (
              <a
                href={`mailto:${cliente.email}`}
                className="flex items-center gap-3 bg-sky-50 border border-sky-100 px-4 py-3 rounded-xl hover:bg-sky-100 transition-colors"
              >
                <Mail className="h-4 w-4 text-sky-600 flex-shrink-0" />
                <span className="text-sm font-bold text-slate-700 truncate">{cliente.email}</span>
              </a>
            )}
          </div>

          {/* Urgency + Summary */}
          {cliente.urgenza && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Urgenza:</span>
              <span className={cn(
                "text-xs font-black px-2.5 py-1 rounded-lg",
                URGENCY_STYLES[cliente.urgenza] || 'bg-slate-100 text-slate-600',
              )}>
                {cliente.urgenza}
              </span>
            </div>
          )}

          {cliente.summary && (
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Ricerca</p>
              <p className="text-sm font-medium text-slate-700 leading-relaxed">{cliente.summary}</p>
            </div>
          )}

          {cliente.note && (
            <div className="bg-yellow-50 rounded-xl border border-yellow-100 p-4">
              <p className="text-xs font-bold text-yellow-600 uppercase tracking-widest mb-1.5">Note Interne</p>
              <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{cliente.note}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Chiudi
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { onWhatsApp(cliente); onClose(); }}
              className="h-9 px-4 rounded-xl bg-emerald-500 text-white text-sm font-bold flex items-center gap-2 hover:bg-emerald-600 transition-colors"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </button>
            <a
              href={`/clienti?id=${cliente.clienteId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-11 md:h-9 px-4 rounded-xl bg-violet-100 text-violet-700 text-sm font-bold flex items-center gap-2 hover:bg-violet-200 transition-colors"
            >
              <ExternalLink className="h-4 w-4" /> Apri Profilo
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
