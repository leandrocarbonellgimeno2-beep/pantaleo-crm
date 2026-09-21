"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail, Eye, EyeOff, Shield } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Errore sconosciuto. Riprova.");
        setLoading(false);
        return;
      }

      // Login riuscito → redirect al dashboard
      router.push("/");
      router.refresh();
    } catch (err) {
      setError("Errore di connessione. Verifica la tua rete.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden">

      {/* ── Fondo: Imagen de villa italiana + overlay oscuro ── */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1552317951-e403d09a0614?q=80&w=2000')`,
        }}
      />
      {/* Overlay oscuro con gradiente */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-indigo-950/80" />

      {/* ── Elementos decorativos de luz ambiental ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-blue-400/5 rounded-full blur-[100px]" />
      </div>

      {/* ── Contenido principal ── */}
      <div className="relative z-10 w-full max-w-[440px] mx-4">

        {/* ── Branding Premium ── */}
        <div className="text-center mb-10">
          {/* Logo icono con efecto glow */}
          <div className="inline-flex items-center justify-center w-[72px] h-[72px] bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 rounded-2xl shadow-2xl shadow-indigo-500/30 mb-6 transform hover:scale-105 hover:shadow-indigo-500/50 transition-all duration-500">
            <Shield className="w-9 h-9 text-white drop-shadow-sm" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight drop-shadow-lg">
            Pantaleo
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent"> CRM</span>
          </h1>
          <p className="text-white/50 font-medium mt-3 text-sm tracking-[0.15em] uppercase">
            Gestione Immobiliare d&apos;Eccellenza
          </p>
        </div>

        {/* ── Glassmorphism Card ── */}
        <form
          onSubmit={handleSubmit}
          className="relative bg-white/[0.08] backdrop-blur-xl rounded-3xl border border-white/[0.15] p-8 sm:p-10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]"
        >
          {/* Borde superior brillante decorativo */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

          {/* Título interno */}
          <h2 className="text-white font-bold text-lg mb-1">Bentornato</h2>
          <p className="text-white/40 text-sm mb-7">Accedi al tuo account per continuare</p>

          {/* Messaggio di errore */}
          {error && (
            <div className="mb-6 px-4 py-3.5 bg-red-500/15 border border-red-500/25 rounded-2xl flex items-center gap-3 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0 animate-pulse" />
              <span className="text-red-300 text-sm font-medium">{error}</span>
            </div>
          )}

          {/* Campo Email */}
          <div className="mb-5">
            <label className="block text-[11px] font-bold text-white/50 uppercase tracking-[0.15em] mb-2.5 ml-1">
              Email
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white/[0.06] group-focus-within:bg-indigo-500/20 transition-colors duration-300">
                <Mail className="h-4 w-4 text-white/40 group-focus-within:text-indigo-400 transition-colors duration-300" />
              </div>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@pantaleo.it"
                required
                autoComplete="email"
                autoFocus
                className="w-full pl-14 pr-4 py-4 bg-white/[0.05] border border-white/[0.08] rounded-2xl text-white font-medium placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] focus:ring-2 focus:ring-indigo-500/20 transition-all duration-300 text-[15px]"
              />
            </div>
          </div>

          {/* Campo Password */}
          <div className="mb-8">
            <label className="block text-[11px] font-bold text-white/50 uppercase tracking-[0.15em] mb-2.5 ml-1">
              Password
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-white/[0.06] group-focus-within:bg-indigo-500/20 transition-colors duration-300">
                <Lock className="h-4 w-4 text-white/40 group-focus-within:text-indigo-400 transition-colors duration-300" />
              </div>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                required
                autoComplete="current-password"
                className="w-full pl-14 pr-14 py-4 bg-white/[0.05] border border-white/[0.08] rounded-2xl text-white font-medium placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] focus:ring-2 focus:ring-indigo-500/20 transition-all duration-300 text-[15px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors duration-200 p-1.5 rounded-lg hover:bg-white/[0.06]"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>

          {/* Bottone Submit con degradado vibrante */}
          <button
            id="login-submit"
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-bold text-sm uppercase tracking-[0.12em] rounded-2xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/40 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-lg flex items-center justify-center gap-3 transform hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Accesso in corso...</span>
              </>
            ) : (
              <span>Accedi</span>
            )}
          </button>

          {/* Divider decorativo */}
          <div className="flex items-center gap-4 mt-7">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-white/10" />
            <span className="text-white/20 text-[11px] font-semibold tracking-widest uppercase">Accesso Sicuro</span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-white/10" />
          </div>
        </form>

        {/* ── Footer ── */}
        <p className="text-center text-white/20 text-xs font-medium mt-8 tracking-wide">
          © 2026 Immobiliare Pantaleo · Marsala (TP)
        </p>

        {/*
          Los dos enlaces legales van AQUI, en la unica pantalla que se ve sin
          sesion. Google los visita desde su propia infraestructura para
          publicar la aplicacion OAuth, y mientras esa app no este publicada el
          token del calendario caduca cada siete dias.

          `<a>` y no `<Link>`: son paginas estaticas fuera del arbol de la
          aplicacion y esta pantalla no gana nada precargandolas.
        */}
        <nav className="mt-4 flex items-center justify-center gap-5 text-[11px] font-semibold tracking-wide">
          <a href="/privacy" className="text-white/25 hover:text-white/60 transition-colors">
            Privacy
          </a>
          <span className="text-white/10" aria-hidden="true">·</span>
          <a href="/terms" className="text-white/25 hover:text-white/60 transition-colors">
            Termini di Servizio
          </a>
        </nav>
      </div>
    </div>
  );
}
