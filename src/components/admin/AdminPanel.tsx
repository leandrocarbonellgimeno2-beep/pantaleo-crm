"use client";

/**
 * Panel de administracion — gestion de usuarios.
 *
 * Vivia en su propia ruta /admin. Ahora es una seccion del home, dentro de la
 * pestana «Amministrazione», que solo se pinta para el rol propietario.
 *
 * OCULTAR ESTO EN REACT NO ES SEGURIDAD, y conviene tenerlo presente: la
 * barrera de verdad esta en el servidor. /api/admin/users vuelve a comprobar
 * el rol contra el token firmado en CADA peticion, con sus cuatro
 * salvaguardas —no tocar propietarios sin serlo, no degradarse a uno mismo, no
 * dejar la agencia sin propietarios y no bloquearse solo— y la revocacion por
 * tokenVersion sigue intacta. Lo de aqui es la experiencia: que un vendedor no
 * vea una tabla vacia llena de errores, que parece un fallo del CRM en vez de
 * una falta de permiso.
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
  KeyRound,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useDialog } from "@/hooks/useDialog";
import { hasAtLeast, ROLES, type Role } from "@/lib/roles";
import PresenceSection from "@/components/admin/PresenceSection";
import AuditSection from "@/components/admin/AuditSection";
import DatiAziendaliSection from "@/components/admin/DatiAziendaliSection";

interface UsuarioFila {
  id: string;
  email: string;
  nome: string;
  role: Role;
  status: "attivo" | "bloccato";
  mustResetPassword: boolean;
  createdAt: number;
  createdBy: string;
}

const PASSWORD_MIN = 10;

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

const campoClase =
  "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export function AdminPanel() {
  const { user } = useAuth();
  const esPropietario = hasAtLeast(user?.ruolo, "propietario");
  const miEmail = (user?.email ?? "").trim().toLowerCase();

  // Clave condicional. El home lo carga TODO el mundo, asi que sin esto la
  // consola de un vendedor se llenaria de 403 y se gastarian peticiones en
  // algo que nunca va a poder ver. `null` como clave hace que SWR no pida nada.
  const { data, isLoading, error, mutate } = useSWR<{ data: UsuarioFila[] }>(
    esPropietario ? "/api/admin/users" : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 10_000 },
  );

  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", password: "", role: "vendedor" as Role });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null);

  // Un dialogo por modal, cada uno con su propio booleano: los dos pueden estar
  // montados a la vez (se puede abrir el alta y, por debajo, seguir el reset),
  // y compartir una sola llamada haria que Escape cerrase el que no toca.
  // Ninguno de los dos se cierra al pinchar el fondo: son formularios con
  // credenciales a medias y un clic despistado obligaria a reescribirlo todo.
  const dialogoAlta = useDialog<HTMLDivElement>({
    abierto,
    alCerrar: () => setAbierto(false),
  });
  const dialogoReset = useDialog<HTMLDivElement>({
    abierto: reset !== null,
    alCerrar: () => setReset(null),
  });

  const usuarios = data?.data ?? [];

  const rolesDisponibles = (ROLES as readonly Role[]).filter(
    (r) => r !== "propietario" || esPropietario,
  );

  /** Llama al PATCH y refresca. Centraliza el manejo de errores del servidor. */
  const modificar = async (email: string, cambios: Record<string, unknown>, exito: string) => {
    setOcupado(email);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...cambios }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || "Operazione non riuscita.");
        return false;
      }
      toast.success(exito);
      mutate();
      return true;
    } catch {
      toast.error("Errore di rete. Riprova.");
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const crear = async (e: React.FormEvent) => {
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
            const esYo = u.email.trim().toLowerCase() === miEmail;
            // Espejo de lo que aplica el backend: la secretaria no toca a un
            // propietario, y nadie se degrada ni se bloquea a si mismo.
            const puedeEditar = (u.role !== "propietario" || esPropietario) && !esYo;
            const trabajando = ocupado === u.email;

            return (
              <div
                key={u.id}
                className="px-6 py-4 flex flex-wrap items-center gap-x-4 gap-y-3 hover:bg-slate-50/60 transition-colors"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 truncate">{u.nome || "—"}</span>
                    {esYo && (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200">
                        Tu
                      </span>
                    )}
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
                  <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                    Creato il {formatearFecha(u.createdAt)}
                    {u.createdBy ? ` da ${u.createdBy}` : ""}
                  </p>
                </div>

                {/* Rol: select si se puede editar, insignia si no */}
                {puedeEditar ? (
                  <div className="flex items-center gap-2">
                    <label htmlFor={`role-${u.id}`} className="sr-only">
                      Ruolo di {u.email}
                    </label>
                    <select
                      id={`role-${u.id}`}
                      value={u.role}
                      disabled={trabajando}
                      onChange={(e) =>
                        modificar(u.email, { role: e.target.value }, `Ruolo di ${u.email} aggiornato.`)
                      }
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white disabled:opacity-50"
                    >
                      {rolesDisponibles.map((r) => (
                        <option key={r} value={r}>
                          {ROL_INFO[r].etiqueta}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1 rounded-lg border ${info.clase}`}
                    title={esYo ? "Non puoi cambiare il tuo stesso ruolo" : undefined}
                  >
                    <info.icon className="h-3 w-3" />
                    {info.etiqueta}
                  </span>
                )}

                {/* Acciones */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setReset({ email: u.email, password: "" })}
                    disabled={!puedeEditar || trabajando}
                    title="Imposta una nuova password"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Password
                  </button>

                  <button
                    onClick={() =>
                      modificar(
                        u.email,
                        { status: u.status === "attivo" ? "bloccato" : "attivo" },
                        u.status === "attivo"
                          ? `${u.email} disattivato.`
                          : `${u.email} riattivato.`,
                      )
                    }
                    disabled={!puedeEditar || trabajando}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      u.status === "attivo"
                        ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                        : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                    }`}
                  >
                    {trabajando ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : u.status === "attivo" ? (
                      <Ban className="h-3.5 w-3.5" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    {u.status === "attivo" ? "Disattiva" : "Riattiva"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Datos de la agencia para las paginas legales ── */}
      <DatiAziendaliSection />

      {/* ── Presencia y trazabilidad ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <PresenceSection />
        <AuditSection />
      </div>

      {/* ── Modal: nuevo usuario ── */}
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div
            ref={dialogoAlta.ref}
            {...dialogoAlta.props}
            aria-labelledby="titolo-nuovo-utente"
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto outline-none"
          >
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 id="titolo-nuovo-utente" className="font-black text-slate-800 text-lg">
                Nuovo utente
              </h2>
              <button
                onClick={() => setAbierto(false)}
                aria-label="Chiudi"
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={crear} className="p-6 space-y-4">
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
                  className={campoClase}
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
                  className={campoClase}
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
                  className={`${campoClase} font-mono`}
                />
                {/* Visible a proposito: quien da de alta tiene que poder leerla
                    para comunicarsela a la persona. Se envia una sola vez y
                    despues solo queda el hash. */}
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
                  className={`${campoClase} bg-white`}
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

      {/* ── Modal: nueva contrasena para otro usuario ── */}
      {reset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div
            ref={dialogoReset.ref}
            {...dialogoReset.props}
            aria-labelledby="titolo-nuova-password"
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md outline-none"
          >
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 id="titolo-nuova-password" className="font-black text-slate-800 text-lg">
                Nuova password
              </h2>
              <button
                onClick={() => setReset(null)}
                aria-label="Chiudi"
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await modificar(
                  reset.email,
                  { password: reset.password },
                  `Password di ${reset.email} aggiornata.`,
                );
                if (ok) setReset(null);
              }}
              className="p-6 space-y-4"
            >
              <p className="text-sm text-slate-500 font-medium">
                Stai impostando una nuova password per <strong className="text-slate-700">{reset.email}</strong>.
                La sua sessione attuale verrà chiusa.
              </p>
              <div>
                <label htmlFor="reset-password" className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                  Password
                </label>
                <input
                  id="reset-password"
                  type="text"
                  required
                  minLength={PASSWORD_MIN}
                  autoComplete="new-password"
                  value={reset.password}
                  onChange={(e) => setReset({ ...reset, password: e.target.value })}
                  className={`${campoClase} font-mono`}
                />
                <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                  Minimo {PASSWORD_MIN} caratteri. Comunicala all&apos;utente: non sarà più visibile.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReset(null)}
                  className="flex-1 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={ocupado === reset.email}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700 disabled:opacity-60"
                >
                  {ocupado === reset.email && <Loader2 className="h-4 w-4 animate-spin" />}
                  Imposta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
