"use client";

import type { DropzoneRootProps, DropzoneInputProps } from "react-dropzone";
import {
  Tag, MapPin, Map, Home, CheckCircle2, Euro, Filter, UploadCloud,
  Image as ImageIcon, Trash2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractImageUrls as extractImages } from "@/lib/imageUtils";
import zonasData from "@/lib/zonas.json";
import { getOwnerDisplayName } from "@/lib/immobili/owner";

interface PropertyEditFormProps {
  property: any;
  /** Escribe un campo anidado: updateNested('DatiBase', 'Codice', valor). */
  updateNested: (category: string, field: string, value: any) => void;
  /** Sube un documento suelto (planimetria, atto, otros). */
  onFileUpload: (
    e: React.ChangeEvent<HTMLInputElement>,
    pathPrefix: string,
    category: string,
    field: string,
  ) => void;
  /** Objeto que devuelve usePropertyImages. */
  photos: any;
  getRootProps: () => DropzoneRootProps;
  getInputProps: () => DropzoneInputProps;
  isDragActive: boolean;
  onOpenLightbox: (index: number) => void;
  validLightboxImages: string[];
  /** Propietario ya cargado; null mientras se resuelve. */
  ownerData: any;
  isMapOpen: boolean;
  setIsMapOpen: (open: boolean) => void;
}

/**
 * Formulario de edición del inmueble: códigos y estado, ubicación, estructura,
 * dotaciones, precios, documentación, imágenes y textos.
 *
 * Es la mayor superficie de escritura de la página: cada onChange llama a
 * updateNested y Firestore acepta cualquier clave, así que un nombre de campo
 * mal tecleado corrompe datos en silencio.
 */
export function PropertyEditForm({
  property,
  updateNested,
  onFileUpload,
  photos,
  getRootProps,
  getInputProps,
  isDragActive,
  onOpenLightbox,
  validLightboxImages,
  ownerData,
  isMapOpen,
  setIsMapOpen,
}: PropertyEditFormProps) {
  return (
                 <div className="space-y-6 max-w-6xl mx-auto">
    {/* EDIT MODE CARDS - Card 1: Codici e Stato */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
     <Tag className="h-4 w-4 text-primary" />
     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">1. Codici e Stato</h3>
   </div>
   <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Stato Immobile</label>
        <select 
          className="w-full h-11 px-3 rounded-lg border border-emerald-200 bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-emerald-800"
          value={property.GestioneCommerciale?.Sospeso ? "Sospeso" : "Attivo"}
          onChange={(e) => updateNested('GestioneCommerciale', 'Sospeso', e.target.value === "Sospeso")}
        >
          <option value="Attivo">🟢 Libero / Attivo</option>
          <option value="Sospeso">🔴 Sospeso</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Codice Cliente</label>
        <input 
          type="text" 
          readOnly 
          value={property.DatiBase?.Codice || "N/A"} 
          className="w-full h-11 px-3 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 font-medium cursor-not-allowed"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Proprietario Collegato</label>
        <div className="flex items-center gap-2">
          <input 
            type="text" 
            readOnly 
            value={property.DatiBase?.NomeProprietario || getOwnerDisplayName(ownerData, ownerData === null ? 'Caricamento...' : 'Proprietario da verificare')} 
            className="flex-1 h-11 px-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-bold"
          />
          <button className="h-11 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-sm font-bold transition-colors">Cambia</button>
        </div>
      </div>
   </div>
                </div>

                {/* Card 2: Ubicazione */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
     <MapPin className="h-4 w-4 text-rose-500" />
     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">2. Ubicazione</h3>
   </div>
   <div className="p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="col-span-1 md:col-span-2 space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Indirizzo Completo</label>
          <input type="text" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" value={property.DatiBase?.Indirizzo || ""} onChange={(e) => updateNested('DatiBase', 'Indirizzo', e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Città</label>
          <input type="text" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" value={property.DatiBase?.Citta || ""} onChange={(e) => updateNested('DatiBase', 'Citta', e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Provincia / CAP</label>
          <div className="flex gap-2">
            <input type="text" className="w-16 h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-center font-bold" value={property.DatiBase?.Provincia || "TP"} onChange={(e) => updateNested('DatiBase', 'Provincia', e.target.value)} />
            <input type="text" className="flex-1 h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" placeholder="CAP" value={property.DatiBase?.CAP || ""} onChange={(e) => updateNested('DatiBase', 'CAP', e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Zona / Quartiere</label>
          <select 
            className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
            value={property.DatiBase?.Zona || ""} 
            onChange={(e) => updateNested('DatiBase', 'Zona', e.target.value)}
          >
            <option value="">Nessuna Zona</option>
            {zonasData.map((zona: string) => (
              <option key={zona} value={zona}>{zona}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Distanza Mare (m)</label>
          <input type="text" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" placeholder="Es. 500" value={property.DatiBase?.DistanzaMare || ""} onChange={(e) => updateNested('DatiBase', 'DistanzaMare', e.target.value)} />
        </div>
        <div className="col-span-1 md:col-span-2 flex items-center h-full pt-4">
           <label className="flex items-center gap-3 cursor-pointer">
             <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary" checked={property.Caratteristiche?.ZonaMare || false} onChange={(e) => updateNested('Caratteristiche', 'ZonaMare', e.target.checked)} />
             <span className="font-bold text-slate-700">Situato in Zona Mare (Turistica)</span>
           </label>
        </div>
      </div>
      <button 
        onClick={() => setIsMapOpen(!isMapOpen)}
        className="w-full h-11 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors mt-4"
      >
        <Map className="h-4 w-4" /> {isMapOpen ? "Nascondi Mappa" : "Apri Mappa Interattiva"}
      </button>

      {isMapOpen && (
        <div className="mt-4 w-full h-72 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner relative">
           <iframe
             width="100%"
             height="100%"
             frameBorder="0"
             style={{border:0}}
             src={`https://maps.google.com/maps?q=${encodeURIComponent(`${property.DatiBase?.Indirizzo || ''}, ${property.DatiBase?.Citta || ''}, ${property.DatiBase?.Provincia || ''}`)}&output=embed`}
             allowFullScreen
           />
        </div>
      )}
   </div>
                </div>

                {/* Card 3: Caratteristiche e Struttura */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
     <Home className="h-4 w-4 text-indigo-500" />
     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">3. Struttura Immobile</h3>
   </div>
   <div className="p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Tipologia</label>
        <select 
          className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          value={property.DatiBase?.Tipologia || "Appartamento"}
          onChange={(e) => updateNested('DatiBase', 'Tipologia', e.target.value)}
        >
          <option value="Appartamento">Appartamento</option>
          <option value="Casa/Villa">Casa/Villa</option>
          <option value="Locale o Capannone">Locale o Capannone</option>
          <option value="Terreni">Terreni</option>
          <option value="Garage o Posto auto">Garage o Posto auto</option>
          <option value="Edificio">Edificio</option>
          <option value="Ufficio">Ufficio</option>
          <option value="Rustico">Rustico</option>
          <option value="Stanza">Stanza</option>
          <option value="Cessione Di Attivita">Cessione Di Attivita</option>
          <option value="Cantina">Cantina</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Metri Comm. (m²)</label>
        <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={property.DettagliFisici?.MetriCommerciali || 0} onChange={(e) => updateNested('DettagliFisici', 'MetriCommerciali', Number(e.target.value))} />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">N° Vani</label>
        <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={property.DettagliFisici?.Vani || 0} onChange={(e) => updateNested('DettagliFisici', 'Vani', Number(e.target.value))} />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">N° Camere Letto</label>
        <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={property.DettagliFisici?.CamereLetto || 0} onChange={(e) => updateNested('DettagliFisici', 'CamereLetto', Number(e.target.value))} />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">N° Bagni</label>
        <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={property.DettagliFisici?.Bagni || 0} onChange={(e) => updateNested('DettagliFisici', 'Bagni', Number(e.target.value))} />
      </div>
      
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Piano</label>
        <input type="text" className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" value={property.DettagliFisici?.Piano || ""} onChange={(e) => updateNested('DettagliFisici', 'Piano', e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Stato Finiture</label>
        <select 
          className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          value={property.DettagliFisici?.StatoFiniture || "Abitabile"}
          onChange={(e) => updateNested('DettagliFisici', 'StatoFiniture', e.target.value)}
        >
          <option value="Nuovo">Nuovo</option>
          <option value="Ottime">Ottime</option>
          <option value="Buono">Buono</option>
          <option value="Abitabile">Abitabile</option>
          <option value="Da Ristrutturare">Da Ristrutturare</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Stato Arredamento</label>
        <select 
           className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
           value={property.Caratteristiche?.ArredamentoDesc || (property.Caratteristiche?.Arredato ? "Arredato" : "Non Arredato")} 
           onChange={(e) => {
             updateNested('Caratteristiche', 'ArredamentoDesc', e.target.value);
             updateNested('Caratteristiche', 'Arredato', e.target.value === "Arredato");
           }}
        >
          <option value="-- Non specificato --">-- Non specificato --</option>
          <option value="Arredato">Arredato</option>
          <option value="Non Arredato">Non Arredato</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Tipologia Edificio</label>
        <select 
           className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
           value={property.DettagliFisici?.TipoEdificio || "Unica Elevazione"} 
           onChange={(e) => updateNested('DettagliFisici', 'TipoEdificio', e.target.value)}
        >
          <option value="Unica Elevazione">Unica Elevazione</option>
          <option value="Più Piani">Più Piani</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Presenza Cartello</label>
        <select 
           className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
           value={property.GestioneCommerciale?.PresenzaCartello || "No — Senza Cartello"} 
           onChange={(e) => updateNested('GestioneCommerciale', 'PresenzaCartello', e.target.value)}
        >
          <option value="Sì — Ha Cartello Pubblicitario">Sì — Ha Cartello Pubblicitario</option>
          <option value="No — Senza Cartello">No — Senza Cartello</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Classe Energetica (APE)</label>
        <select className="w-full h-11 px-3 rounded-lg border border-green-300 bg-green-50 font-black text-green-800 focus:outline-none focus:ring-2 focus:ring-green-400/20 focus:border-green-500" value={property.DettagliFisici?.ClasseEnergetica || ""} onChange={(e) => updateNested('DettagliFisici', 'ClasseEnergetica', e.target.value)}>
          <option value="">Seleziona APE...</option>
          <option value="A4">A4 (Massima Efficienza)</option>
          <option value="A3">A3</option>
          <option value="A2">A2</option>
          <option value="A1">A1</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
          <option value="E">E</option>
          <option value="F">F</option>
          <option value="G">G</option>
        </select>
      </div>
   </div>
                </div>

                {/* Card 4: Dotazioni */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
     <CheckCircle2 className="h-4 w-4 text-emerald-500" />
     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">4. Dotazioni e Comfort</h3>
   </div>
   <div className="p-5 space-y-6">
      <div>
        <h4 className="text-sm font-bold text-slate-500 mb-3 uppercase">Interne</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries({
             'Ascensore': 'Ascensore',
             'RiscaldamentoAutonomo': 'Riscaldamento Autonomo',
             'AriaCondizionata': 'Aria Condizionata',
             'CucinaAbitabile': 'Cucina Abitabile'
          }).map(([key, label]) => {
             const isActive = property.Caratteristiche?.[key] || false;
             return (
               <button 
                 key={key}
                 onClick={() => updateNested('Caratteristiche', key, !isActive)}
                 className={cn("h-11 rounded-lg border text-sm font-bold transition-all", isActive ? "bg-primary/10 border-primary text-primary" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}
               >
                 {label}
               </button>
             )
          })}
        </div>
      </div>
      <div>
        <h4 className="text-sm font-bold text-slate-500 mb-3 uppercase">Esterne ed Extra</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries({
             'Balcone': 'Balcone',
             'VistaMare': 'Vista Mare',
             'Terrazza': 'Terrazza',
             'Terreno': 'Terreno',
             'Giardino': 'Giardino',
             'Garage': 'Garage',
             'Cantina': 'Cantina',
             'PostoAutoCoperto': 'Posto Auto Coperto',
             'PostoAutoScoperto': 'Posto Auto Scoperto'
          }).map(([key, label]) => {
             const isActive = property.Caratteristiche?.[key] || false;
             return (
               <button 
                 key={key}
                 onClick={() => updateNested('Caratteristiche', key, !isActive)}
                 className={cn("h-11 rounded-lg border text-sm font-bold transition-all", isActive ? "bg-cyan-50 border-cyan-500 text-cyan-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}
               >
                 {label}
               </button>
             )
          })}
        </div>
      </div>
   </div>
                </div>

                {/* Card 6: Prezzi */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
     <Euro className="h-4 w-4 text-amber-500" />
     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">5. Operazione e Prezzi</h3>
   </div>
   <div className="p-5 space-y-6">
      <div className="flex gap-6 pb-6 border-b border-slate-100">
         <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200 flex-1 hover:bg-slate-100 transition-colors">
            <input type="checkbox" className="w-6 h-6 rounded border-slate-300 text-primary" checked={property.GestioneCommerciale?.InVendita || false} onChange={(e) => updateNested('GestioneCommerciale', 'InVendita', e.target.checked)} />
            <span className="font-black text-lg text-slate-800">IN VENDITA</span>
         </label>
         <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200 flex-1 hover:bg-slate-100 transition-colors">
            <input type="checkbox" className="w-6 h-6 rounded border-slate-300 text-primary" checked={property.GestioneCommerciale?.InAffitto || false} onChange={(e) => updateNested('GestioneCommerciale', 'InAffitto', e.target.checked)} />
            <span className="font-black text-lg text-slate-800">IN AFFITTO</span>
         </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         <div className="space-y-2">
           <label className="text-xs font-bold text-slate-500 uppercase">Prezzo Vendita (€)</label>
           <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold bg-green-50/50" value={property.GestioneCommerciale?.PrezzoVendita || 0} onChange={(e) => updateNested('GestioneCommerciale', 'PrezzoVendita', Number(e.target.value))} />
         </div>
         <div className="space-y-2">
           <label className="text-xs font-bold text-slate-500 uppercase">Prezzo Min. Accettabile (€)</label>
           <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold bg-orange-50/50" placeholder="0" value={property.GestioneCommerciale?.PrezzoMinimo || 0} onChange={(e) => updateNested('GestioneCommerciale', 'PrezzoMinimo', Number(e.target.value))} />
         </div>
         <div className="space-y-2">
           <label className="text-xs font-bold text-slate-500 uppercase">Canone Mensile (€)</label>
           <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold" value={property.GestioneCommerciale?.PrezzoAffitto || 0} onChange={(e) => updateNested('GestioneCommerciale', 'PrezzoAffitto', Number(e.target.value))} />
         </div>
         <div className="space-y-2">
           <label className="text-xs font-bold text-slate-500 uppercase">Spese Cond. Annue (€)</label>
           <input type="number" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" placeholder="0" value={property.GestioneCommerciale?.SpeseCondominio || 0} onChange={(e) => updateNested('GestioneCommerciale', 'SpeseCondominio', Number(e.target.value))} />
         </div>
         <div className="col-span-2 space-y-2">
           <label className="text-xs font-bold text-slate-500 uppercase">Amministratore Condominio</label>
           <input type="text" className="w-full h-11 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium" value={property.GestioneCommerciale?.Amministratore || ""} onChange={(e) => updateNested('GestioneCommerciale', 'Amministratore', e.target.value)} />
         </div>
      </div>
   </div>
                </div>

                {/* Card Nuova: Documentazione e Chiavi */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm mb-6">
   <div className="px-5 py-4 border-b border-border bg-slate-50/50 flex items-center gap-2">
     <Filter className="h-4 w-4 text-emerald-600" />
     <div>
        <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">📁 Documentazione e Chiavi</h3>
        <p className="text-xs text-slate-500 font-medium mt-0.5">Stato dei documenti fisici/digitali e disponibilità delle chiavi</p>
     </div>
   </div>
   <div className="p-5 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="space-y-3">
           <label className="text-xs font-bold text-slate-500 uppercase">Planimetria</label>
           <select 
             className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
             value={property.Documentazione?.Planimetria || "-- Non specificato --"}
             onChange={(e) => updateNested('Documentazione', 'Planimetria', e.target.value)}
           >
              <option value="-- Non specificato --">-- Non specificato --</option>
              <option value="Disponibile">Disponibile</option>
              <option value="Da Richiedere">Da Richiedere</option>
           </select>
           <label className="w-full h-9 bg-slate-50 border border-slate-200 border-dashed rounded-lg flex items-center justify-center text-xs font-bold text-slate-500 hover:text-primary hover:border-primary transition-colors cursor-pointer">
              <UploadCloud className="h-3 w-3 mr-1.5" /> 
              {property.Documentazione?.UrlPlanimetria ? "Aggiorna File Planimetria" : "Carica File Planimetria"}
              <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => onFileUpload(e, 'documenti', 'Documentazione', 'UrlPlanimetria')} />
           </label>
           {property.Documentazione?.UrlPlanimetria && (
              <a href={property.Documentazione.UrlPlanimetria} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 font-bold block mt-1 hover:underline truncate">Vedi Documento Corrente</a>
           )}
         </div>
         <div className="space-y-3">
           <label className="text-xs font-bold text-slate-500 uppercase">Atto Immobile</label>
           <select 
             className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
             value={property.Documentazione?.AttoImmobile || "-- Non specificato --"}
             onChange={(e) => updateNested('Documentazione', 'AttoImmobile', e.target.value)}
           >
              <option value="-- Non specificato --">-- Non specificato --</option>
              <option value="Disponibile">Disponibile</option>
              <option value="Da Richiedere">Da Richiedere</option>
           </select>
           <label className="w-full h-9 bg-slate-50 border border-slate-200 border-dashed rounded-lg flex items-center justify-center text-xs font-bold text-slate-500 hover:text-primary hover:border-primary transition-colors cursor-pointer">
              <UploadCloud className="h-3 w-3 mr-1.5" /> 
              {property.Documentazione?.UrlAttoImmobile ? "Aggiorna File Atto" : "Carica File Atto"}
              <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => onFileUpload(e, 'documenti', 'Documentazione', 'UrlAttoImmobile')} />
           </label>
           {property.Documentazione?.UrlAttoImmobile && (
              <a href={property.Documentazione.UrlAttoImmobile} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 font-bold block mt-1 hover:underline truncate">Vedi Documento Corrente</a>
           )}
         </div>
         <div className="space-y-3 flex flex-col">
           <label className="text-xs font-bold text-slate-500 uppercase">Stato Chiavi</label>
           <select 
             className="w-full h-11 px-3 rounded-lg border border-slate-200 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
             value={property.Documentazione?.StatoChiavi || "-- Non specificato --"}
             onChange={(e) => updateNested('Documentazione', 'StatoChiavi', e.target.value)}
           >
              <option value="-- Non specificato --">-- Non specificato --</option>
              <option value="In Ufficio">In Ufficio</option>
              <option value="Dal Proprietario">Dal Proprietario</option>
              <option value="All'Inquilino">All'Inquilino</option>
           </select>
           <div className="mt-auto">
             <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Vari</label>
             <label className="w-full h-9 bg-slate-50 border border-slate-200 border-dashed rounded-lg flex items-center justify-center text-xs font-bold text-slate-500 hover:text-primary hover:border-primary transition-colors cursor-pointer">
                <UploadCloud className="h-3 w-3 mr-1.5" /> 
                {property.Documentazione?.UrlAltriDocumenti ? "Aggiorna Altri Documenti" : "Altri Documenti"}
                <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => onFileUpload(e, 'documenti', 'Documentazione', 'UrlAltriDocumenti')} />
             </label>
             {property.Documentazione?.UrlAltriDocumenti && (
              <a href={property.Documentazione.UrlAltriDocumenti} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 font-bold block mt-1 hover:underline truncate">Vedi Documento Corrente</a>
             )}
           </div>
         </div>
      </div>
   </div>
                </div>

                {/* Card 7: Immagini e Dropzone */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center justify-between">
     <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-fuchsia-500" />
        <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">6. Immagini e Media</h3>
     </div>
     {property.images && property.images.length > 0 && (
        <span className="text-xs font-bold bg-fuchsia-100 text-fuchsia-700 px-3 py-1 rounded-full">{property.images.length} foto in Firebase</span>
     )}
   </div>
   <div className="p-5 space-y-6">
      {/* Dropzone */}
      <div {...getRootProps()} className={cn("border-2 border-dashed rounded-xl p-8 text-center transition-colors", property?.id ? "cursor-pointer" : "opacity-50 cursor-not-allowed", isDragActive && property?.id ? "border-primary bg-primary/5" : "border-slate-300 bg-slate-50 hover:border-primary hover:bg-slate-50/80")}>
        <input {...getInputProps()} disabled={!property?.id} />
        <UploadCloud className="h-10 w-10 text-slate-400 mx-auto mb-3" />
        <p className="font-bold text-slate-700 text-lg">
          {property?.id ? "Trascina le foto qui o clicca per sfogliare" : "Salva prima le informazioni per caricare foto"}
        </p>
        <p className="text-sm text-slate-500 mt-1">Caricamento automatico su Firebase Storage e aggiornamento Firestore</p>
      </div>

      {/* Photo Grid Grid */}
      {property.images && property.images.length > 0 && (
        <div>
           <h4 className="text-sm font-bold text-slate-500 mb-3 uppercase">Galleria Attuale</h4>
           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {extractImages(property).map((img: string, idx: number) => {
                const isBlob = typeof img === 'string' && img.startsWith('blob:');
                const lightboxIdx = validLightboxImages.indexOf(img);
                
                return (
                <div 
                  key={idx} 
                  draggable={!isBlob}
                  onClick={() => {
                    if (isBlob) return;
                    if (lightboxIdx !== -1) onOpenLightbox(lightboxIdx);
                  }}
                  onDragStart={(e) => !isBlob && photos.onDragStart(e, img)}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    if (!isBlob) photos.onDragEnter(img);
                  }}
                  onDragEnd={photos.onDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className={cn(
                    "relative aspect-square rounded-xl overflow-hidden group border transition-all",
                    !isBlob ? "cursor-grab active:cursor-grabbing" : "opacity-60 cursor-not-allowed",
                    photos.dragOverUrl === img ? "border-primary border-4 scale-105 shadow-xl" : "border-slate-200"
                  )}
                >
                  <img 
                     src={img} 
                     alt="Immobile" 
                     className={cn("w-full h-full object-cover transition-transform pointer-events-none", !isBlob && "group-hover:scale-110")} 
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
                  {idx === 0 && !isBlob && (
                    <div className="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-sm pointer-events-none">
                      Principale
                    </div>
                  )}
                  <button onClick={(e) => photos.deletePhoto(e, img)} className="absolute top-2 right-2 h-7 w-7 bg-white/90 rounded-full flex items-center justify-center text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white">
                     <Trash2 className="h-4 w-4" />
                  </button>
                  {isBlob && (
                    <div className="absolute inset-0 bg-slate-900/20 flex items-center justify-center pointer-events-none">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
              )})}
              {photos.uploadingPreviews.map((preview: string, idx: number) => (
                <div key={`preview-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 opacity-60">
                  <img src={preview} alt="Uploading..." className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-slate-900/20 flex items-center justify-center pointer-events-none">
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  </div>
                </div>
              ))}
           </div>
        </div>
      )}
   </div>
                </div>

                {/* Card 8: Descrizione */}
                <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
   <div className="px-5 py-3 border-b border-border bg-slate-50/50 flex items-center gap-2">
     <Filter className="h-4 w-4 text-slate-500" />
     <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">7. Testi e Descrizioni</h3>
   </div>
   <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
     <div className="space-y-2">
       <label className="text-xs font-bold text-slate-500 uppercase">Descrizione Immobile (Pubblica)</label>
       <textarea 
         className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary font-medium min-h-[160px]"
         value={property.Textos?.Descrizione || ""}
         onChange={(e) => updateNested('Textos', 'Descrizione', e.target.value)}
       />
     </div>
     <div className="space-y-2">
       <label className="text-xs font-bold text-slate-500 uppercase text-rose-500">Note Riservate (Solo Agenzia)</label>
       <textarea 
         className="w-full px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 focus:border-rose-400 font-medium min-h-[160px] text-slate-700"
         value={property.Textos?.NoteInterne || ""}
         onChange={(e) => updateNested('Textos', 'NoteInterne', e.target.value)}
       />
     </div>
   </div>
                </div>

             </div>
  );
}
