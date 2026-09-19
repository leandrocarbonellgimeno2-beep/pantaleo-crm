"use client";

import useSWR from "swr";
import { Activity, Loader2 } from "lucide-react";

interface Presencia {
  email: string;
  nome: string;
  role: string;
  currentPage: string;
  lastSeenAt: number;
  online: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

/** "hace 2 min", "hace 1 h"... Sin libreria: es una sola forma de fecha. */
function desde(ms: number): string {
  if (!ms) return "—";
  const seg = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seg < 60) return "adesso";
  const min = Math.floor(seg / 60);
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h fa`;
  return new Date(ms).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

const NOMBRE_PANTALLA: Record<string, string> = {
  "/": "Dashboard",
  "/agenda": "Agenda",
  "/clienti": "Clienti",
  "/immobili": "Immobili",
  "/proprietari": "Proprietari",
  "/documenti": "Documenti",
  "/admin": "Amministrazione",
};

export default function PresenceSection() {
  // Es el unico refreshInterval del proyecto, y esta justificado: la gracia de
  // la presencia es que este al dia. 30 segundos con 4 agentes son unas pocas
  // lecturas por minuto, y solo mientras el panel esta abierto.
  const { data, isLoading } = useSWR<{ data: Presencia[]; online: number }>(
    "/api/presence",
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true },
  );

  const gente = data?.data ?? [];
  const conectados = data?.online ?? 0;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100/80 flex items-center gap-3">
        <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-200/50">
          <Activity className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-slate-800">Chi è online</h2>
          <p className="text-xs text-slate-400 font-medium">
            {conectados > 0 ? `${conectados} connesso${conectados === 1 ? "" : "i"} adesso` : "Nessuno connesso"}
          </p>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
      </div>

      {gente.length === 0 && !isLoading && (
        <p className="px-6 py-10 text-center text-sm text-slate-400 font-medium">
          Ancora nessuna attività registrata.
        </p>
      )}

      <div className="divide-y divide-slate-100">
        {gente.map((p) => (
          <div key={p.email} className="px-6 py-3.5 flex items-center gap-3">
            <span
              className={`h-2 w-2 rounded-full flex-shrink-0 ${
                p.online ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
              }`}
              aria-label={p.online ? "Connesso" : "Non connesso"}
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-slate-800 truncate">{p.nome || p.email}</p>
              <p className="text-[11px] text-slate-400 font-medium truncate">{p.email}</p>
            </div>
            <div className="text-right">
              {p.online ? (
                <p className="text-xs font-bold text-slate-600">
                  {NOMBRE_PANTALLA[p.currentPage] ?? p.currentPage ?? "—"}
                </p>
              ) : (
                <p className="text-xs font-semibold text-slate-400">{desde(p.lastSeenAt)}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
