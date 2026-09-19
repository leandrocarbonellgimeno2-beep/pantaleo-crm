"use client";

/**
 * Panel de administracion — gestion de usuarios.
 *
 * El acceso lo decide el middleware, que redirige a la portada a cualquiera
 * por debajo de secretaria. Lo de aqui es la experiencia, no la barrera: el
 * backend vuelve a comprobarlo todo en /api/admin/users.
 */

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ShieldCheck,
  UserPlus,
  Loader2,
  Mail,
  X,
  Crown,
  ClipboardList,
  Briefcase,
  Eye,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasAtLeast, ROLES, type Role } from "@/lib/roles";

interface UsuarioFila {
  id: string;
  email: string;
  nome: string;
  role: Role;
  status: "attivo" | "bloccato";
  createdAt: number;
  createdBy: string;
}

const PASSWORD_MIN = 10;

// Etiqueta y aspecto de cada rol. El orden es el de la jerarquia.
const ROL_INFO: Record<Role, { etiqueta: string; descripcion: string; icon: React.ElementType; clase: string }> = {
  propietario: {
    etiqueta: "Propietario",
    descripcion: "Controllo totale",
    icon: Crown,
    clase: "bg-amber-50 text-amber-700 border-amber-200",
  },
  secretaria: {
    etiqueta: "Secretaria",
    descripcion: "Gestione dell'agenzia",
    icon: ClipboardList,
    clase: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  vendedor: {
    etiqueta: "Vendedor",
    descripcion: "Uso quotidiano",
    icon: Briefcase,
    clase: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  agente: {
    etiqueta: "Agente",
    descripcion: "Sola lettura",
    icon: Eye,
    clase: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

const jsonFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

const formatearFecha = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function AdminPage() {
  const { user } = useAuth();
  const esPropietario = hasAtLeast(user?.ruolo, "propietario");

  const { data, isLoading, error, mutate } = useSWR<{ data: UsuarioFila[] }>(
    "/api/admin/users",
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 10_000 },
  );

  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", password: "", role: "vendedor" as Role });

  const usuarios = data?.data ?? [];

  // Un propietario puede crear cualquier rol; una secretaria, todos menos
  // propietario. Es el espejo de la regla que aplica el backend: aqui solo se
  // evita ofrecer una opcion que acabaria en un 403.
  const rolesDisponibles = (ROLES as readonly Role[]).filter(
    (r) => r !== "propietario" || esPropietario,
  );

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body?.error || "Impossibile creare l'utente.");
        return;
      }

      toast.success(`Utente ${form.email} creato.`);
      setForm({ nome: "", email: "", password: "", role: "vendedor" });
      setAbierto(false);
      mutate();
    } catch {
      toast.error("Errore di rete. Riprova.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ── Cabecera ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-md">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Amministrazione
            </h1>
          </div>
          <p className="text-slate-500 font-medium">
            Utenti che possono accedere al CRM e cosa può fare ognuno.
          </p>
        </div>

        <button
          onClick={() => setAbierto(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:scale-[1.02]"
        >
          <UserPlus className="h-4 w-4" />
          Nuovo utente
        </button>
      </div>

      {/* ── Leyenda de roles ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(ROLES as readonly Role[]).map((r) => {
          const info = ROL_INFO[r];
          return (
            <div key={r} className={`rounded-2xl border p-3.5 ${info.clase}`}>
              <div className="flex items-center gap-2">
                <info.icon className="h-4 w-4 flex-shrink-0" />
                <span className="font-black text-sm">{info.etiqueta}</span>
              </div>
              <p className="text-[11px] font-semibold mt-1 opacity-80">{info.descripcion}</p>
            </div>
          );
        })}
      </div>

      {/* ── Listado ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100/80">
          <h2 className="font-bold text-slate-800">
            Utenti {usuarios.length > 0 && <span className="text-slate-400 font-medium">({usuarios.length})</span>}
          </h2>
        </div>

        {isLoading && (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            <p className="text-sm font-semibold text-slate-400">Caricamento utenti...</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="py-16 text-center px-6">
            <p className="font-bold text-slate-700">Impossibile caricare gli utenti.</p>
            <p className="text-sm text-slate-400 mt-1">Riprova fra un momento.</p>
          </div>
        )}

        {!isLoading && !error && usuarios.length === 0 && (
          <div className="py-16 text-center px-6">
            <ShieldCheck className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="font-bold text-slate-700">Ancora nessun utente registrato.</p>
            <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
              Gli utenti appaiono qui dopo il primo accesso, oppure quando li crei da questa pagina.
            </p>
          </div>
        )}

        {/* Una tarjeta por usuario en vez de una tabla: una rejilla de seis
            columnas es ilegible por debajo de los 500 px, y este panel se
            consulta tambien desde el movil. */}
        <div className="divide-y divide-slate-100">
          {usuarios.map((u) => {
            const info = ROL_INFO[u.role] ?? ROL_INFO.agente;
            return (
              <div key={u.id} className="px-6 py-4 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-slate-50/60 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 truncate">{u.nome || "—"}</span>
                    {u.status === "bloccato" && (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200">
                        Disattivato
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-400 flex items-center gap-1.5 truncate font-medium mt-0.5">
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    {u.email}
                  </p>
                </div>

                <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1 rounded-lg border ${info.clase}`}>
                  <info.icon className="h-3 w-3" />
                  {info.etiqueta}
                </span>

                <div className="text-right text-[11px] text-slate-400 font-medium w-full sm:w-auto">
                  <p>Creato il {formatearFecha(u.createdAt)}</p>
                  {u.createdBy && <p className="truncate">da {u.createdBy}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Alta ── */}
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-black text-slate-800 text-lg">Nuovo utente</h2>
              <button
                onClick={() => setAbierto(false)}
                aria-label="Chiudi"
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={enviar} className="p-6 space-y-4">
              <div>
                <label htmlFor="nuevo-nome" className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  Nome
                </label>
                <input
                  id="nuevo-nome"
                  type="text"
                  required
                  maxLength={120}
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label htmlFor="nuevo-email" className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  Email
                </label>
                <input
                  id="nuevo-email"
                  type="email"
                  required
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div>
                <label htmlFor="nuevo-password" className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  Password
                </label>
                <input
                  id="nuevo-password"
                  type="text"
                  required
                  minLength={PASSWORD_MIN}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                {/* Visible a proposito: quien da de alta tiene que poder leerla
                    para comunicarsela a la persona. El campo se envia una sola
                    vez y despues solo queda el hash. */}
                <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                  Minimo {PASSWORD_MIN} caratteri. Comunicala all&apos;utente: non sarà più visibile.
                </p>
              </div>

              <div>
                <label htmlFor="nuevo-role" className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  Ruolo
                </label>
                <select
                  id="nuevo-role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white"
                >
                  {rolesDisponibles.map((r) => (
                    <option key={r} value={r}>
                      {ROL_INFO[r].etiqueta} — {ROL_INFO[r].descripcion}
                    </option>
                  ))}
                </select>
                {!esPropietario && (
                  <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                    Solo un propietario può creare un altro propietario.
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700 disabled:opacity-60"
                >
                  {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                  {guardando ? "Creazione..." : "Crea utente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
