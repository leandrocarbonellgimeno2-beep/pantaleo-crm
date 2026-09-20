"use client";

import { useState } from 'react';
import useSWR from 'swr';
import { esFuenteLocal } from '@/lib/image-optimizable';
import {
  Users, Home as HomeIcon,
  Plus, MapPin, Loader2, Briefcase,
  Building2, CalendarDays, FileText, ChevronRight,
  Zap, Tag, KeyRound, PauseCircle,
  ShieldCheck, LayoutDashboard
} from "lucide-react";
import { hasAtLeast } from '@/lib/roles';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { MiPassword } from '@/components/account/MiPassword';
import Link from 'next/link';
import NextImage from 'next/image';

// Helper to format date in Italian
const formatDateItalian = () => {
  const date = new Date();
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('it-IT', options).replace(/^\w/, (c) => c.toUpperCase());
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
};

const jsonFetcher = (url: string) => fetch(url).then(r => r.json());

interface StatsResponse {
  immobiliAttivi: number;
  immobiliSospesi: number;
  immobiliVendita: number;
  immobiliAffitto: number;
  clientiTotali: number;
  proprietariTotali: number;
}

export default function DashboardPage() {
  // today must be inside the component so it refreshes if the tab stays open past midnight
  const today = new Date().toISOString().split('T')[0];

  // SWR cache: re-navigating to dashboard skips all 4 fetches for 30s
  //
  // Los dos listados van ahora con `limit`: el dashboard pinta 4 inmuebles y
  // usa 2 clientes en el feed, y antes descargaba las colecciones enteras
  // (hasta 1000 + 1500 documentos) para luego hacer .slice(0, 4). El limit se
  // empuja a Firestore, no solo al recorte de salida.
  //
  // Contrapartida honesta: la clave anterior coincidia caracter por caracter
  // con la que construye useImmobili con los filtros por defecto, asi que ir
  // del dashboard a /immobili reaprovechaba esta misma respuesta desde la
  // cache de SWR. Al anadir &limit=4 son claves distintas y /immobili vuelve a
  // pedir su catalogo. Compensa igualmente: el caso normal es entrar al
  // dashboard y quedarse, y ahi se pasa de ~1.260 lecturas a unas pocas decenas.
  const { data: immData, isLoading: immLoading } = useSWR('/api/immobili?status=attivi&type=tutti&limit=4', jsonFetcher, { dedupingInterval: 30_000, revalidateOnFocus: false });
  const { data: cliData, isLoading: cliLoading } = useSWR('/api/clienti?limit=4', jsonFetcher, { dedupingInterval: 30_000, revalidateOnFocus: false });
  const { data: agendaData, isLoading: agendaLoading } = useSWR(`/api/appointments?date=${today}`, jsonFetcher, { dedupingInterval: 30_000, revalidateOnFocus: false });
  const { data: sessionData } = useSWR('/api/auth/session', jsonFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 });

  // Contadores por agregacion: 8 count() en el servidor (~16 lecturas) en vez
  // de descargar las colecciones para contarlas en el navegador. La ruta ya
  // existia, con Cache-Control s-maxage=60, y no la consumia nadie.
  //
  // Queda FUERA del gate de `loading` a proposito: las tarjetas se rellenan
  // solas cuando llega la respuesta y mientras tanto muestran un guion. Meterla
  // en el gate haria que una peticion mas retrasara la pagina entera.
  const { data: stats } = useSWR<StatsResponse>('/api/stats', jsonFetcher, { dedupingInterval: 60_000, revalidateOnFocus: false });

  const loading = immLoading || cliLoading || agendaLoading;

  const recentImmobili = (immData?.data || []).slice(0, 4);
  const recentClienti = (Array.isArray(cliData) ? cliData : (cliData?.data || [])).slice(0, 4);
  const todayAppointments = (Array.isArray(agendaData) ? agendaData : []).slice(0, 4);
  const userName = sessionData?.nome ? sessionData.nome.split(' ')[0] : 'Utente';

  // La administración dejó de ser una pantalla aparte y vive aquí, en su propia
  // pestaña. El rol viene de /api/auth/session, que esta pantalla ya pedía para
  // el saludo: no hay ninguna petición nueva por esto.
  //
  // OCULTAR LA PESTAÑA NO ES SEGURIDAD. La barrera está en el servidor:
  // /api/admin/* comprueba el rol contra el token firmado en cada petición y
  // devuelve 403 a quien no llegue. Esto solo evita enseñar una puerta que no
  // abre, y que la consola de un vendedor se llene de errores.
  const esPropietario = hasAtLeast(sessionData?.ruolo, 'propietario');
  const [pestana, setPestana] = useState<'lavoro' | 'admin'>('lavoro');

  // El panel de administración se monta la PRIMERA vez que se abre, y a partir
  // de ahí se queda montado aunque se cambie de pestaña. Así no se gasta ni una
  // lectura en quien nunca lo abre, y quien lo usa no pierde el listado ni la
  // página de movimientos cada vez que vuelve a su trabajo.
  const [adminAbierto, setAdminAbierto] = useState(false);

  const abrir = (cual: 'lavoro' | 'admin') => {
    setPestana(cual);
    if (cual === 'admin') setAdminAbierto(true);
  };

  // Flechas izquierda y derecha entre pestañas, como manda el patrón ARIA.
  const navegarConTeclado = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const otra = pestana === 'lavoro' ? 'admin' : 'lavoro';
    abrir(otra);
    document.getElementById('tab-' + otra)?.focus();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-500/30 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
            <div className="absolute inset-0 h-16 w-16 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 animate-ping opacity-20" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-600">Caricamento dashboard...</p>
            <p className="text-xs text-slate-400 mt-1">Preparazione dati in corso</p>
          </div>
        </div>
      </div>
    );
  }

  // Activity feed items generated from real data
  const activityFeed: { icon: React.ElementType; iconBg: string; iconColor: string; title: string; subtitle: string; time: string; badge?: string; badgeColor?: string }[] = [];
  
  recentImmobili.slice(0, 3).forEach((imm: any, i: number) => {
    activityFeed.push({
      icon: Building2,
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      title: `${imm.DatiBase?.Tipologia || 'Immobile'} aggiunto`,
      subtitle: imm.DatiBase?.Citta ? `Zona ${imm.DatiBase.Citta}` : 'Nuovo in vetrina',
      time: 'Recente',
      badge: imm.DatiBase?.Codice || undefined,
      badgeColor: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    });
  });

  recentClienti.slice(0, 2).forEach((cli: any) => {
    activityFeed.push({
      icon: Users,
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      title: `${cli.DatiPersonali?.Nome || ''} ${cli.DatiPersonali?.Cognome || ''}`.trim() || 'Nuovo cliente',
      subtitle: cli.Richiesta?.Operazione?.Vendita ? 'Cerca acquisto' : cli.Richiesta?.Operazione?.Affitto ? 'Cerca affitto' : 'Registrato',
      time: 'Recente',
      badge: cli.Richiesta?.Tipologie?.[0] || undefined,
      badgeColor: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    });
  });

  // ESTOS CAMPOS ESTABAN MAL. Se leian ev.start.dateTime, ev.summary y
  // ev.location, que es la forma CRUDA de Google Calendar y no existe en los
  // documentos de Firestore: el importador los aplana a clientName,
  // propertyAddress, date y time antes de guardarlos. El resultado es que
  // este bloque lleva pintando "Appuntamento" y "Nessuna sede" en todas las
  // filas desde siempre, sin dar ningun error.
  todayAppointments.slice(0, 2).forEach((ev: any) => {
    activityFeed.push({
      icon: CalendarDays,
      iconBg: 'bg-violet-100',
      iconColor: 'text-violet-600',
      title: ev.clientName || 'Appuntamento',
      subtitle: ev.propertyAddress || 'Nessuna sede',
      time: ev.time || 'Oggi',
    });
  });

  const contenidoLavoro = (
    <>
        {/* ═══════════════════════════════════════════════════
            1. HEADER CON SALUTO PERSONALIZZATO
        ═══════════════════════════════════════════════════ */}
        <div className="relative">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-sm font-semibold text-slate-400 tracking-wide">{formatDateItalian()}</p>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                {getGreeting()}, <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">{userName}</span>
              </h1>
              <p className="text-slate-500 mt-1.5 text-base font-medium">
                Ecco il polso della tua agenzia oggi.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/documenti" className="group flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-600 transition-all shadow-sm hover:shadow-md hover:shadow-indigo-100/50">
                <FileText className="h-4 w-4" />
                Documenti
                <ChevronRight className="h-3.5 w-3.5 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
              </Link>
              <Link href="/agenda" className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all hover:scale-[1.02]">
                <CalendarDays className="h-4 w-4" />
                Agenda
              </Link>
            </div>
          </div>
        </div>



        {/* ═══════════════════════════════════════════════════
            2. I NUMERI DELL AGENZIA — da /api/stats
        ═══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {[
            { label: 'Immobili attivi', value: stats?.immobiliAttivi,    icon: Building2,   bg: 'bg-indigo-50',  color: 'text-indigo-600'  },
            { label: 'In vendita',      value: stats?.immobiliVendita,   icon: Tag,         bg: 'bg-blue-50',    color: 'text-blue-600'    },
            { label: 'In affitto',      value: stats?.immobiliAffitto,   icon: KeyRound,    bg: 'bg-teal-50',    color: 'text-teal-600'    },
            { label: 'Sospesi',         value: stats?.immobiliSospesi,   icon: PauseCircle, bg: 'bg-amber-50',   color: 'text-amber-600'   },
            { label: 'Clienti',         value: stats?.clientiTotali,     icon: Users,       bg: 'bg-emerald-50', color: 'text-emerald-600' },
            { label: 'Proprietari',     value: stats?.proprietariTotali, icon: Briefcase,   bg: 'bg-violet-50',  color: 'text-violet-600'  },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-5 flex flex-col gap-3">
              <div className={`h-9 w-9 rounded-xl ${card.bg} ${card.color} flex items-center justify-center`}>
                <card.icon className="h-[18px] w-[18px]" />
              </div>
              <div>
                {/* tabular-nums: al llegar los datos los digitos no bailan */}
                <p className="text-2xl font-black text-slate-800 tabular-nums leading-none">
                  {typeof card.value === 'number' ? card.value.toLocaleString('it-IT') : '—'}
                </p>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════
            3. AZIONI RAPIDE — Cards Premium
        ═══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { 
              href: "/immobili?new=true", 
              icon: HomeIcon, 
              title: "Nuovo Immobile", 
              subtitle: "Aggiungi alla vetrina", 
              gradient: "from-blue-600 to-indigo-700", 
              shadow: "shadow-blue-600/25",
              hoverShadow: "hover:shadow-blue-500/40",
              glow: "bg-blue-400/20",
            },
            { 
              href: "/clienti", 
              icon: Users, 
              title: "Nuovo Cliente", 
              subtitle: "Registra nuovo lead", 
              gradient: "from-emerald-500 to-teal-600", 
              shadow: "shadow-emerald-500/25",
              hoverShadow: "hover:shadow-emerald-400/40",
              glow: "bg-emerald-400/20",
            },
            { 
              href: "/proprietari?new=true", 
              icon: Briefcase, 
              title: "Nuovo Proprietario", 
              subtitle: "Registra proprietario", 
              gradient: "from-violet-600 to-purple-700", 
              shadow: "shadow-violet-600/25",
              hoverShadow: "hover:shadow-violet-500/40",
              glow: "bg-violet-400/20",
            },
          ].map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className={`group rounded-3xl bg-gradient-to-br ${action.gradient} p-6 ${action.shadow} shadow-lg ${action.hoverShadow} hover:shadow-xl hover:-translate-y-1 cursor-pointer transition-all duration-300 flex items-center gap-4 relative overflow-hidden`}
            >
              <div className={`absolute right-0 top-0 w-40 h-40 ${action.glow} blur-3xl rounded-full translate-x-1/3 -translate-y-1/3 pointer-events-none opacity-60`} />
              <div className="h-13 w-13 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white border border-white/20 group-hover:bg-white/25 transition-all flex-shrink-0 z-10">
                <action.icon className="h-6 w-6" />
              </div>
              <div className="flex-1 z-10">
                <h2 className="font-bold text-white text-lg mb-0.5">{action.title}</h2>
                <p className="text-sm text-white/70 font-medium">{action.subtitle}</p>
              </div>
              <Plus className="h-6 w-6 text-white/40 group-hover:text-white group-hover:rotate-90 transition-all duration-300 z-10" />
            </Link>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════
            4. CONTENUTO — 2 Colonne simmetriche (4 item ciascuna)
        ═══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── COLONNA 1: Ultimi Immobili (4 item) ── */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md shadow-indigo-200/50">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Ultimi Immobili</h3>
                  <p className="text-xs text-slate-400 font-medium">Aggiunti di recente</p>
                </div>
              </div>
              <Link href="/immobili" className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors group">
                Vedi tutti
                <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
            <div className="p-3 space-y-1">
              {recentImmobili.map((imm: any, i: number) => (
                <div key={imm.id || i} className="group rounded-2xl p-4 flex items-center gap-4 hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-100">
                  <div className="relative w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/80 flex-shrink-0 group-hover:border-indigo-200 transition-colors overflow-hidden">
                    {/* El listado no devuelve `images`: lo sustituye por `thumbnail`
                        (stripToThumbnail en api/immobili/route.ts). Leer images[0]
                        daba siempre undefined y la foto no se pintaba nunca. */}
                    {imm.thumbnail ? (
                      <NextImage src={imm.thumbnail} alt="Immobile" fill className="object-cover" sizes="44px" loading="lazy" unoptimized={esFuenteLocal(imm.thumbnail)} />
                    ) : (
                      <HomeIcon className="w-5 h-5 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{imm.DatiBase?.Codice || 'N/A'}</span>
                      <span className="text-slate-300 text-[10px]">•</span>
                      <span className="font-bold text-sm text-slate-800 truncate">{imm.DatiBase?.Tipologia || 'Immobile'}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate font-medium">
                      <MapPin className="h-3 w-3 flex-shrink-0 text-slate-300" />
                      {imm.DatiBase?.Citta || 'Località N/D'}{imm.DatiBase?.Zona ? ` — ${imm.DatiBase.Zona}` : ''}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {imm.GestioneCommerciale?.InVendita && (
                      <span className="text-sm font-black text-slate-800 whitespace-nowrap">
                        €{Number(imm.GestioneCommerciale?.PrezzoVendita || 0).toLocaleString('it-IT')}
                      </span>
                    )}
                    {imm.GestioneCommerciale?.InAffitto && (
                      <span className="text-sm font-black text-slate-800 whitespace-nowrap">
                        €{Number(imm.GestioneCommerciale?.PrezzoAffitto || 0).toLocaleString('it-IT')}/m
                      </span>
                    )}
                    {!imm.GestioneCommerciale?.InVendita && !imm.GestioneCommerciale?.InAffitto && (
                      <span className="text-xs font-bold text-slate-400">Da stimare</span>
                    )}
                    {imm.DettagliFisici?.MetriCommerciali && (
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">{imm.DettagliFisici.MetriCommerciali} m²</p>
                    )}
                  </div>
                </div>
              ))}
              {recentImmobili.length === 0 && (
                <div className="py-12 text-center">
                  <Building2 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">Nessun immobile recente.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── COLONNA 2: Activity Feed (4 item) + Agenda ── */}
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-slate-100/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-200/50">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Attività Recente</h3>
                    <p className="text-xs text-slate-400 font-medium">Aggiornamenti in tempo reale</p>
                  </div>
                </div>
              </div>
              <div className="p-3 space-y-1">
                {activityFeed.slice(0, 4).map((item, i) => (
                  <div key={i} className="group rounded-2xl p-4 bg-slate-50/50 hover:bg-white border border-transparent hover:border-slate-100 hover:shadow-sm transition-all duration-200">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl ${item.iconBg} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                        <item.icon className={`h-5 w-5 ${item.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-800 truncate">{item.title}</h4>
                          {item.badge && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${item.badgeColor} flex-shrink-0`}>
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">{item.subtitle}</p>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-300 flex-shrink-0">{item.time}</span>
                    </div>
                  </div>
                ))}
                {activityFeed.length === 0 && (
                  <div className="py-12 text-center">
                    <Zap className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium">Nessuna attività recente.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Widget Agenda di Oggi — solo se ci sono appuntamenti */}
            {todayAppointments.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-200/50">
                      <CalendarDays className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Agenda Oggi</h3>
                      <p className="text-xs text-slate-400 font-medium">{todayAppointments.length} appuntament{todayAppointments.length === 1 ? 'o' : 'i'}</p>
                    </div>
                  </div>
                  <Link href="/agenda" className="flex items-center gap-1 text-sm font-bold text-violet-600 hover:text-violet-700 transition-colors group">
                    Apri
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
                <div className="p-3 space-y-1">
                  {todayAppointments.map((ev, i) => {
                    // Mismo arreglo que en el feed: la hora esta en `time`,
                    // un string "HH:MM", no en un objeto de Google Calendar.
                    const startTime = ev.time || '';
                    return (
                      <div key={ev.id || i} className="rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-violet-50/40 transition-colors">
                        <div className="text-xs font-black text-violet-600 bg-violet-50 px-2.5 py-1.5 rounded-xl border border-violet-100 flex-shrink-0 min-w-[48px] text-center">
                          {startTime || '—'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">{ev.clientName || 'Senza titolo'}</p>
                          {ev.propertyAddress && (
                            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              {ev.propertyAddress}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Cambio de la contrasena propia. Va en «Il mio lavoro» y no en la
            pestana de administracion a proposito: no es gestion de la agencia,
            es la cuenta de cada uno, y la necesitan todos los roles. Antes
            vivia dentro del panel de /admin y se habria perdido al moverlo. */}
        <MiPassword />

    </>
  );

  // Sin rol de propietario no hay pestañas ni adorno de más: la pantalla es
  // exactamente la de siempre.
  if (!esPropietario) {
    return (
      <div className="flex flex-col gap-6 lg:gap-8 w-full">
        {contenidoLavoro}
        <VersionTag />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-8 w-full">
      <div
        role="tablist"
        aria-label="Sezioni della pagina iniziale"
        className="flex items-center gap-1.5 p-1.5 bg-slate-100/80 rounded-2xl w-full sm:w-fit"
        onKeyDown={navegarConTeclado}
      >
        {([
          ['lavoro', 'Il mio lavoro', LayoutDashboard],
          ['admin', 'Amministrazione', ShieldCheck],
        ] as const).map(([clave, etiqueta, Icono]) => {
          const activa = pestana === clave;
          return (
            <button
              key={clave}
              id={'tab-' + clave}
              role="tab"
              type="button"
              aria-selected={activa}
              aria-controls={'panel-' + clave}
              // Solo la pestaña activa entra en el orden de tabulación: el resto
              // se alcanza con las flechas. Es el patrón ARIA de tablist.
              tabIndex={activa ? 0 : -1}
              onClick={() => abrir(clave)}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 h-11 px-4 sm:px-5 rounded-xl text-sm font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 ${
                activa
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icono className="h-4 w-4" />
              {etiqueta}
            </button>
          );
        })}
      </div>

      <div
        id="panel-lavoro"
        role="tabpanel"
        aria-labelledby="tab-lavoro"
        hidden={pestana !== 'lavoro'}
        tabIndex={0}
        className="flex flex-col gap-6 lg:gap-8 outline-none"
      >
        {/* Se queda MONTADO aunque no se vea: así volver a «Il mio lavoro» no
            vuelve a pedir inmuebles, clientes ni agenda, y se conserva el
            desplazamiento donde estaba. */}
        {contenidoLavoro}
      </div>

      <div
        id="panel-admin"
        role="tabpanel"
        aria-labelledby="tab-admin"
        hidden={pestana !== 'admin'}
        tabIndex={0}
        className="outline-none"
      >
        {adminAbierto && <AdminPanel />}
      </div>

      <VersionTag />
    </div>
  );
}

/** Marca de verificación del despliegue. */
function VersionTag() {
  return (
    <div className="flex justify-end">
      <span className="text-[11px] font-bold text-slate-300 tracking-widest uppercase">
        v1.1 · {new Date().toLocaleDateString('it-IT')}
      </span>
    </div>
  );
}
