"use client";

import dynamic from "next/dynamic";
import {
  MapPin, Image as ImageIcon, Home, Maximize2, BedDouble, Bath, CheckCircle2,
  Filter, User, Phone, Mail, Eye, Tag, Key, Zap, Loader2, BarChart3,
  ExternalLink, MessageCircle, ChevronUp, ChevronDown,
  Sunrise, Wind, Waves, Armchair, Car, Trees,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getOwnerDisplayName } from "@/lib/immobili/owner";
import { PropertyGallery } from "@/components/immobili/PropertyGallery";

const PropertyMap = dynamic(() => import("@/components/PropertyMap"), { ssr: false });

/** Iconos por dotación, para la tarjeta "Dotazioni e Comfort". */
const amenityIcons: Record<string, React.ReactNode> = {
  Ascensore: <Sunrise className="h-4 w-4 text-blue-500" />,
  RiscaldamentoAutonomo: <Wind className="h-4 w-4 text-amber-500" />,
  VistaMare: <Waves className="h-4 w-4 text-cyan-500" />,
  Arredato: <Armchair className="h-4 w-4 text-rose-500" />,
  Chiavi: <Key className="h-4 w-4 text-emerald-500" />,
  Garage: <Car className="h-4 w-4 text-slate-500" />,
  PostoAuto: <Car className="h-4 w-4 text-slate-400" />,
  Balcone: <Maximize2 className="h-4 w-4 text-indigo-500" />,
  Terrazza: <Sunrise className="h-4 w-4 text-orange-500" />,
  Terreno: <Trees className="h-4 w-4 text-green-500" />,
};

interface PropertyDetailViewProps {
  property: any;
  ownerData: any;
  ownerProperties: any[];
  isLoadingDetail: boolean;
  detailError: string | null;
  onShowOwnerProperties: () => void;
  onOpenLightbox: (index: number) => void;
  /** Objeto que devuelve useInverseMatching, con su estado y acciones. */
  inverse: any;
  onSelectCliente: (cliente: any) => void;
  onWhatsAppCliente: (cliente: any) => void;
}

/**
 * Vista de solo lectura de la ficha del inmueble: galería, estructura,
 * dotaciones, descripción, mapa, tarjeta del propietario, gestión reservada y
 * el panel de matching inverso.
 */
export function PropertyDetailView({
  property,
  ownerData,
  ownerProperties,
  isLoadingDetail,
  detailError,
  onShowOwnerProperties,
  onOpenLightbox,
  inverse,
  onSelectCliente,
  onWhatsAppCliente,
}: PropertyDetailViewProps) {
  return (
    <>
         <div className="w-full max-w-[1400px] mx-auto space-y-6">
           {/* 1. Header & Mosaic Gallery */}
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row gap-6 relative">
             <div className="flex-1">
               <div className="flex items-center gap-3 mb-3">
                 <span className={cn(
                    "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm flex items-center gap-1",
                    property.GestioneCommerciale?.Sospeso ? "bg-rose-600 text-white" : "bg-emerald-500 text-white"
                  )}>
                    {property.GestioneCommerciale?.Sospeso ? "Sospeso" : (
                       <>
                         {property.GestioneCommerciale?.InVendita && "In Vendita"}
                         {property.GestioneCommerciale?.InVendita && property.GestioneCommerciale?.InAffitto && " | "}
                         {property.GestioneCommerciale?.InAffitto && "In Affitto"}
                       </>
                    )}
                 </span>
                 <span className="bg-slate-100 text-slate-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-200">
                   CODICE IMMOBILE: {property.DatiBase?.Codice || "N/A"}
                 </span>
               </div>
               <h1 className="text-3xl lg:text-4xl font-black text-slate-900 leading-tight">
                 {property.DatiBase?.Tipologia || "Immobile"} a {property.DatiBase?.Citta}
               </h1>
               <div className="flex items-center text-slate-500 font-medium text-base mt-2">
                 <MapPin className="h-4 w-4 mr-1.5 text-primary" />
                 {property.DatiBase?.Indirizzo || "Indirizzo non specificato"}, {property.DatiBase?.Zona && `${property.DatiBase.Zona}`}
               </div>
             </div>
             <div className="text-left md:text-right flex flex-col justify-end">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Prezzo Richiesto</div>
                <div className="text-2xl md:text-3xl lg:text-4xl font-black text-primary bg-primary/5 px-4 py-2 rounded-xl inline-flex flex-col md:flex-row items-end md:items-center gap-2 border border-primary/10">
                   {property.GestioneCommerciale?.InVendita && (
                      <span>€ {Number(property.GestioneCommerciale?.PrezzoVendita || 0).toLocaleString()}</span>
                   )}
                   {property.GestioneCommerciale?.InVendita && property.GestioneCommerciale?.InAffitto && (
                      <span className="text-slate-300 hidden md:inline">|</span>
                   )}
                   {property.GestioneCommerciale?.InAffitto && (
                      <span className="text-orange-500 md:text-3xl text-2xl">€ {Number(property.GestioneCommerciale?.PrezzoAffitto || 0).toLocaleString()} <span className="text-sm text-slate-400 font-bold uppercase">/mese</span></span>
                   )}
                </div>
             </div>
           </div>

           {/* Clean Carousel Gallery */}
           {isLoadingDetail ? (
             <div className="w-full h-48 bg-slate-100 rounded-3xl flex flex-col items-center justify-center gap-3 text-slate-400">
               <div className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-indigo-500 animate-spin" />
               <span className="text-xs font-semibold uppercase tracking-widest">Caricamento foto...</span>
             </div>
           ) : detailError ? (
             <div className="w-full h-48 bg-red-50 rounded-3xl flex flex-col items-center justify-center gap-2 text-red-400">
               <ImageIcon className="h-8 w-8 opacity-50" />
               <span className="text-sm font-bold uppercase tracking-widest">Errore caricamento dettagli</span>
               <span className="text-xs text-red-300">{detailError}</span>
             </div>
           ) : (
             <PropertyGallery
               images={property.images || []}
               onOpenLightbox={onOpenLightbox}
             />
           )}

           {/* 2. Corpo Principale (Layout 2 Colonne) */}
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
             
             {/* COLONNA SINISTRA (70%) */}
             <div className="lg:col-span-8 space-y-6">
               
               {/* Caratteristiche e Struttura */}
               <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                 <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                   <Home className="h-5 w-5 text-indigo-500" />
                   Struttura Immobile
                 </h3>
                 <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-6">
                    <div className="flex flex-col gap-1 border-r border-slate-100 last:border-0 pr-4">
                       <Maximize2 className="h-6 w-6 text-slate-300 mb-2" />
                       <span className="text-2xl font-black text-slate-800">{property.DettagliFisici?.MetriCommerciali || "--"}</span>
                       <span className="text-[11px] font-bold text-slate-400 uppercase">Metri Comm. (m²)</span>
                    </div>
                    <div className="flex flex-col gap-1 border-r border-slate-100 last:border-0 pr-4">
                       <Home className="h-6 w-6 text-slate-300 mb-2" />
                       <span className="text-2xl font-black text-slate-800">{property.DettagliFisici?.Locali || property.DettagliFisici?.Vani || "--"}</span>
                       <span className="text-[11px] font-bold text-slate-400 uppercase">Vani / Locali</span>
                    </div>
                    <div className="flex flex-col gap-1 border-r border-slate-100 last:border-0 pr-4">
                       <BedDouble className="h-6 w-6 text-slate-300 mb-2" />
                       <span className="text-2xl font-black text-slate-800">{property.DettagliFisici?.CamereLetto || "--"}</span>
                       <span className="text-[11px] font-bold text-slate-400 uppercase">Camere Letto</span>
                    </div>
                    <div className="flex flex-col gap-1 border-r border-slate-100 last:border-0 pr-4">
                       <Bath className="h-6 w-6 text-slate-300 mb-2" />
                       <span className="text-2xl font-black text-slate-800">{property.DettagliFisici?.Bagni || "--"}</span>
                       <span className="text-[11px] font-bold text-slate-400 uppercase">Bagni</span>
                    </div>
                    <div className="flex flex-col gap-1 pr-4">
                       <div className="h-7 w-12 flex items-center justify-center font-black text-emerald-600 border-2 border-emerald-200 bg-emerald-50 rounded mb-2 pt-0.5 text-xs">
                         {property.DettagliFisici?.ClasseEnergetica || "-"}
                       </div>
                       <span className="text-2xl font-black text-slate-800">{property.DettagliFisici?.Piano || "T"}</span>
                       <span className="text-[11px] font-bold text-slate-400 uppercase">Piano</span>
                    </div>
                 </div>
                  
                  <div className="grid grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-100">
                     <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Stato Finiture</span>
                        <span className="font-bold text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 inline-block">{property.DettagliFisici?.StatoFiniture || "Non specificato"}</span>
                     </div>
                     <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">Tipologia Edificio</span>
                        <span className="font-bold text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 inline-block">{property.DettagliFisici?.TipoEdificio || "Non specificato"}</span>
                     </div>
                  </div>
               </div>

               {/* Dotazioni e Comfort */}
               <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                 <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                   <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                   Dotazioni e Comfort
                 </h3>
                 <div className="flex flex-wrap gap-3">
                    {property.Caratteristiche && Object.entries(property.Caratteristiche).map(([key, value]) => {
                      if (value === true) {
                        return (
                          <span key={key} className="inline-flex items-center gap-2 bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 shadow-sm hover:bg-slate-100 transition-colors">
                            {amenityIcons[key] || <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                        );
                      }
                      return null;
                    })}
                    {(!property.Caratteristiche || !Object.values(property.Caratteristiche).includes(true)) && (
                      <span className="text-slate-400 text-sm italic font-medium bg-slate-50 px-4 py-2 rounded-lg w-full text-center border border-slate-100">Nessuna dotazione salvata nel sistema per questo immobile.</span>
                    )}
                 </div>
               </div>

               {/* Descrizione Pubblica */}
               <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
                 <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
                   <Filter className="h-5 w-5 text-blue-500" />
                   Descrizione Pubblica
                 </h3>
                 <div className="text-slate-700 leading-relaxed font-medium whitespace-pre-wrap text-[15px] prose prose-slate">
                   {property.Textos?.Descrizione || (
                     <span className="italic text-slate-400">Nessun testo descriptivo pubblico caricato...</span>
                   )}
                 </div>
               </div>

                {/* Mappa dell'Area (Privacy: Solo zona approssimativa) */}
                {(property.DatiBase?.Citta || property.DatiBase?.Indirizzo) && (
                  <PropertyMap
                    indirizzo={property.DatiBase?.Indirizzo}
                    citta={property.DatiBase?.Citta}
                    zona={property.DatiBase?.Zona}
                  />
                )}

             </div>

             {/* COLONNA DESTRA (30%) Dati Sensibili */}
             <div className="lg:col-span-4 space-y-6">
               
               {/* Proprietario (CRM Only) */}
               <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-10 transition-opacity pointer-events-none transform group-hover:scale-110 duration-500">
                    <User className="w-32 h-32 text-indigo-900" />
                  </div>
                  <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <User className="h-4 w-4" /> CRM: Dati Proprietario
                  </h3>
                  <div className="space-y-5 relative z-10">
                    <div>
                       <a
                         href={property.proprietarioId ? `/proprietari?open=${property.proprietarioId}` : '#'}
                         className="text-2xl font-black text-slate-900 leading-tight hover:text-indigo-700 transition-colors cursor-pointer inline-block"
                       >
                         {property.DatiBase?.NomeProprietario || getOwnerDisplayName(ownerData, 'Non Associato')}
                       </a>
                       <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mt-1.5 flex items-center bg-indigo-100 w-fit px-2.5 py-1 rounded">
                         Mandante Originale
                       </div>
                    </div>
                    
                    {(ownerData?.telefono || ownerData?.email) ? (
                      <div className="pt-4 border-t border-indigo-200/50 flex flex-col gap-3">
                        {ownerData?.telefono && (
                          <a href={`tel:${ownerData.telefono}`} className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-indigo-100 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group/link">
                             <div className="bg-emerald-100 p-2 rounded-lg group-hover/link:bg-emerald-200 transition-colors"><Phone className="h-4 w-4 text-emerald-600" /></div>
                             <span className="font-bold text-slate-700 text-sm tracking-wide">{ownerData.telefono}</span>
                          </a>
                        )}
                        {ownerData?.email && (
                          <a href={`mailto:${ownerData.email}`} className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-indigo-100 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group/link">
                             <div className="bg-sky-100 p-2 rounded-lg group-hover/link:bg-sky-200 transition-colors"><Mail className="h-4 w-4 text-sky-600" /></div>
                             <span className="font-bold text-slate-700 text-sm truncate">{ownerData.email}</span>
                          </a>
                        )}
                        {property.proprietarioId && (
                          <button
                            onClick={() => ownerProperties.length > 0 && onShowOwnerProperties()}
                            disabled={ownerProperties.length === 0}
                            className={cn(
                              "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border mt-1 w-full",
                              ownerProperties.length > 0
                                ? "bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border-indigo-200 cursor-pointer hover:shadow-md"
                                : "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                            )}
                          >
                            <Home className="h-3.5 w-3.5" />
                            {ownerProperties.length > 0 ? (
                              <>
                                Vedi altre {ownerProperties.length} proprietà
                                <span className="ml-auto h-5 w-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shadow-sm">{ownerProperties.length}</span>
                              </>
                            ) : (
                              "Unica proprietà"
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-indigo-200/50 space-y-3">
                         <p className="text-sm font-medium text-slate-500 italic">I contatti dettagliati del proprietario non sono caricati a sistema.</p>
                         {property.proprietarioId && (
                           <>
                           <a
                             href={`/proprietari?open=${property.proprietarioId}`}
                             className="flex items-center justify-center gap-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border border-indigo-200"
                           >
                             <Eye className="h-3.5 w-3.5" /> Vedi Profilo Proprietario
                           </a>
                           <button
                             onClick={() => ownerProperties.length > 0 && onShowOwnerProperties()}
                             disabled={ownerProperties.length === 0}
                             className={cn(
                               "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border w-full",
                               ownerProperties.length > 0
                                 ? "bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border-indigo-200 cursor-pointer hover:shadow-md"
                                 : "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                             )}
                           >
                             <Home className="h-3.5 w-3.5" />
                             {ownerProperties.length > 0 ? (
                               <>
                                 Vedi altre {ownerProperties.length} proprietà
                                 <span className="ml-auto h-5 w-5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shadow-sm">{ownerProperties.length}</span>
                               </>
                             ) : (
                               "Unica proprietà"
                             )}
                           </button>
                           </>
                         )}
                      </div>
                    )}
                  </div>
               </div>

               {/* Codici e Valori Riservati */}
               <div className="bg-orange-50/50 p-6 rounded-2xl border border-orange-200 shadow-sm relative overflow-hidden">
                  <h3 className="text-xs font-bold text-orange-800 uppercase tracking-widest mb-5 flex items-center gap-2">
                    <Tag className="h-4 w-4" /> Gestione Agenzia (Riservato)
                  </h3>
                  <div className="space-y-4 text-sm bg-white rounded-xl border border-orange-100 p-4">
                     <div className="flex justify-between items-center pb-3 border-b border-orange-100">
                       <span className="text-slate-500 font-bold">Data Incarico:</span>
                       <span className="font-black text-slate-800">{property.GestioneCommerciale?.DataIncarico || "--/--/----"}</span>
                     </div>
                     <div className="flex justify-between items-center pb-3 border-b border-orange-100">
                       <span className="text-slate-500 font-bold">Scadenza Mandato:</span>
                       <span className="font-black text-slate-800">{property.GestioneCommerciale?.ScadenzaIncarico || "--/--/----"}</span>
                     </div>
                     <div className="flex justify-between items-center pb-3 border-b border-orange-100">
                       <span className="text-slate-500 font-bold flex items-center gap-2"><Key className="w-3 h-3"/> Stato Chiavi:</span>
                       <span className={cn("font-black px-2 py-0.5 rounded text-[10px]", property.Documentazione?.StatoChiavi === 'In Ufficio' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>
                         {property.Documentazione?.StatoChiavi || "Sconosciuto"}
                       </span>
                     </div>
                     <div className="flex justify-between items-center pb-3 border-b border-orange-100">
                       <span className="text-slate-500 font-bold">Prezzo Min. Accettato:</span>
                       <span className="font-black text-rose-600 text-base">€ {property.GestioneCommerciale?.PrezzoMinimo || "0"}</span>
                     </div>
                     <div className="flex justify-between items-center pb-3 border-b border-orange-100 mt-3 pt-3">
                       <span className="text-slate-500 font-bold">Spese Condominiali:</span>
                       <span className="font-black text-slate-800">€ {property.GestioneCommerciale?.SpeseCondominio || "0"} /anno</span>
                     </div>
                     <div className="flex justify-between items-center pt-1">
                       <span className="text-slate-500 font-bold">Amministratore:</span>
                       <span className="font-black text-slate-800 truncate pl-4">{property.GestioneCommerciale?.Amministratore || "Non specificato"}</span>
                     </div>
                  </div>

                  {/* Note Private */}
                  <div className="mt-4">
                    <span className="text-slate-500 font-bold block mb-2 text-xs uppercase">Note Interne / Trattativa:</span>
                    <div className="bg-yellow-100/60 p-4 rounded-xl text-slate-800 font-medium italic border border-yellow-200/50 text-sm whitespace-pre-wrap leading-relaxed shadow-inner">
                      {property.Textos?.NoteInterne || "Nessuna annotazione privata registrata sull'immobile."}
                    </div>
                  </div>
               </div>
               
             </div>
           </div>

           {/* ═══ TROVA ACQUIRENTI — Inverse Smart Matching (Full Width) ═══ */}
           <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 md:p-8 rounded-2xl border border-violet-200 shadow-sm">
             <div className="flex items-center justify-between mb-5">
               <div>
                 <h3 className="text-sm font-black text-violet-800 uppercase tracking-widest flex items-center gap-2">
                   <Zap className="h-5 w-5" /> Trova Acquirenti
                 </h3>
                 <p className="text-xs text-violet-500 font-medium mt-1">Cerca clienti compatibili con questo immobile</p>
               </div>
               <button
                 onClick={() => {
                   inverse.setOpen(!inverse.open);
                   if (!inverse.open && inverse.matches.length === 0) inverse.run(0);
                 }}
                 className={cn(
                   "px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm",
                   inverse.open
                     ? 'bg-white text-violet-700 border border-violet-200 hover:bg-violet-50'
                     : 'bg-violet-600 text-white hover:bg-violet-700'
                 )}
               >
                 {inverse.loading ? (
                   <><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />Analisi...</>
                 ) : inverse.open ? 'Chiudi' : (<><Zap className="h-4 w-4 inline mr-1" />Cerca Clienti</>)}
               </button>
             </div>

             {inverse.open && (
               <div>
                 {inverse.loading ? (
                   <div className="flex flex-col items-center py-12 gap-3">
                     <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
                     <p className="text-sm text-violet-600 font-medium">Analisi dei clienti in corso...</p>
                   </div>
                 ) : inverse.matches.length === 0 ? (
                   <div className="text-center py-10">
                     <BarChart3 className="h-12 w-12 text-violet-200 mx-auto mb-3" />
                     <p className="text-sm font-bold text-violet-400">Nessun cliente compatibile trovato (≥40%)</p>
                   </div>
                 ) : (
                   <>
                     <p className="text-xs font-bold text-violet-600 mb-4">
                       {inverse.total} client{inverse.total !== 1 ? 'i' : 'e'} compatibil{inverse.total !== 1 ? 'i' : 'e'}
                     </p>

                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                       {inverse.matches.map((cm: any) => {
                         const pct = cm.matchPercentage;
                         const isExp = inverse.expanded === cm.clienteId;
                         const dateStr = cm.dataCreazione
                           ? new Date(cm.dataCreazione).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
                           : null;

                         return (
                           <div key={cm.clienteId} className="bg-white rounded-xl border border-violet-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                             <div className="p-4 flex items-center gap-3">
                               {/* Score Badge */}
                               <div className={cn(
                                 "h-12 w-12 rounded-lg flex items-center justify-center text-sm font-black text-white flex-shrink-0",
                                 pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-orange-500'
                               )}>
                                 {pct}%
                               </div>

                               {/* Client Info — Clickable Name */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <button
                                       onClick={() => onSelectCliente(cm)}
                                       className="text-sm font-black text-slate-800 truncate hover:text-violet-600 transition-colors cursor-pointer flex items-center gap-1.5"
                                       title="Apri dettagli cliente"
                                     >
                                       {cm.nome} {cm.cognome}
                                       <ExternalLink className="h-3 w-3 text-violet-400 flex-shrink-0" />
                                     </button>
                                    {cm.isRecent && (
                                      <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded text-[10px] font-black flex-shrink-0">
                                        🔥 Nuovo
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5">
                                    {dateStr && (
                                      <span className="text-[11px] text-slate-400 font-medium">
                                        In data: {dateStr}
                                      </span>
                                    )}
                                    {cm.telefono && (
                                      <span className="text-[11px] text-slate-400 font-medium flex items-center gap-0.5">
                                        <Phone className="h-3 w-3" /> {cm.telefono}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                                    {cm.summary}
                                  </p>
                                </div>

                               {/* Actions */}
                               <div className="flex items-center gap-1.5 flex-shrink-0">
                                 <button
                                   onClick={() => onWhatsAppCliente(cm)}
                                   aria-label={`Invia WhatsApp a ${cm.nome} ${cm.cognome}`}
                                   className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-200 transition-colors"
                                   title="WhatsApp"
                                 >
                                   <MessageCircle className="h-4 w-4" />
                                 </button>
                                 <button
                                   onClick={() => inverse.setExpanded(isExp ? null : cm.clienteId)}
                                   aria-label={isExp ? "Nascondi punteggio dettagliato" : "Mostra punteggio dettagliato"}
                                   className={cn(
                                     "h-9 w-9 rounded-lg flex items-center justify-center transition-colors border",
                                     isExp ? 'bg-violet-100 text-violet-600 border-violet-200' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'
                                   )}
                                   title="Dettagli"
                                 >
                                   {isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                 </button>
                               </div>
                             </div>

                             {/* Expanded Breakdown */}
                             {isExp && (
                               <div className="px-4 pb-4 pt-0 border-t border-violet-50">
                                 <div className="bg-slate-50/80 rounded-lg p-3 mt-2">
                                   <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Punteggio Dettagliato</h5>
                                   <div className="space-y-1.5">
                                     {(cm.breakdown || []).map((b: any) => (
                                       <div key={b.criterio} className={cn("flex items-center gap-2", b.wildcard && 'opacity-50')}>
                                         <span className={cn("text-[10px] font-bold w-20 text-right flex-shrink-0", b.wildcard ? 'text-slate-400 italic' : 'text-slate-600')}>{b.label}</span>
                                         <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                           <div
                                             className={cn("h-full rounded-full transition-all duration-500",
                                               b.wildcard ? 'bg-slate-300' :
                                               b.score >= 0.8 ? 'bg-emerald-500' : b.score >= 0.5 ? 'bg-amber-500' : b.score > 0 ? 'bg-orange-400' : 'bg-slate-300'
                                             )}
                                             style={{ width: `${Math.round(b.score * 100)}%` }}
                                           />
                                         </div>
                                         <span className={cn("text-[10px] font-bold w-10 flex-shrink-0", b.wildcard ? 'text-slate-400' : 'text-slate-500')}>{b.puntos}/{b.peso}</span>
                                       </div>
                                     ))}
                                   </div>
                                 </div>
                               </div>
                             )}
                           </div>
                         );
                       })}
                     </div>

                     {/* Load More */}
                     {inverse.hasMore && (
                       <button
                         onClick={() => inverse.run(inverse.page + 1)}
                         disabled={inverse.loadingMore}
                         className="w-full py-3 mt-4 bg-white border border-violet-200 text-violet-700 text-sm font-bold rounded-xl hover:bg-violet-50 transition-colors disabled:opacity-50"
                       >
                         {inverse.loadingMore ? (
                           <><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />Caricamento...</>
                         ) : (
                           `Carica altri 15 clienti (${inverse.matches.length}/${inverse.total})`
                         )}
                       </button>
                     )}
                   </>
                 )}
               </div>
             )}
           </div>

         </div>
    </>
  );
}
