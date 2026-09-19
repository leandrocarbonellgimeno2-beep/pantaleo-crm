"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  MapPin, 
  Search, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Loader2,
  X,
  Save,
  Home as HomeIcon,
  FileText,
  Phone
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDialog } from "@/hooks/useDialog";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { listaDeRespuesta } from "@/lib/lista-respuesta";
import {
  format,
  addDays,
  subDays, 
  addWeeks, 
  subWeeks, 
  addMonths, 
  subMonths, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval,
  isSameDay,
  isToday,
  parseISO
} from "date-fns";
import { it } from "date-fns/locale";

type ViewMode = "day" | "week" | "month";
type AppointmentType = "Visita" | "Firma" | "Valutazione" | "Consulenza" | "Altro";
type ProfileMode = "cliente" | "proprietario" | "nuovo";

const APPOINTMENT_TYPES: { value: AppointmentType; label: string; color: string }[] = [
  { value: "Visita", label: "Visita Immobile", color: "bg-blue-500" },
  { value: "Firma", label: "Firma Contratto", color: "bg-emerald-500" },
  { value: "Valutazione", label: "Valutazione", color: "bg-amber-500" },
  { value: "Consulenza", label: "Consulenza", color: "bg-violet-500" },
  { value: "Altro", label: "Altro", color: "bg-slate-500" },
];

function SkeletonCard() {
  return (
    <div className="animate-pulse flex gap-4 bg-card border border-border rounded-2xl p-4">
      <div className="w-20 h-16 bg-slate-200 rounded-xl" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 bg-slate-200 rounded w-3/4" />
        <div className="h-3 bg-slate-100 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [calendarAuth, setCalendarAuth] = useState<{ connected: boolean; email?: string }>({ connected: false });
  const agentId = "default_admin";

  // New Appointment Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profileMode, setProfileMode] = useState<ProfileMode>("cliente");
  const [newAppt, setNewAppt] = useState({
    clientName: "", propertyAddress: "", date: format(new Date(), "yyyy-MM-dd"),
    time: "10:00", duration: 60, tipo: "Visita" as AppointmentType, 
    clientPhone: "", agentName: "Pantaleo", notes: "",
    contactRole: "cliente" as string,
    // New client fields
    newNome: "", newCognome: "", newPhone: ""
  });
  // Search within modal
  const [personSearch, setPersonSearch] = useState("");
  const [personResults, setPersonResults] = useState<any[]>([]);
  const [immSearch, setImmSearch] = useState("");
  const [immResults, setImmResults] = useState<any[]>([]);

  // Sin cierre al pinchar el fondo a proposito: el formulario puede llevar media
  // ficha de cliente nuevo escrita y un clic fuera se llevaria por delante el
  // trabajo sin preguntar. Se sale por Escape, por la X o por Annulla.
  const dialogoAppuntamento = useDialog<HTMLDivElement>({
    abierto: isModalOpen,
    alCerrar: () => setIsModalOpen(false),
  });

  // Compute date range based on view
  const dateRange = useMemo(() => {
    if (viewMode === "day") {
      return { from: format(currentDate, "yyyy-MM-dd"), to: format(currentDate, "yyyy-MM-dd") };
    }
    if (viewMode === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    // month
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
  }, [viewMode, currentDate]);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/appointments?dateFrom=${dateRange.from}&dateTo=${dateRange.to}&limit=500`);
      const data = await res.json();
      setAppointments(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [dateRange]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  useEffect(() => {
    fetch(`/api/calendar/get-status?agentId=${agentId}`)
      .then(r => r.json()).then(setCalendarAuth).catch(console.error);
  }, []);

  // Navigation
  const navigate = (dir: number) => {
    if (viewMode === "day") setCurrentDate(d => dir > 0 ? addDays(d, 1) : subDays(d, 1));
    if (viewMode === "week") setCurrentDate(d => dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1));
    if (viewMode === "month") setCurrentDate(d => dir > 0 ? addMonths(d, 1) : subMonths(d, 1));
  };

  const headerLabel = useMemo(() => {
    if (viewMode === "day") return format(currentDate, "EEEE d MMMM yyyy", { locale: it });
    if (viewMode === "week") {
      const s = startOfWeek(currentDate, { weekStartsOn: 1 });
      const e = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(s, "d MMM", { locale: it })} – ${format(e, "d MMM yyyy", { locale: it })}`;
    }
    return format(currentDate, "MMMM yyyy", { locale: it });
  }, [viewMode, currentDate]);

  // Sync from Google Calendar
  const handleSync = async () => {
    setIsSyncing(true); setSyncResult(null);
    try {
      const res = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, timeMin: "2023-03-02T00:00:00Z" }),
      });
      const data = await res.json();
      setSyncResult(data);
      fetchAppointments(); // refresh view
    } catch (e) { console.error(e); }
    finally { setIsSyncing(false); }
  };

  // Search people (clients or owners) in modal
  const searchPeople = async (q: string) => {
    setPersonSearch(q);
    if (q.length < 2) { setPersonResults([]); return; }
    const endpoint = profileMode === "cliente" ? "clienti" : "proprietari";
    const res = await fetch(`/api/${endpoint}?q=${encodeURIComponent(q)}&limit=5`);
    setPersonResults(listaDeRespuesta(await res.json()));
  };
  // DOS fallos en cuatro lineas, y los dos invisibles desde la interfaz:
  //
  //  1. /api/immobili con `q` devuelve { data, totalCount }, no un array, asi
  //     que el Array.isArray de antes era falso SIEMPRE y el desplegable se
  //     rellenaba con []. Este buscador no encontraba nada, nunca.
  //  2. Sin debounce, y como la busqueda por texto se resuelve en memoria, el
  //     servidor escanea la coleccion entera: eran ~870 lecturas POR TECLA
  //     para tirar el resultado a la basura.
  //
  // El de documentos ya iba con 300 ms; este era el unico de los seis sin el.
  const fetchImmobili = useDebouncedCallback(async (q: string) => {
    const res = await fetch(`/api/immobili?q=${encodeURIComponent(q)}&limit=5`);
    setImmResults(listaDeRespuesta(await res.json()));
  }, 300);

  const searchImmobili = (q: string) => {
    setImmSearch(q);
    if (q.length < 2) { setImmResults([]); return; }
    fetchImmobili(q);
  };

  // Reset person search when switching profile mode
  const switchProfile = (mode: ProfileMode) => {
    setProfileMode(mode);
    setPersonSearch("");
    setPersonResults([]);
    setNewAppt(prev => ({ ...prev, clientName: "", clientPhone: "", contactRole: mode === "nuovo" ? "cliente" : mode, newNome: "", newCognome: "", newPhone: "" }));
  };

  // Create appointment (with auto-create client if "nuovo")
  const handleCreate = async () => {
    const today = new Date().toISOString().split('T')[0];
    if (newAppt.date < today) {
      alert('⚠️ Non è possibile creare appuntamenti in date passate.');
      return;
    }
    setIsSaving(true);
    try {
      let finalName = newAppt.clientName;
      let finalPhone = newAppt.clientPhone;
      let finalRole = newAppt.contactRole;

      // If new client, create the record first
      if (profileMode === "nuovo" && newAppt.newNome) {
        const clientRes = await fetch("/api/clienti", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: newAppt.newNome, cognome: newAppt.newCognome, cell1: newAppt.newPhone }),
        });
        if (clientRes.ok) {
          finalName = `${newAppt.newNome} ${newAppt.newCognome}`.trim();
          finalPhone = newAppt.newPhone;
          finalRole = "cliente";
        }
      }

      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newAppt, clientName: finalName, clientPhone: finalPhone, contactRole: finalRole, agentName: agentId }),
      });
      if (res.ok) {
        setIsModalOpen(false);
        setNewAppt({ clientName: "", propertyAddress: "", date: format(new Date(), "yyyy-MM-dd"), time: "10:00", duration: 60, tipo: "Visita", clientPhone: "", agentName: "Pantaleo", notes: "", contactRole: "cliente", newNome: "", newCognome: "", newPhone: "" });
        setProfileMode("cliente");
        fetchAppointments();
      }
    } catch (e) { console.error(e); }
    finally { setIsSaving(false); }
  };

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchTerm) return appointments;
    const q = searchTerm.toLowerCase();
    return appointments.filter((a: any) =>
      `${a.clientName || ""} ${a.propertyAddress || ""} ${a.tipo || ""}`.toLowerCase().includes(q)
    );
  }, [appointments, searchTerm]);

  // Group by date for the list views
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtered.sort((a: any, b: any) => {
      const dc = (a.date || "").localeCompare(b.date || "");
      return dc || (a.time || "").localeCompare(b.time || "");
    }).forEach((a: any) => {
      const d = a.date || "N/D";
      if (!map[d]) map[d] = [];
      map[d].push(a);
    });
    return map;
  }, [filtered]);

  // Month calendar grid
  const monthDays = useMemo(() => {
    if (viewMode !== "month") return [];
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMode, currentDate]);

  const getStatusColor = (status: string) => {
    switch ((status || "").toLowerCase()) {
      case "confermato": case "confirmado": return "text-emerald-500";
      case "annullato": return "text-rose-500";
      default: return "text-amber-500";
    }
  };

  const getTypeColor = (tipo: string) => {
    const found = APPOINTMENT_TYPES.find(t => t.value === tipo);
    return found?.color || "bg-slate-400";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground capitalize">{headerLabel}</h2>
          <p className="text-muted-foreground mt-1 text-lg font-medium">
            {filtered.length} appuntamenti nel periodo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {calendarAuth.connected ? (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="h-11 md:h-10 px-4 inline-flex items-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors shadow-sm font-bold text-sm disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {isSyncing ? "Sincronizzando..." : "Sincronizza Google"}
            </button>
          ) : (
            <button
              onClick={() => window.location.href = `/api/calendar/auth?agentId=${agentId}`}
              className="h-10 px-4 inline-flex items-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors shadow-sm font-bold text-sm"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              Connetti Google Calendar
            </button>
          )}
          <button
            onClick={() => setIsModalOpen(true)}
            className="h-10 px-5 inline-flex items-center rounded-xl bg-primary text-white font-semibold transition-all hover:opacity-90 shadow-lg shadow-primary/25 text-sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuovo Appuntamento
          </button>
        </div>
      </div>

      {/* Sync Result Toast */}
      {syncResult && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium animate-in slide-in-from-top">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>Importati {syncResult.totalFromGoogle} eventi. Nuovi: {syncResult.created}, Aggiornati: {syncResult.updated}.</span>
          <button
            onClick={() => setSyncResult(null)}
            aria-label="Chiudi notifica di sincronizzazione"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* View Switcher + Navigation + Search */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* View Mode Tabs */}
        <div className="flex p-1 bg-slate-100 rounded-xl w-fit shrink-0">
          {(["day", "week", "month"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-4 py-2 text-sm font-bold rounded-lg transition-all capitalize",
                viewMode === mode ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {mode === "day" ? "Giorno" : mode === "week" ? "Settimana" : "Mese"}
            </button>
          ))}
        </div>

        {/* Date Navigation */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => navigate(-1)}
            aria-label="Periodo precedente"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="h-10 px-4 text-xs font-bold bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
          >
            Oggi
          </button>
          <button
            onClick={() => navigate(1)}
            aria-label="Periodo successivo"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            id="agenda-search"
            type="text"
            aria-label="Cerca appuntamenti per cliente, immobile o tipo"
            placeholder="Cerca per cliente, immobile o tipo..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-3">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      )}

      {/* ===== MONTH VIEW ===== */}
      {!loading && viewMode === "month" && (
        <div className="grid grid-cols-7 gap-px bg-border rounded-2xl overflow-hidden border border-border">
          {/* Weekday headers */}
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(d => (
            <div key={d} className="p-1.5 md:p-2 text-center text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest text-slate-400 bg-slate-50">
              {d}
            </div>
          ))}
          {/* Day cells */}
          {monthDays.map((day) => {
            const dayStr = format(day, "yyyy-MM-dd");
            const dayAppts = filtered.filter((a: any) => a.date === dayStr);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            // Era un <div> con onClick: no se alcanzaba con el teclado ni lo
            // anunciaba ningun lector de pantalla. Como boton, ademas, el
            // aria-label dice el dia y cuantas citas hay.
            return (
              <button
                type="button"
                key={dayStr}
                onClick={() => { setCurrentDate(day); setViewMode("day"); }}
                aria-label={`${format(day, "d MMMM")}, ${dayAppts.length} appuntamenti`}
                className={cn(
                  "text-left w-full bg-card cursor-pointer hover:bg-blue-50/50 transition-colors",
                  // La rejilla de siete columnas no tenia NINGUN breakpoint: en un
                  // movil de 375 px son siete columnas de unos 50, y dentro iban
                  // chips de texto a 9 px. Ahora la celda encoge y el contenido
                  // cambia de forma, no solo de tamano.
                  "min-h-[56px] sm:min-h-[72px] md:min-h-[90px] p-1 md:p-1.5",
                  !isCurrentMonth && "opacity-40"
                )}
              >
                <span className={cn(
                  "inline-flex items-center justify-center h-7 w-7 md:h-6 md:w-6 text-xs font-bold rounded-full",
                  isToday(day) ? "bg-primary text-white" : "text-slate-600"
                )}>
                  {format(day, "d")}
                </span>
                {/* MOVIL: puntos de color. Dicen cuantas citas hay y de que tipo
                    sin pedirle al ojo que lea nueve pixeles. */}
                <div className="mt-1 flex flex-wrap gap-0.5 md:hidden">
                  {dayAppts.slice(0, 4).map((a: any) => (
                    <span
                      key={a.id}
                      className={cn("h-1.5 w-1.5 rounded-full", getTypeColor(a.tipo || "Altro"))}
                    />
                  ))}
                  {dayAppts.length > 4 && (
                    <span className="text-[10px] font-black text-slate-400 leading-none">+</span>
                  )}
                </div>

                {/* ESCRITORIO: los chips de siempre, ahora a 10 px. */}
                <div className="mt-0.5 space-y-0.5 hidden md:block">
                  {dayAppts.slice(0, 3).map((a: any) => (
                    <div key={a.id} className={cn("text-[10px] font-bold text-white px-1 py-0.5 rounded truncate", getTypeColor(a.tipo || "Altro"))}>
                      {a.time} {a.clientName?.substring(0, 15)}
                    </div>
                  ))}
                  {dayAppts.length > 3 && (
                    <span className="text-[10px] font-bold text-slate-400">+{dayAppts.length - 3} altri</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ===== DAY / WEEK LIST VIEW ===== */}
      {!loading && viewMode !== "month" && (
        <div className="space-y-6">
          {Object.keys(grouped).length > 0 ? (
            Object.entries(grouped).map(([dateKey, appts]) => (
              <div key={dateKey}>
                {/* Date Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center font-black text-lg",
                    isToday(parseISO(dateKey)) ? "bg-primary text-white" : "bg-slate-100 text-slate-700"
                  )}>
                    {format(parseISO(dateKey), "d")}
                  </div>
                  <div>
                    <p className="text-sm font-bold capitalize text-slate-900">{format(parseISO(dateKey), "EEEE", { locale: it })}</p>
                    <p className="text-xs text-muted-foreground">{format(parseISO(dateKey), "d MMMM yyyy", { locale: it })}</p>
                  </div>
                  <span className="ml-auto text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">{appts.length} app.</span>
                </div>

                {/* Appointment Cards */}
                <div className="space-y-2 pl-[52px]">
                  {appts.map((app: any) => (
                    <div key={app.id} className="group flex bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-primary/30 transition-all">
                      {/* Color Bar */}
                      <div className={cn("w-1.5 shrink-0", getTypeColor(app.tipo || "Altro"))} />
                      {/* Time */}
                      <div className="w-20 shrink-0 bg-slate-50/80 flex flex-col items-center justify-center p-2 border-r border-border">
                        <span className="text-base font-black text-primary">{app.time || "—"}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{app.duration || 60} min</span>
                      </div>
                      {/* Body */}
                      <div className="flex-1 p-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2 w-2 rounded-full shrink-0", getStatusColor(app.status))} style={{ backgroundColor: "currentColor" }} />
                            <h4 className="font-bold text-sm text-slate-900 truncate">{app.clientName || "Evento"}</h4>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-500">
                            {app.propertyAddress && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3 text-primary/50" />
                                {app.propertyAddress}
                              </span>
                            )}
                            {app.tipo && (
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3 text-primary/50" />
                                {app.tipo}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {app.googleEventLink && (
                            <a href={app.googleEventLink} target="_blank" rel="noreferrer"
                               className="text-[9px] font-bold text-blue-500 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                              GCal
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
              <CalendarIcon className="h-12 w-12 text-slate-200 mx-auto" />
              <h3 className="mt-4 text-lg font-bold">Nessun impegno trovato</h3>
              <p className="text-slate-500 text-sm mt-1">Nessun appuntamento per questo periodo.</p>
            </div>
          )}
        </div>
      )}

      {/* ===== PROFESSIONAL NEW APPOINTMENT MODAL ===== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div
            ref={dialogoAppuntamento.ref}
            {...dialogoAppuntamento.props}
            aria-labelledby="titolo-nuovo-appuntamento"
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card rounded-2xl shadow-2xl outline-none"
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-border bg-card/95 backdrop-blur-sm rounded-t-2xl">
              <div>
                <h3 id="titolo-nuovo-appuntamento" className="text-lg font-black">Nuovo Appuntamento</h3>
                <p className="text-xs text-muted-foreground font-medium">Compila i dettagli e sincronizza con Google Calendar</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Chiudi"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5">
              {/* Tipo di Appuntamento */}
              <div>
                {/* Estos rotulos encabezan un grupo de botones, no un campo: un
                    <label> sin control asociado no dice nada. Van como span + role="group". */}
                <span id="appt-tipo-label" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Tipo di Appuntamento</span>
                <div role="group" aria-labelledby="appt-tipo-label" className="flex flex-wrap gap-2">
                  {APPOINTMENT_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setNewAppt({ ...newAppt, tipo: t.value })}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                        newAppt.tipo === t.value
                          ? `${t.color} text-white border-transparent shadow-md`
                          : "bg-white text-slate-600 border-border hover:border-slate-300"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selezione Tipo Cliente */}
              <div>
                <span id="appt-contatto-label" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Tipo Contatto</span>
                <div role="group" aria-labelledby="appt-contatto-label" className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
                  <button onClick={() => switchProfile("proprietario")} className={cn("px-4 py-2 text-sm font-bold rounded-lg transition-all", profileMode === "proprietario" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700")}>Proprietario</button>
                  <button onClick={() => switchProfile("cliente")} className={cn("px-4 py-2 text-sm font-bold rounded-lg transition-all", profileMode === "cliente" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700")}>Cliente Registrato</button>
                  <button onClick={() => switchProfile("nuovo")} className={cn("px-4 py-2 text-sm font-bold rounded-lg transition-all", profileMode === "nuovo" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700")}>Nuovo Cliente</button>
                </div>
              </div>

              {profileMode !== "nuovo" ? (
                <>
                  <div>
                    <label htmlFor="appt-person-search" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Ricerca {profileMode === "cliente" ? "Cliente" : "Proprietario"}
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                      <input
                        id="appt-person-search"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
                        placeholder={`Cerca ${profileMode === "cliente" ? "cliente" : "proprietario"}...`}
                        value={personSearch}
                        onChange={(e) => { 
                          setNewAppt({ ...newAppt, clientName: e.target.value }); 
                          searchPeople(e.target.value); 
                        }}
                      />
                    </div>
                    {personResults.length > 0 && (
                      <div className="mt-1 bg-white border border-border rounded-xl shadow-lg max-h-36 overflow-y-auto">
                        {personResults.map((p: any) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setNewAppt({ ...newAppt, clientName: `${p.nome} ${p.cognome}`, clientPhone: p.cell1 || p.cellulare || "" });
                              setPersonResults([]); setPersonSearch(`${p.nome} ${p.cognome}`);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm flex items-center gap-2 border-b border-border last:border-0"
                          >
                            <User className="h-4 w-4 text-slate-300" />
                            <span className="font-bold">{p.nome} {p.cognome}</span>
                            <span className="text-xs text-slate-400 ml-auto">{p.cell1 || p.cellulare || ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Telefono (pre-filled or manual) */}
                  <div>
                    <label htmlFor="appt-client-phone" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Telefono</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                      <input
                        id="appt-client-phone"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
                        placeholder="Numero telefono"
                        value={newAppt.clientPhone}
                        onChange={(e) => setNewAppt({ ...newAppt, clientPhone: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  <div className="col-span-2">
                    <p className="text-xs font-bold text-blue-700 mb-3 flex items-center gap-1.5">
                      <Plus className="h-3 w-3" /> Compila i dati. Verrà creata la scheda automatica.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="appt-new-nome" className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nome</label>
                    <input
                      id="appt-new-nome"
                      className="w-full py-2 px-3 rounded-lg border border-border bg-white text-sm font-medium focus:ring-2 focus:ring-primary/20"
                      placeholder="es. Mario"
                      value={newAppt.newNome} 
                      onChange={e => setNewAppt({...newAppt, newNome: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label htmlFor="appt-new-cognome" className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cognome</label>
                    <input
                      id="appt-new-cognome"
                      className="w-full py-2 px-3 rounded-lg border border-border bg-white text-sm font-medium focus:ring-2 focus:ring-primary/20"
                      placeholder="es. Rossi"
                      value={newAppt.newCognome} 
                      onChange={e => setNewAppt({...newAppt, newCognome: e.target.value})} 
                    />
                  </div>
                  <div className="col-span-2 flex flex-col">
                    <label htmlFor="appt-new-phone" className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Telefono</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
                      <input
                        id="appt-new-phone"
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-white text-sm font-medium focus:ring-2 focus:ring-primary/20"
                        placeholder="Numero di cellulare"
                        value={newAppt.newPhone} 
                        onChange={e => {
                          setNewAppt({...newAppt, newPhone: e.target.value, clientPhone: e.target.value});
                        }} 
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Immobile - with autocomplete */}
              <div>
                <label htmlFor="appt-property" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Immobile (Indirizzo)</label>
                <div className="relative">
                  <HomeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                  <input
                    id="appt-property"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
                    placeholder="Cerca immobile..."
                    value={immSearch || newAppt.propertyAddress}
                    onChange={(e) => { setNewAppt({ ...newAppt, propertyAddress: e.target.value }); searchImmobili(e.target.value); }}
                  />
                </div>
                {immResults.length > 0 && (
                  <div className="mt-1 bg-white border border-border rounded-xl shadow-lg max-h-36 overflow-y-auto">
                    {immResults.map((i: any) => (
                      <button
                        key={i.id}
                        onClick={() => {
                          setNewAppt({ ...newAppt, propertyAddress: i.indirizzo || i.titolo || "" });
                          setImmResults([]); setImmSearch("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm flex items-center gap-2 border-b border-border last:border-0"
                      >
                        <HomeIcon className="h-4 w-4 text-slate-300" />
                        <span className="font-bold truncate">{i.indirizzo || i.titolo}</span>
                        <span className="text-[10px] font-bold text-primary ml-auto">RIF {i.rif || "N/A"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Data + Ora + Durata */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="appt-date" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Data</label>
                  <input
                    id="appt-date"
                    type="date"
                    className="w-full py-2.5 px-3 rounded-xl border border-border bg-slate-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={newAppt.date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setNewAppt({ ...newAppt, date: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="appt-time" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Ora</label>
                  <input
                    id="appt-time"
                    type="time"
                    className="w-full py-2.5 px-3 rounded-xl border border-border bg-slate-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={newAppt.time}
                    onChange={(e) => setNewAppt({ ...newAppt, time: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="appt-duration" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Durata</label>
                  <select
                    id="appt-duration"
                    className="w-full py-2.5 px-3 rounded-xl border border-border bg-slate-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={newAppt.duration}
                    onChange={(e) => setNewAppt({ ...newAppt, duration: parseInt(e.target.value) })}
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>1 ora</option>
                    <option value={90}>1h 30</option>
                    <option value={120}>2 ore</option>
                  </select>
                </div>
              </div>

              {/* Note */}
              <div>
                <label htmlFor="appt-notes" className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Note</label>
                <textarea
                  id="appt-notes"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-slate-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[70px]"
                  placeholder="Note sull'appuntamento..."
                  value={newAppt.notes}
                  onChange={(e) => setNewAppt({ ...newAppt, notes: e.target.value })}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 p-5 border-t border-border bg-card/95 backdrop-blur-sm rounded-b-2xl flex justify-between items-center">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {calendarAuth.connected && (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="font-bold">Sincronizzazione automatica attiva</span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-border bg-white text-sm font-bold hover:bg-slate-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isSaving || !newAppt.clientName}
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-black shadow-lg shadow-primary/25 hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salva & Sincronizza
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
