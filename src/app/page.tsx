"use client";

import useSWR from 'swr';
import {
  Users, Home as HomeIcon,
  Plus, Phone, MapPin, Loader2, Briefcase,
  Building2, CalendarDays, FileText, ChevronRight,
  Zap, MessageSquare
} from "lucide-react";
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

export default function DashboardPage() {
  // today must be inside the component so it refreshes if the tab stays open past midnight
  const today = new Date().toISOString().split('T')[0];

  // SWR cache: re-navigating to dashboard skips all 4 fetches for 30s
  const { data: immData, isLoading: immLoading } = useSWR('/api/immobili?status=attivi&type=tutti', jsonFetcher, { dedupingInterval: 30_000, revalidateOnFocus: false });
  const { data: cliData, isLoading: cliLoading } = useSWR('/api/clienti', jsonFetcher, { dedupingInterval: 30_000, revalidateOnFocus: false });
  const { data: richData, isLoading: richLoading } = useSWR('/api/richieste?limit=10', jsonFetcher, { dedupingInterval: 30_000, revalidateOnFocus: false });
  const { data: agendaData, isLoading: agendaLoading } = useSWR(`/api/appointments?date=${today}`, jsonFetcher, { dedupingInterval: 30_000, revalidateOnFocus: false });
  const { data: sessionData } = useSWR('/api/auth/session', jsonFetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 });

  const loading = immLoading || cliLoading || richLoading || agendaLoading;

  const recentImmobili = (immData?.data || []).slice(0, 5);
  const recentClienti = (Array.isArray(cliData) ? cliData : (cliData?.data || [])).slice(0, 5);
  const recentRichieste = (Array.isArray(richData) ? richData : []).slice(0, 4);
  const todayAppointments = (Array.isArray(agendaData) ? agendaData : []).slice(0, 4);
  const userName = sessionData?.nome ? sessionData.nome.split(' ')[0] : 'Utente';

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

  recentRichieste.slice(0, 3).forEach((rich: any) => {
    activityFeed.push({
      icon: MessageSquare,
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-600',
      title: rich.nome ? `${rich.nome} ${rich.cognome || ''}`.trim() : 'Nuova richiesta',
      subtitle: rich.immobileCodice ? `Rif. ${rich.immobileCodice}` : 'Dal Sito Web',
      time: 'Appena inviata',
      badge: 'Sito',
      badgeColor: 'bg-rose-50 text-rose-600 border-rose-200',
    });
  });

  todayAppointments.slice(0, 2).forEach((ev: any) => {
    const startTime = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
    activityFeed.push({
      icon: CalendarDays,
      iconBg: 'bg-violet-100',
      iconColor: 'text-violet-600',
      title: ev.summary || 'Appuntamento',
      subtitle: ev.location || 'Nessuna sede',
      time: startTime || 'Oggi',
    });
  });

  return (
    <div className="flex flex-col gap-6 lg:gap-8 w-full">
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
                <h3 className="font-bold text-white text-lg mb-0.5">{action.title}</h3>
                <p className="text-sm text-white/70 font-medium">{action.subtitle}</p>
              </div>
              <Plus className="h-6 w-6 text-white/40 group-hover:text-white group-hover:rotate-90 transition-all duration-300 z-10" />
            </Link>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════
            4. CONTENUTO BENTO: 3 Columnas
            - Ultimi Immobili (col-span-5)
            - Activity Feed (col-span-4)  
            - Lead + Agenda (col-span-3)
        ═══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 h-full">
          
          {/* ── COLONNA 1: Ultimi Immobili ── */}
          <div className="lg:col-span-5 flex flex-col min-h-0">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm shadow-slate-100 overflow-hidden flex flex-col flex-1 h-[500px] lg:h-auto">
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
              <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden p-3 space-y-2">
                {recentImmobili.map((imm: any, i: number) => (
                  <div key={imm.id || i} className="group rounded-2xl p-3 xl:p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-100">
                    
                    {/* Left: Avatar & Info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="relative w-10 h-10 xl:w-11 xl:h-11 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/80 flex-shrink-0 group-hover:border-indigo-200 transition-colors overflow-hidden">
                        {imm.images?.[0] ? (
                          <NextImage src={imm.images[0]} alt="Immobile" fill className="object-cover" sizes="44px" loading="lazy" unoptimized />
                        ) : (
                          <HomeIcon className="w-5 h-5 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex-shrink-0">
                            {imm.DatiBase?.Codice || 'N/A'}
                          </span>
                          <span className="text-slate-300 text-[10px]">•</span>
                          <h4 className="font-bold text-sm text-slate-800 truncate">
                            {imm.DatiBase?.Tipologia || 'Immobile'}
                          </h4>
                          {imm.status === "Attivo" && (
                            <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate font-medium">
                          <MapPin className="h-3 w-3 flex-shrink-0 text-slate-300" />
                          {imm.DatiBase?.Indirizzo || 'Nessun indirizzo'}{imm.DatiBase?.Citta ? `, ${imm.DatiBase.Citta}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Right: Details + Price */}
                    <div className="flex items-center gap-3 xl:gap-4 flex-shrink-0 pt-2 sm:pt-0 mt-2 sm:mt-0 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 border-slate-100">
                      
                      {/* Features */}
                      <div className="flex items-center gap-2 pl-0 sm:pl-3 border-l-0 sm:border-l border-slate-200/60">
                        {imm.DettagliFisici?.MetriCommerciali && (
                          <span className="flex items-center gap-1 font-bold text-slate-500">
                            {imm.DettagliFisici.MetriCommerciali} <span className="text-[9px] uppercase text-slate-400">MQ</span>
                          </span>
                        )}
                        {imm.DettagliFisici?.CamereLetto && (
                          <span className="flex items-center gap-1 font-bold text-slate-500 select-none">
                            🛏️ {imm.DettagliFisici.CamereLetto}
                          </span>
                        )}
                        {imm.DettagliFisici?.Bagni && (
                          <span className="flex items-center gap-1 font-bold text-slate-500 select-none">
                            🚿 {imm.DettagliFisici.Bagni}
                          </span>
                        )}
                        {!imm.DettagliFisici?.MetriCommerciali && !imm.DettagliFisici?.CamereLetto && !imm.DettagliFisici?.Bagni && (
                          <span className="text-slate-300 italic text-[11px]">Nessun dato</span>
                        )}
                      </div>

                      {/* Price */}
                      <div className="flex flex-col items-end gap-1 pl-3 xl:pl-4">
                        {imm.GestioneCommerciale?.InVendita && (
                          <span className="text-xs xl:text-sm font-black text-slate-800 whitespace-nowrap">
                            €{Number(imm.GestioneCommerciale?.PrezzoVendita || 0).toLocaleString()}
                          </span>
                        )}
                        {imm.GestioneCommerciale?.InAffitto && (
                          <span className="text-xs xl:text-sm font-black text-slate-800 whitespace-nowrap">
                            €{Number(imm.GestioneCommerciale?.PrezzoAffitto || 0).toLocaleString()}/m
                          </span>
                        )}
                        {!imm.GestioneCommerciale?.InVendita && !imm.GestioneCommerciale?.InAffitto && (
                          <span className="text-xs font-bold text-slate-400 whitespace-nowrap">
                            Da stimare
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {recentImmobili.length === 0 && (
                  <div className="p-10 text-center">
                    <Building2 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium">Nessun immobile recente trovato.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── COLONNA 2: ACTIVITY FEED ── */}
          <div className="lg:col-span-4 flex flex-col min-h-0">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm shadow-slate-100 overflow-hidden flex flex-col flex-1 h-[400px] lg:h-auto">
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
              <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden p-3">
                <div className="flex flex-col gap-2">
                  {activityFeed.length > 0 ? activityFeed.map((item, i) => (
                    <div 
                      key={i} 
                      className="group rounded-2xl p-4 bg-slate-50/50 hover:bg-white border border-transparent hover:border-slate-100 hover:shadow-sm transition-all duration-200 cursor-default"
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon circle */}
                        <div className={`h-10 w-10 rounded-xl ${item.iconBg} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                          <item.icon className={`h-5 w-5 ${item.iconColor}`} />
                        </div>
                        
                        {/* Content */}
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

                        {/* Time */}
                        <span className="text-[11px] font-semibold text-slate-300 flex-shrink-0 pt-0.5">{item.time}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="p-10 text-center">
                      <Zap className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-slate-400 font-medium">Nessuna attività recente.</p>
                    </div>
                  )}

                  {/* Decorative empty state if less than 5 items */}
                  {activityFeed.length > 0 && activityFeed.length < 5 && (
                    <div className="rounded-2xl p-4 border border-dashed border-slate-200 text-center mt-2">
                      <p className="text-xs text-slate-300 font-medium">L&apos;attività verrà aggiornata automaticamente</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── COLONNA 3: Lead + Agenda ── */}
          <div className="lg:col-span-3 flex flex-col gap-6 min-h-0">
            
            {/* Ultimi Lead — Compact */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm shadow-slate-100 overflow-hidden flex flex-col flex-1 min-h-[300px]">
              <div className="px-5 py-4 border-b border-slate-100/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-200/50">
                    <Users className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">Contatti Web (Leads)</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Dal sito web</p>
                  </div>
                </div>
                <Link href="#" className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors group">
                  Vedi Nuovi
                  <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
              <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden p-2 space-y-1">
                {recentRichieste.map((req, i) => {
                  const phone = req.telefono || '';
                  const formatPhone = phone.replace(/\D/g, '');
                  
                  return (
                    <div key={req.id || i} className="group rounded-2xl px-3 py-3 hover:bg-slate-50/80 transition-all border border-transparent hover:border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 font-bold flex items-center justify-center border border-emerald-200/80 flex-shrink-0 text-xs group-hover:from-emerald-500 group-hover:to-teal-500 group-hover:text-white group-hover:border-emerald-400 transition-all">
                          {req.nome?.[0] || '?'}{req.cognome?.[0] || ''}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm text-slate-800 truncate">{req.nome || 'Senza'} {req.cognome || 'Nome'}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] border border-amber-100 bg-amber-50/60 text-amber-600 px-1.5 py-0.5 rounded-md font-bold">Dal Sito</span>
                            {req.immobileCodice && (
                              <span className="text-[10px] text-slate-400 font-medium truncate">Rif. {req.immobileCodice}</span>
                            )}
                          </div>
                        </div>
                        {formatPhone ? (
                          <a href={`https://wa.me/${formatPhone.startsWith('39') ? formatPhone : '39' + formatPhone}`} target="_blank" rel="noopener noreferrer" 
                             className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all border border-[#25D366]/20"
                             title="Contatta su WhatsApp">
                            <Phone className="h-3.5 w-3.5 fill-current" />
                          </a>
                        ) : (
                          <div className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-300" title="Nessun numero">
                            <Phone className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {recentRichieste.length === 0 && (
                  <div className="p-8 text-center">
                    <Users className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 font-medium text-sm">Nessuna richiesta dal sito.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Widget Agenda di Oggi */}
            {todayAppointments.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm shadow-slate-100 overflow-hidden flex flex-col flex-1 min-h-[200px]">
                <div className="px-5 py-4 border-b border-slate-100/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-200/50">
                      <CalendarDays className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">Agenda Oggi</h3>
                      <p className="text-[11px] text-slate-400 font-medium">{todayAppointments.length} appuntament{todayAppointments.length === 1 ? 'o' : 'i'}</p>
                    </div>
                  </div>
                  <Link href="/agenda" className="flex items-center gap-1 text-xs font-bold text-violet-600 hover:text-violet-700 transition-colors group">
                    Apri
                    <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
                <div className="p-2 space-y-1 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden">
                  {todayAppointments.map((ev, i) => {
                    const startTime = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
                    return (
                      <div key={ev.id || i} className="rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-violet-50/40 transition-colors">
                        <div className="text-xs font-black text-violet-600 bg-violet-50 px-2.5 py-1.5 rounded-xl border border-violet-100 flex-shrink-0 min-w-[48px] text-center">
                          {startTime || '—'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">{ev.summary || 'Senza titolo'}</p>
                          {ev.location && (
                            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              {ev.location}
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
    </div>
  );
}
