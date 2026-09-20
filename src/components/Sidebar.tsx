"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Home,
  UserSquare2,
  FileText,
  LogOut,
  ChevronRight,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Agenda", href: "/agenda", icon: CalendarDays },
  { name: "Clienti", href: "/clienti", icon: Users },
  { name: "Immobili", href: "/immobili", icon: Home },
  { name: "Proprietari", href: "/proprietari", icon: UserSquare2 },
  { name: "Documenti", href: "/documenti", icon: FileText },
];

// Ya no hay enlace a «Admin»: la administracion dejo de ser una pantalla
// aparte y vive dentro del home, en su propia pestaña. Quien tenga rol
// propietario la ve nada mas entrar; quien no, no ve ni la pestaña.

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const items = navigation;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error("Errore logout:", e);
      router.push("/login");
    }
  };

  return (
    <>
      {/* ═══ DESKTOP SIDEBAR (md and up) ═══ */}
      {/* Spacer: reserves the mini sidebar width in the document flow */}
      <div className="hidden md:block w-[72px] flex-shrink-0" />

      {/* Actual sidebar: fixed position, expands on hover */}
      <div
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={cn(
          "hidden md:flex fixed top-0 left-0 h-full flex-col bg-white border-r border-slate-200/80 z-40",
          "transition-all duration-300 ease-in-out shadow-sm",
          expanded ? "w-64 shadow-xl shadow-slate-200/50" : "w-[72px]"
        )}
      >
        {/* ── Header ── */}
        <div className="flex h-16 items-center border-b border-slate-100 px-4 overflow-hidden">
          <div className={cn(
            "h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-300/30",
            "transition-transform duration-300",
            expanded ? "scale-100" : "scale-95"
          )}>
            <span className="text-white font-black text-sm select-none">P</span>
          </div>
          <div className={cn(
            "ml-3 overflow-hidden transition-all duration-300",
            expanded ? "opacity-100 w-auto" : "opacity-0 w-0"
          )}>
            {/* La marca NO es el h1 de la pagina: se repite en las diez
                pantallas y competia con el titulo real, dejando dos h1 por
                pagina. El h1 lo pone PageHeader, que es el titulo de verdad. */}
            <span className="text-base font-black bg-gradient-to-r from-indigo-700 to-violet-600 bg-clip-text text-transparent whitespace-nowrap">
              Pantaleo CRM
            </span>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 px-3 py-4 space-y-1.5">
          {items.map((item) => {
            const isActive = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                title={!expanded ? item.name : undefined}
                className={cn(
                  "group flex items-center rounded-xl transition-all duration-200 relative overflow-hidden",
                  expanded ? "px-3.5 py-2.5" : "px-0 py-2.5 justify-center",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                )}
              >
                <item.icon className={cn(
                  "h-5 w-5 flex-shrink-0 transition-all duration-200 group-hover:scale-110",
                  isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                )} />

                <span className={cn(
                  "text-sm font-bold whitespace-nowrap overflow-hidden transition-all duration-300",
                  expanded ? "ml-3 opacity-100 w-auto" : "ml-0 opacity-0 w-0"
                )}>
                  {item.name}
                </span>

                {isActive && expanded && (
                  <ChevronRight className="h-4 w-4 ml-auto text-indigo-400 opacity-70 flex-shrink-0" />
                )}

                {/* Active dot indicator when collapsed */}
                {isActive && !expanded && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── Logout ── */}
        <div className="px-3 py-4 border-t border-slate-100 mt-auto">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title={!expanded ? "Esci" : undefined}
            className={cn(
              "flex w-full items-center rounded-xl text-sm font-medium text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all duration-200 disabled:opacity-50",
              expanded ? "px-3.5 py-2.5" : "px-0 py-2.5 justify-center"
            )}
          >
            {loggingOut ? (
              <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" />
            ) : (
              <LogOut className="h-5 w-5 flex-shrink-0" />
            )}
            <span className={cn(
              "whitespace-nowrap overflow-hidden transition-all duration-300",
              expanded ? "ml-3 opacity-100 w-auto" : "ml-0 opacity-0 w-0"
            )}>
              {loggingOut ? "Uscita..." : "Esci"}
            </span>
          </button>
        </div>
      </div>

      {/* ═══ MOBILE BOTTOM NAVIGATION (below md) ═══ */}
      {/* <nav> y no <div>: axe marcaba sus seis etiquetas como contenido fuera
          de cualquier landmark, en TODAS las paginas. Para quien navega por
          landmarks, la navegacion principal del movil sencillamente no existia. */}
      <nav aria-label="Navigazione principale" className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 flex items-center justify-around px-2 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {items.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className="flex flex-col items-center justify-center p-2 rounded-xl transition-all"
            >
              <div className={cn(
                "p-1.5 rounded-xl transition-all duration-300",
                isActive ? "bg-indigo-100 text-indigo-700 scale-110" : "text-slate-400"
              )}>
                <item.icon strokeWidth={isActive ? 2.5 : 2} className="h-5 w-5" />
              </div>
              <span className={cn(
                "text-[10px] sm:text-xs font-bold mt-1 max-w-[60px] truncate transition-colors",
                isActive ? "text-indigo-700" : "text-slate-500"
              )}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
