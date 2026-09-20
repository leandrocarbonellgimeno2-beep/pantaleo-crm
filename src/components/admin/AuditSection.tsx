"use client";

import { useEffect, useState } from "react";
import { History, Loader2, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasAtLeast } from "@/lib/roles";

interface Registro {
  id: string;
  at: number;
  actorEmail: string;
  actorRole: string;
  action: string;
  target: { collection: string; id: string; label?: string } | null;
  changedFields: string[];
  outcome: string;
}

/** Como se lee cada accion. Lo que no este aqui se muestra tal cual. */
const ETIQUETA: Record<string, string> = {
  "immobili.delete": "Immobile eliminato",
  "clienti.delete": "Cliente eliminato",
  "proprietari.delete": "Proprietario eliminato",
  "user.create": "Utente creato",
  "user.update": "Utente modificato",
  "account.password": "Password cambiata",
  "auth.login": "Accesso",
  "calendar.link": "Google Calendar collegato",
  "cron.purge": "Pulizia automatica",
};

const COLOR: Record<string, string> = {
  "immobili.delete": "bg-rose-50 text-rose-700 border-rose-200",
  "clienti.delete": "bg-rose-50 text-rose-700 border-rose-200",
  "proprietari.delete": "bg-rose-50 text-rose-700 border-rose-200",
  "cron.purge": "bg-rose-50 text-rose-700 border-rose-200",
  "user.create": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "user.update": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "account.password": "bg-amber-50 text-amber-700 border-amber-200",
  "auth.login": "bg-slate-100 text-slate-600 border-slate-200",
  "calendar.link": "bg-violet-50 text-violet-700 border-violet-200",
};

const cuando = (ms: number) =>
  ms
    ? new Date(ms).toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function AuditSection() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [filtro, setFiltro] = useState("");

  const { user } = useAuth();
  const esPropietario = hasAtLeast(user?.ruolo, "propietario");

  // Paginacion por CURSOR, no por offset: esta es la unica tabla del CRM que
  // crece sin tope, y un offset obliga a Firestore a recorrer y facturar todo
  // lo que se salta.
  const cargar = async (desdeCursor: string | null, reiniciar: boolean) => {
    setCargando(true);
    setError(false);
    try {
      const sp = new URLSearchParams();
      if (desdeCursor) sp.set("cursor", desdeCursor);
      if (filtro) sp.set("action", filtro);
      const res = await fetch(`/api/admin/audit?${sp.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      setRegistros((prev) => (reiniciar ? body.data : [...prev, ...body.data]));
      setCursor(body.nextCursor);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  // Sin rol no se pide nada: el home lo carga todo el mundo y esta ruta
  // devolveria 403. Ocultar el componente no es seguridad —de eso se encarga
  // el servidor— pero pedir lo que se sabe que va a fallar tampoco sirve.
  useEffect(() => {
    if (!esPropietario) return;
    cargar(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, esPropietario]);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100/80 flex flex-wrap items-center gap-3">
        <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-md">
          <History className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-800">Registro attività</h2>
          <p className="text-xs text-slate-400 font-medium">
            Solo azioni critiche. Le voci si cancellano da sole dopo un anno.
          </p>
        </div>

        <div>
          <label htmlFor="filtro-azione" className="sr-only">
            Filtra per azione
          </label>
          <select
            id="filtro-azione"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white"
          >
            <option value="">Tutte le azioni</option>
            {Object.keys(ETIQUETA).map((a) => (
              <option key={a} value={a}>
                {ETIQUETA[a]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="px-6 py-10 text-center text-sm text-slate-400 font-medium">
          Impossibile caricare il registro.
        </p>
      )}

      {!error && registros.length === 0 && !cargando && (
        <p className="px-6 py-10 text-center text-sm text-slate-400 font-medium">
          Nessuna voce registrata.
        </p>
      )}

      <div className="divide-y divide-slate-100">
        {registros.map((r) => (
          <div key={r.id} className="px-6 py-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border flex-shrink-0 ${
                COLOR[r.action] ?? "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {ETIQUETA[r.action] ?? r.action}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-700 truncate">
                {r.target?.label || r.target?.id || "—"}
              </p>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                {r.actorEmail}
                {r.changedFields.length > 0 && (
                  <span className="text-slate-300"> · {r.changedFields.join(", ")}</span>
                )}
              </p>
            </div>

            <span className="text-[11px] font-semibold text-slate-400 flex-shrink-0">
              {cuando(r.at)}
            </span>
          </div>
        ))}
      </div>

      {cursor && (
        <div className="px-6 py-4 border-t border-slate-100">
          <button
            onClick={() => cargar(cursor, false)}
            disabled={cargando}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
            Carica altre
          </button>
        </div>
      )}
    </div>
  );
}
