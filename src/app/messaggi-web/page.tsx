"use client";

import { useEffect, useState } from "react";
import { Mail, Trash2, Calendar, Phone, MessageCircle, AlertCircle, Inbox, MailOpen, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/contexts/ConfirmDialog";

interface Messaggio {
  id: string;
  nome?: string;
  cognome?: string;
  email?: string;
  telefono?: string;
  messaggio?: string;
  createdAt?: any;
  rifImmobile?: string;
  letto?: boolean;
  contattato?: boolean;
}

export default function MessaggiWebPage() {
  const confirm = useConfirm();
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMsg, setSelectedMsg] = useState<Messaggio | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'read'>('all');

  useEffect(() => {
    setLoading(true);
    const sse = new EventSource("/api/messaggi-web/stream");

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessaggi(data);
        setLoading(false);
      } catch (err) {
        console.error("Errore parsing SSE", err);
      }
    };

    sse.onerror = (err) => {
      console.error("Errore SSE stream:", err);
    };

    return () => {
      sse.close();
    };
  }, []);

  const handleSelectRequest = async (msg: Messaggio) => {
    setSelectedMsg(msg);
    // Si no está leído, lo marcamos automáticamente al abrirlo
    if (!msg.letto) {
      toggleReadStatus(msg.id, true);
    }
  };

  const toggleReadStatus = async (id: string, lettoStato: boolean) => {
    try {
      await fetch(`/api/messaggi-web/${id}`, { 
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letto: lettoStato })
      });
      
      // Actualizamos UI en memoria
      setMessaggi(prev => prev.map(m => m.id === id ? { ...m, letto: lettoStato } : m));
      
      // Si tenemos este mensaje seleccionado en este momento, actualizamos su propia variable
      if (selectedMsg && selectedMsg.id === id) {
        setSelectedMsg(prev => prev ? { ...prev, letto: lettoStato } : null);
      }
    } catch (e) {
      console.error("Errore aggiornamento stato lettura", e);
    }
  };

  const toggleContattatoStatus = async (id: string, contattatoStato: boolean) => {
    try {
      await fetch(`/api/messaggi-web/${id}`, { 
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contattato: contattatoStato })
      });
      
      setMessaggi(prev => prev.map(m => m.id === id ? { ...m, contattato: contattatoStato } : m));
      
      if (selectedMsg && selectedMsg.id === id) {
        setSelectedMsg(prev => prev ? { ...prev, contattato: contattatoStato } : null);
      }
    } catch (e) {
      console.error("Errore aggiornamento stato contatto", e);
    }
  };

  const markContattatoAndOpenWhatsapp = (msg: Messaggio) => {
    if (!msg.contattato) {
      toggleContattatoStatus(msg.id, true);
    }
    const phone = msg.telefono?.replace(/[^0-9+]/g, '') || '';
    window.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Eliminare il messaggio?',
      message: "Il messaggio sarà rimosso definitivamente. L'azione non può essere annullata.",
      danger: true,
    });
    if (!ok) return;
    
    try {
      const res = await fetch(`/api/messaggi-web/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Errore eliminazione");
      
      setMessaggi(prev => prev.filter(m => m.id !== id));
      if (selectedMsg?.id === id) {
        setSelectedMsg(null);
      }
    } catch (e) {
      console.error(e);
      alert("Errore durante l'eliminazione del messaggio.");
    }
  };

  const formatDate = (dateValue: any) => {
    if (!dateValue) return "Data sconosciuta";
    try {
      const d = new Date(dateValue);
      return new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(d);
    } catch {
      return "Data non valida";
    }
  };

  const unreadCount = messaggi.filter(m => !m.letto).length;

  const filteredMessages = messaggi.filter(m => {
    if (filterMode === 'unread') return !m.letto;
    if (filterMode === 'read') return m.letto;
    return true;
  });

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="animate-spin text-indigo-500">
          <Mail className="h-8 w-8" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* HEADER */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shadow-inner border border-indigo-100 relative">
            <Mail className="h-6 w-6" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shadow-sm border-2 border-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Messaggi Web</h1>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Gestione delle richieste in arrivo dal sito web pubblico
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
             {unreadCount > 0 && (
               <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-100 text-rose-600 font-bold px-3 py-1.5 rounded-lg text-xs shadow-sm">
                 {unreadCount} da leggere
               </div>
             )}
             <div className="flex items-center justify-center bg-indigo-50 border border-indigo-100 text-indigo-700 font-black px-4 py-2 rounded-xl text-sm shadow-sm">
               {messaggi.length} totali
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[700px]">
        {/* LADO IZQUIERDO: Bandeja de entrada */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <h2 className="font-bold text-slate-700 text-sm flex items-center gap-2">
              <Inbox className="w-4 h-4 text-slate-400" />
              Posta In Arrivo
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live (Tempo reale)
            </div>
          </div>
          
          <div className="flex bg-slate-50 border-b border-slate-100 p-2 gap-2">
            <button 
              onClick={() => setFilterMode('all')}
              className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-all", filterMode === 'all' ? "bg-white shadow-sm text-indigo-700" : "text-slate-500 hover:bg-slate-100")}
            >
              Tutti
            </button>
            <button 
              onClick={() => setFilterMode('unread')}
              className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-all", filterMode === 'unread' ? "bg-white shadow-sm text-rose-600" : "text-slate-500 hover:bg-slate-100")}
            >
              Da Leggere
            </button>
            <button 
              onClick={() => setFilterMode('read')}
              className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-all", filterMode === 'read' ? "bg-white shadow-sm text-emerald-600" : "text-slate-500 hover:bg-slate-100")}
            >
              Già Letti
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto w-full">
            {filteredMessages.length === 0 ? (
               <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                 <div className="bg-slate-50 p-4 rounded-full mb-3 shadow-inner">
                   <Inbox className="h-8 w-8 text-slate-300" />
                 </div>
                 <p className="text-slate-500 font-bold">Nessun messaggio</p>
                 <p className="text-slate-400 text-sm mt-1">L'inbox è attualmente vuota.</p>
               </div>
            ) : (
              filteredMessages.map((msg) => {
                const isUnread = !msg.letto;
                return (
                  <div 
                    key={msg.id}
                    onClick={() => handleSelectRequest(msg)}
                    className={cn(
                      "relative p-4 border-b border-slate-50 hover:bg-indigo-50/20 transition-all cursor-pointer group",
                      selectedMsg?.id === msg.id && "bg-indigo-50/40 hover:bg-indigo-50/50",
                      isUnread ? "bg-white" : "bg-slate-50/40"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2 pr-6">
                        {isUnread && (
                          <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full flex-shrink-0 animate-pulse shadow-sm shadow-indigo-500/20"></div>
                        )}
                        <h3 className={cn(
                          "text-sm line-clamp-1",
                          isUnread ? "font-black text-slate-900" : "font-semibold text-slate-600"
                        )}>
                           {msg.nome || ''} {msg.cognome || ''}
                           {!msg.nome && !msg.cognome && (msg.email || "Utente Anonimo")}
                        </h3>
                      </div>
                    </div>
                    <div className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(msg.createdAt)}
                    </div>
                    <p className={cn(
                      "text-xs line-clamp-2",
                      isUnread ? "text-slate-600 font-medium" : "text-slate-500"
                    )}>
                      {msg.messaggio || "(Nessun testo)"}
                    </p>
                    
                    {msg.rifImmobile && (
                      <div className={cn(
                        "mt-2.5 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border",
                        isUnread ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-amber-50 text-amber-600 border-amber-100"
                      )}>
                        Rif. {msg.rifImmobile}
                      </div>
                    )}

                    <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 lg:group-hover:opacity-100 transition-all">
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           toggleReadStatus(msg.id, !msg.letto);
                         }}
                         className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                         title={isUnread ? "Segna come già letto" : "Segna come da leggere"}
                       >
                         {isUnread ? <MailOpen className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                       </button>
                       <button 
                         onClick={(e) => handleDelete(msg.id, e)}
                         className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                         title="Elimina"
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* LADO DERECHO: Detalle del mensaje */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
          {selectedMsg ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/30">
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    {selectedMsg.nome} {selectedMsg.cognome}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    {selectedMsg.email && (
                      <a href={`mailto:${selectedMsg.email}`} className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors bg-indigo-50 border border-indigo-100 shadow-sm px-3 py-1.5 rounded-lg">
                        <Mail className="w-4 h-4" />
                        {selectedMsg.email}
                      </a>
                    )}
                    {selectedMsg.telefono && (
                      <div className="flex items-center gap-2">
                        <a href={`tel:${selectedMsg.telefono}`} className="flex items-center gap-2 text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors bg-emerald-50 border border-emerald-100 shadow-sm px-3 py-1.5 rounded-lg">
                          <Phone className="w-4 h-4" />
                          {selectedMsg.telefono}
                        </a>
                        <button 
                          onClick={() => markContattatoAndOpenWhatsapp(selectedMsg)} 
                          className="flex items-center gap-2 text-sm font-bold text-[#25D366] hover:text-[#128C7E] transition-colors bg-[#25D366]/10 border border-[#25D366]/30 shadow-sm px-3 py-1.5 rounded-lg ml-2"
                          title="Invia messaggio su WhatsApp e segna come contattato"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.47-1.761-1.643-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                          </svg>
                          WhatsApp
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 mt-3 sm:mt-0">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-sm sm:mr-2">
                    <span className="text-[10px] font-black uppercase text-slate-500 mr-2 ml-1">Contattato?</span>
                    <button 
                      onClick={() => toggleContattatoStatus(selectedMsg.id, true)}
                      className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", selectedMsg.contattato ? "bg-emerald-500 text-white shadow-sm" : "text-slate-400 hover:text-emerald-500 hover:bg-emerald-50")}
                    >
                      Sì
                    </button>
                    <button 
                      onClick={() => toggleContattatoStatus(selectedMsg.id, false)}
                      className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all", !selectedMsg.contattato ? "bg-rose-500 text-white shadow-sm" : "text-slate-400 hover:text-rose-500 hover:bg-rose-50")}
                    >
                      No
                    </button>
                  </div>
                  <button  
                    onClick={() => toggleReadStatus(selectedMsg.id, !selectedMsg.letto)}
                    className="flex justify-center items-center gap-2 flex-shrink-0 w-[110px] py-1.5 text-sm font-bold text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition-colors shadow-sm"
                    title={selectedMsg.letto ? "Segna come da leggere" : "Segna come già letto"}
                  >
                    {selectedMsg.letto ? (
                      <>
                        <Mail className="w-4 h-4 flex-shrink-0" />
                        <span className="hidden sm:inline">Non Letto</span>
                      </>
                    ) : (
                      <>
                        <MailOpen className="w-4 h-4 flex-shrink-0" />
                        <span className="hidden sm:inline">Letto</span>
                      </>
                    )}
                  </button>
                  <button 
                    onClick={(e) => handleDelete(selectedMsg.id, e as any)}
                    className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5 text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 rounded-xl transition-colors shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Elimina</span>
                  </button>
                </div>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-6">
                
                {selectedMsg.rifImmobile && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 shadow-sm">
                     <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500" />
                     <div>
                       <p className="text-sm font-black uppercase tracking-wide">Interesse Immobiliare</p>
                       <p className="text-sm mt-1 font-medium text-amber-700">Il cliente ha richiesto informazioni specifiche per l'immobile: <span className="font-bold underline decoration-amber-300 underline-offset-2">Rif. {selectedMsg.rifImmobile}</span></p>
                     </div>
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Contenuto del Messaggio
                  </h3>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed shadow-inner">
                    {selectedMsg.messaggio || <span className="italic text-slate-400">Nessun testo inserito dal cliente.</span>}
                  </div>
                </div>
                
                <div className="mt-8 border-t border-slate-100 pt-6">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wide text-right">
                    Ricevuto il {formatDate(selectedMsg.createdAt)}
                  </div>
                </div>

              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-5 relative">
                <div className="absolute inset-0 bg-indigo-50 rounded-full animate-ping opacity-20"></div>
                <Mail className="h-10 w-10 text-indigo-400 relative z-10" />
              </div>
              <h3 className="text-xl font-black tracking-tight text-slate-700">Seleziona un messaggio</h3>
              <p className="text-slate-500 mt-2 max-w-sm font-medium">
                Fai clic su un messaggio nella lista a sinistra per leggerne il contenuto e rispondere.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
