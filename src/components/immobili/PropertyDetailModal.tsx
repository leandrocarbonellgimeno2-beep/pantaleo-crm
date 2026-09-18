"use client";

import type { DropzoneRootProps, DropzoneInputProps } from "react-dropzone";
import { Home, Loader2, FileText, Printer, MessageCircle, Zap, X, Trash2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractImageUrls as extractImages } from "@/lib/imageUtils";
import { Button } from "@/components/ui/Button";
import { buildPropertyWhatsAppMessage, openWhatsApp } from "@/lib/immobili/whatsapp";
import { PropertyDetailView } from "@/components/immobili/PropertyDetailView";
import { PropertyEditForm } from "@/components/immobili/PropertyEditForm";

interface PropertyDetailModalProps {
  /** Objeto completo de usePropertyDetail. */
  detail: any;
  /** Objeto completo de usePropertyImages. */
  photos: any;
  /** Objeto completo de useIdealistaActions. */
  idealista: any;
  /** Objeto completo de useInverseMatching. */
  inverse: any;
  dropzone: {
    getRootProps: () => DropzoneRootProps;
    getInputProps: () => DropzoneInputProps;
    isDragActive: boolean;
  };
  onOpenLightbox: (index: number) => void;
  onSelectCliente: (cliente: any) => void;
  onWhatsAppCliente: (cliente: any) => void;
  onFileUpload: (
    e: React.ChangeEvent<HTMLInputElement>,
    pathPrefix: string,
    category: string,
    field: string,
  ) => void;
  onGenerateScheda: () => void;
  onOpenPrintSelector: () => void;
}

/**
 * Modal de la ficha de un inmueble: cabecera con acciones (Scheda PDF,
 * cartello, WhatsApp, Idealista, Modifica), cuerpo en modo lectura o edicion,
 * y pie con guardar y eliminar.
 *
 * Recibe los hooks completos en lugar de treinta props sueltas: el modal es el
 * unico consumidor de todos ellos y la frontera natural es el hook entero. Se
 * desestructuran dentro con los mismos nombres que tenian en la pagina, de
 * modo que el JSX se movio sin tocar ni una linea.
 */
export function PropertyDetailModal({
  detail,
  photos,
  idealista,
  inverse,
  dropzone,
  onOpenLightbox,
  onSelectCliente,
  onWhatsAppCliente,
  onFileUpload,
  onGenerateScheda,
  onOpenPrintSelector,
}: PropertyDetailModalProps) {
  const {
    selectedProperty,
    viewMode, setViewMode,
    isSaving,
    ownerData, ownerProperties, setShowOwnerPropsModal,
    isLoadingDetail, detailError,
    isMapOpen, setIsMapOpen,
    setIsModalOpen,
    isSchedaGenerating,
    updateNested, validLightboxImages,
    saveProperty: handleSaveProperty,
    startDelete: handleDeleteProperty,
  } = detail;
  const { getRootProps, getInputProps, isDragActive } = dropzone;

  // Alias para que el JSX movido no cambie.
  const handleFileUpload = onFileUpload;
  const openLightboxOnSource = onOpenLightbox;
  const setSelectedClienteModal = onSelectCliente;
  const handleInverseWhatsApp = onWhatsAppCliente;
  const handleGenerateScheda = onGenerateScheda;
  const handleOpenPrintSelector = onOpenPrintSelector;
  const getIdealistaStatus = () => selectedProperty?.Idealista?.idealistaStatus || 'none';

  return (
    <div className="fixed inset-0 z-50 flex flex-col p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 print:bg-white print:p-0">
       {/* Modal Container */}
       <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col overflow-hidden bg-slate-50 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 print:shadow-none print:bg-white print:w-full print:max-w-none print:h-auto print:overflow-visible">
         
         {/* Header */}
         <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white sticky top-0 z-10 print:hidden">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <Home className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800">{viewMode ? "Dettaglio Immobile" : "Scheda Immobile"}</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">{viewMode ? "Anteprima" : "Modifica e Gestione"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {viewMode && (
                <div className="flex items-center gap-3 print:hidden">
                  {/* ═══ SCHEDA TECNICA PDF ═══ */}
                  <button
                    disabled={isSchedaGenerating}
                    onClick={handleGenerateScheda}
                    className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition-all hover:bg-indigo-700 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSchedaGenerating
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generazione...</>
                      : <><FileText className="h-4 w-4 mr-2" />Scheda PDF</>
                    }
                  </button>

                  <button
                    onClick={handleOpenPrintSelector}
                    className="inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 px-5 py-2 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 shadow-sm"
                  >
                    <Printer className="h-4 w-4 mr-2" /> Stampa Cartello
                  </button>

                  {/* ═══ WHATSAPP SHARE ═══ */}
                  <button
                    onClick={() => openWhatsApp(
                      null,
                      buildPropertyWhatsAppMessage(selectedProperty, 'share'),
                    )}
                    className="inline-flex items-center justify-center rounded-xl bg-[#25D366] px-5 py-2 text-sm font-bold text-white transition-all hover:bg-[#1da851] shadow-sm shadow-emerald-500/25"
                  >
                    <MessageCircle className="h-4 w-4 mr-2 fill-current" /> WhatsApp
                  </button>

                  {/* ═══ IDEALISTA BUTTONS ═══ */}
                  {selectedProperty.id && (() => {
                    const status = getIdealistaStatus();
                    return (
                      <div className="flex items-center gap-2">
                        {status === 'none' || status === 'error' ? (
                          <button
                            onClick={idealista.publish}
                            disabled={idealista.loading}
                            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 text-sm font-bold text-white transition-all hover:from-green-600 hover:to-emerald-700 shadow-sm shadow-emerald-500/25 disabled:opacity-50"
                          >
                            {idealista.loading && idealista.action === 'publish' ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Zap className="h-4 w-4 mr-2" />
                            )}
                            {idealista.loading && idealista.action === 'publish' ? 'Pubblicando...' : 'Pubblica su Idealista'}
                          </button>
                        ) : status === 'active' ? (
                          <>
                            <button
                              onClick={idealista.update}
                              disabled={idealista.loading}
                              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2 text-sm font-bold text-white transition-all hover:from-blue-600 hover:to-indigo-700 shadow-sm shadow-blue-500/25 disabled:opacity-50"
                            >
                              {idealista.loading && idealista.action === 'update' ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Zap className="h-4 w-4 mr-2" />
                              )}
                              Aggiorna su Idealista
                            </button>
                            <button
                              onClick={idealista.deactivate}
                              disabled={idealista.loading}
                              className="inline-flex items-center justify-center rounded-xl border border-rose-200 px-3 py-2 text-sm font-bold text-rose-600 transition-all hover:bg-rose-50 disabled:opacity-50"
                              title="Rimuovi da Idealista"
                            >
                              {idealista.loading && idealista.action === 'deactivate' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        ) : status === 'deactivated' ? (
                          <button
                            onClick={idealista.activate}
                            disabled={idealista.loading}
                            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2 text-sm font-bold text-white transition-all hover:from-amber-600 hover:to-orange-700 shadow-sm shadow-amber-500/25 disabled:opacity-50"
                          >
                            {idealista.loading && idealista.action === 'activate' ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Zap className="h-4 w-4 mr-2" />
                            )}
                            Riattiva su Idealista
                          </button>
                        ) : null}
                        {/* Status indicator dot */}
                        <span className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          status === 'active' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' :
                          status === 'deactivated' ? 'bg-amber-500' :
                          status === 'error' ? 'bg-rose-500 animate-pulse' :
                          'bg-slate-300'
                        )} title={`Idealista: ${status}`} />
                      </div>
                    );
                  })()}

                  <button 
                    onClick={() => setViewMode(false)}
                    className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 shadow-sm"
                  >
                    Modifica
                  </button>
                </div>
              )}
              <button onClick={() => setIsModalOpen(false)} className="h-10 w-10 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
         </div>

         {/* Scrolling Content - Switchable Views */}
         <div className="flex-1 overflow-y-auto p-0 md:p-6 bg-slate-50 print:hidden">
           {viewMode ? (
             <PropertyDetailView
               property={selectedProperty}
               ownerData={ownerData}
               ownerProperties={ownerProperties}
               isLoadingDetail={isLoadingDetail}
               detailError={detailError}
               onShowOwnerProperties={() => setShowOwnerPropsModal(true)}
               onOpenLightbox={openLightboxOnSource}
               inverse={inverse}
               onSelectCliente={setSelectedClienteModal}
               onWhatsAppCliente={handleInverseWhatsApp}
             />
           ) : (
              <PropertyEditForm
                property={selectedProperty}
                updateNested={updateNested}
                onFileUpload={handleFileUpload}
                photos={photos}
                getRootProps={getRootProps}
                getInputProps={getInputProps}
                isDragActive={isDragActive}
                onOpenLightbox={openLightboxOnSource}
                validLightboxImages={validLightboxImages}
                ownerData={ownerData}
                isMapOpen={isMapOpen}
                setIsMapOpen={setIsMapOpen}
              />
         )}

         </div>

         {/* Footer Modal Sticky */}
         {!viewMode && (
         <div className="px-6 py-4 border-t border-border bg-slate-50 flex items-center justify-between sticky bottom-0 z-10">
            <button 
              onClick={() => {
                 if(selectedProperty.id) {
                    handleDeleteProperty();
                 } else {
                    setIsModalOpen(false);
                 }
              }}
              className="flex items-center text-sm font-bold text-rose-500 hover:text-rose-600 transition-colors"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {selectedProperty.id ? "Elimina Immobile" : "Cancella Creazione"}
            </button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Chiudi
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveProperty}
                loading={isSaving}
                icon={<Save className="h-4 w-4" />}
              >
                Salva Informazioni
              </Button>
            </div>
         </div>
         )}


       </div>
    </div>
  );
}
