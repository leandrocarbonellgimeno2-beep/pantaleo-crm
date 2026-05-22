"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo, useRef } from "react";
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
  Mail
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Agenda", href: "/agenda", icon: CalendarDays },
  { name: "Clienti", href: "/clienti", icon: Users },
  { name: "Immobili", href: "/immobili", icon: Home },
  { name: "Proprietari", href: "/proprietari", icon: UserSquare2 },
  { name: "Documenti", href: "/documenti", icon: FileText },
  { name: "Messaggi Web", href: "/messaggi-web", icon: Mail },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  // Derived dal context: nessun fetch separato qui dentro.
  const canViewMessages = useMemo(() => {
    const nomeL = (user?.nome || "").toLowerCase();
    return (
      nomeL.includes("leandro") ||
      nomeL.includes("francesco") ||
      nomeL.includes("segretaria") ||
      nomeL.includes("secretaria")
    );
  }, [user?.nome]);

  // EventSource con reconnessione automatica (exponential backoff).
  // EventSource del browser ritenta da solo, ma chiude su .onerror dopo certi
  // status. Qui costruiamo la connessione, e se viene chiusa la riapriamo
  // manualmente con backoff progressivo. Massimo 5 tentativi prima di mollare.
  const reconnectAttempts = useRef(0);
  useEffect(() => {
    if (!canViewMessages) return;
    let sse: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      sse = new EventSource("/api/messaggi-web/stream");

      sse.onopen = () => {
        reconnectAttempts.current = 0; // reset su connessione riuscita
      };

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const unread = data.filter((m: any) => !m.letto).length;
          setUnreadMsgCount(unread);
        } catch {}
      };

      sse.onerror = () => {
        if (closed) return;
        sse?.close();
        sse = null;
        const attempt = ++reconnectAttempts.current;
        if (attempt > 5) {
          console.warn("[Sidebar SSE] giving up after 5 reconnect attempts");
          return;
        }
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
        console.warn(`[Sidebar SSE] disconnected — reconnect ${attempt}/5 in ${delay}ms`);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      sse?.close();
    };
  }, [canViewMessages]);

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
            <h1 className="text-base font-black bg-gradient-to-r from-indigo-700 to-violet-600 bg-clip-text text-transparent whitespace-nowrap">
              Pantaleo CRM
            </h1>
          </div>
        </div>
        
        {/* ── Navigation ── */}
        <nav className="flex-1 px-3 py-4 space-y-1.5">
          {navigation.filter(i => i.name !== "Messaggi Web" || canViewMessages).map((item) => {
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
                <div className="relative">
                  <item.icon className={cn(
                    "h-5 w-5 flex-shrink-0 transition-all duration-200 group-hover:scale-110",
                    isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                  )} />
                  {item.name === "Messaggi Web" && unreadMsgCount > 0 && (
                     <span className="absolute -top-2 -right-2 bg-rose-500 text-white w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold shadow-sm animate-pulse">
                       {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
                     </span>
                  )}
                </div>
                
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
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 flex items-center justify-around px-2 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {navigation.filter(i => i.name !== "Messaggi Web" || canViewMessages).map((item) => {
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
                "p-1.5 rounded-xl transition-all duration-300 relative",
                isActive ? "bg-indigo-100 text-indigo-700 scale-110" : "text-slate-400"
              )}>
                <item.icon strokeWidth={isActive ? 2.5 : 2} className="h-5 w-5" />
                {item.name === "Messaggi Web" && unreadMsgCount > 0 && (
                   <span className="absolute -top-1 -right-1 bg-rose-500 text-white w-3.5 h-3.5 flex items-center justify-center rounded-full text-[8px] font-bold shadow-sm animate-pulse">
                     {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
                   </span>
                )}
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
      </div>
    </>
  );
}
