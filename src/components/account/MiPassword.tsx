"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Cambio de la contraseña propia.
 *
 * VIVÍA DENTRO DEL PANEL DE ADMINISTRACIÓN, y por eso se ha sacado: al mover
 * ese panel a una pestaña que solo ve el propietario, este bloque se habría
 * ido con él y un vendedor o una secretaria se habrían quedado sin ninguna
 * forma de cambiar su propia contraseña desde el CRM. No es administración de
 * la agencia: es la cuenta de cada uno, y lo necesitan todos los roles.
 *
 * `/api/account/password` no pide rol —solo sesión válida y la contraseña
 * actual— precisamente porque es una acción sobre uno mismo.
 */

const PASSWORD_MIN = 10;

const campoClase =
  "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export function MiPassword() {
  const { user } = useAuth();
  const [campos, setCampos] = useState({ actual: "", nueva: "" });
  const [guardando, setGuardando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passwordActual: campos.actual,
          nuevaPassword: campos.nueva,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || "Impossibile cambiare la password.");
        return;
      }
      toast.success("Password aggiornata.");
      setCampos({ actual: "", nueva: "" });
    } catch {
      toast.error("Errore di rete. Riprova.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100/80 flex items-center gap-3">
        <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-md">
          <KeyRound className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-slate-800">La mia password</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5 truncate">
            Cambia la password del tuo account: {user?.email}
          </p>
        </div>
      </div>

      <form onSubmit={enviar} className="p-6 grid gap-4 sm:grid-cols-3 sm:items-end">
        <div>
          <label
            htmlFor="pwd-actual"
            className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5"
          >
            Password attuale
          </label>
          <input
            id="pwd-actual"
            type="password"
            required
            autoComplete="current-password"
            value={campos.actual}
            onChange={(e) => setCampos({ ...campos, actual: e.target.value })}
            className={campoClase}
          />
        </div>

        <div>
          <label
            htmlFor="pwd-nueva"
            className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5"
          >
            Nuova password
          </label>
          <input
            id="pwd-nueva"
            type="password"
            required
            minLength={PASSWORD_MIN}
            autoComplete="new-password"
            value={campos.nueva}
            onChange={(e) => setCampos({ ...campos, nueva: e.target.value })}
            className={campoClase}
          />
        </div>

        <button
          type="submit"
          disabled={guardando}
          className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-slate-800 px-5 text-sm font-black text-white transition-colors hover:bg-slate-900 disabled:opacity-60"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
          Aggiorna
        </button>
      </form>
    </div>
  );
}
