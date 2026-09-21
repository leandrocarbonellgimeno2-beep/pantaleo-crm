"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createEmptyProperty } from '@/lib/immobili/emptyProperty';
import { mensajeDeFallo, esSesionCaducada } from '@/lib/errores-http';

const DELETE_GUARD_SECONDS = 2;

interface UsePropertyDetailOptions {
  /**
   * Relectura completa del listado. Se reserva para el ALTA: un inmueble nuevo
   * llega con campos que calcula el listado (thumbnail, imageCount) y con el
   * codigo definitivo del contador atomico, asi que insertarlo a mano seria
   * adivinar. Dar de alta es ademas poco frecuente.
   */
  refresh: () => void;
  /** Mete la version editada en el listado sin volver a la red. */
  fusionarLocal: (doc: any) => void;
  /** Quita del listado el inmueble borrado sin volver a la red. */
  quitarLocal: (id: string) => () => void;
}

/**
 * Estado y acciones de la ficha de un inmueble: apertura, carga diferida del
 * documento completo y del propietario, guardado, alta y borrado con
 * guardarraíl.
 *
 * Los handlers van en useCallback porque llegan como props a componentes
 * memoizados: recrearlos en cada render anularía el memo.
 */
export function usePropertyDetail({ refresh, fusionarLocal, quitarLocal }: UsePropertyDetailOptions) {
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ownerData, setOwnerData] = useState<any>(null);
  const [ownerProperties, setOwnerProperties] = useState<any[]>([]);
  const [showOwnerPropsModal, setShowOwnerPropsModal] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);

  // Guardarraíl de borrado
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteTimer, setDeleteTimer] = useState(DELETE_GUARD_SECONDS);
  const deleteIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!deleteModalOpen && deleteIntervalRef.current) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
  }, [deleteModalOpen]);

  // También al desmontar: salir de la pantalla con el modal abierto dejaba el
  // intervalo corriendo contra un componente que ya no existe.
  useEffect(() => () => {
    if (deleteIntervalRef.current) clearInterval(deleteIntervalRef.current);
  }, []);

  const openDetail = useCallback(async (property: any) => {
    setSelectedProperty({ ...property });
    setIsModalOpen(true);
    setViewMode(true);
    setOwnerData(null);
    setOwnerProperties([]);
    setShowOwnerPropsModal(false);
    setIsLoadingDetail(true);
    setDetailError(null);

    const fetches: Promise<any>[] = [
      fetch(`/api/immobili?id=${property.id}`).then(r => r.json()),
    ];

    if (property.proprietarioId) {
      fetches.push(
        fetch(`/api/proprietari?id=${property.proprietarioId}`).then(r => r.json()),
        fetch(`/api/immobili?proprietarioId=${property.proprietarioId}&limit=50`).then(r => r.json()),
      );
    }

    try {
      const results = await Promise.all(fetches);
      const fullProperty = results[0];

      if (fullProperty && !fullProperty.error) {
        // Guard por id: si el usuario cerró este inmueble y abrió otro mientras
        // la petición volaba, injertar aquí mezclaría los datos de los dos.
        setSelectedProperty((prev: any) =>
          prev?.id === property.id ? { ...prev, ...fullProperty } : prev,
        );
      } else if (fullProperty?.error) {
        console.error('[Detail fetch] API returned error for id', property.id, '->', fullProperty.error);
        setDetailError(fullProperty.error);
      }

      if (property.proprietarioId && results[1]) {
        setOwnerData(results[1].error ? null : results[1]);
      }
      if (property.proprietarioId && results[2]) {
        const allOwnerProps = results[2].data || results[2] || [];
        const otherProps = (Array.isArray(allOwnerProps) ? allOwnerProps : [])
          .filter((p: any) => p.id !== property.id);
        setOwnerProperties(otherProps);
      }
    } catch (error: any) {
      console.error('[Detail fetch] Network/parse error for id', property.id, '->', error);
      setDetailError('Errore di rete durante il caricamento dei dettagli.');
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const createNew = useCallback((ownerId?: string) => {
    setSelectedProperty(createEmptyProperty(ownerId));
    setOwnerData(null);
    setIsModalOpen(true);
    setViewMode(false);

    if (ownerId) {
      fetch(`/api/proprietari?id=${ownerId}`)
        .then(res => res.json())
        .then(data => { if (!data.error) setOwnerData(data); })
        .catch(console.error);
    }
  }, []);

  const saveProperty = useCallback(async () => {
    if (!selectedProperty) return;
    setIsSaving(true);
    try {
      if (selectedProperty.id) {
        const res = await fetch('/api/immobili', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedProperty),
        });
        if (res.ok) {
          // La ficha editada se mete en el listado tal cual, sin releer los 631
          // documentos. fusionarEnCatalogo se encarga ademas de quitarla si la
          // edicion la saco de la vista: guardar con «Sospeso» desde la pestaña
          // «Attivi» tiene que hacerla desaparecer de la lista, no dejarla ahi
          // con una insignia que contradice al filtro.
          fusionarLocal(selectedProperty);
          setIsModalOpen(false);
        } else {
          // Con la sesion caducada esto decia «Errore durante il salvataggio»,
          // el agente lo leia como un fallo pasajero y volvia a pulsar Salva
          // sin que ningun intento pudiera funcionar.
          toast.error(mensajeDeFallo(res, 'Errore durante il salvataggio delle modifiche.'), {
            duration: esSesionCaducada(res) ? 12_000 : 5_000,
          });
        }
      } else {
        const res = await fetch('/api/immobili', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedProperty),
        });
        if (res.ok) {
          const newDoc = await res.json();
          // El servidor devuelve el Codice definitivo del contador atómico.
          setSelectedProperty({
            ...selectedProperty,
            id: newDoc.id,
            DatiBase: {
              ...selectedProperty.DatiBase,
              Codice: newDoc.codice || selectedProperty.DatiBase?.Codice,
            },
          });
          refresh();
          setIsModalOpen(false);
        } else {
          toast.error(mensajeDeFallo(res, 'Errore durante la creazione dell immobile.'), {
            duration: esSesionCaducada(res) ? 12_000 : 5_000,
          });
        }
      }
    } catch (error) {
      console.error('Error saving property:', error);
      toast.error('Errore di rete durante il salvataggio.');
    } finally {
      setIsSaving(false);
    }
  }, [selectedProperty, refresh, fusionarLocal]);

  /** Abre el modal de borrado y arranca la cuenta atrás del guardarraíl. */
  const startDelete = useCallback(() => {
    if (!selectedProperty?.id) return;
    setDeleteModalOpen(true);
    setDeleteConfirmed(false);
    setDeleteTimer(DELETE_GUARD_SECONDS);

    if (deleteIntervalRef.current) clearInterval(deleteIntervalRef.current);
    deleteIntervalRef.current = setInterval(() => {
      setDeleteTimer((prev) => {
        if (prev <= 1) {
          if (deleteIntervalRef.current) clearInterval(deleteIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [selectedProperty?.id]);

  const executeDelete = useCallback(async () => {
    if (!selectedProperty?.id) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/immobili?id=${selectedProperty.id}`, { method: 'DELETE' });
      if (res.ok) {
        // El documento ya no esta: quitarlo del array es trivialmente correcto y
        // ahorra la relectura completa del catalogo.
        quitarLocal(selectedProperty.id);
        setIsModalOpen(false);
        setDeleteModalOpen(false);
        toast.success('Immobile eliminato correttamente');
      } else {
        const errorData = await res.json();
        toast.error(`Errore durante l eliminazione: ${errorData.error}`);
        setDeleteModalOpen(false);
      }
    } catch (error) {
      console.error('Error deleting property:', error);
      toast.error('Errore di rete durante l eliminazione.');
      setDeleteModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  }, [selectedProperty?.id, quitarLocal]);

  const updateNested = useCallback((category: string, field: string, value: any) => {
    setSelectedProperty((prev: any) => ({
      ...prev,
      [category]: { ...(prev[category] || {}), [field]: value },
    }));
  }, []);

  /** Solo las URLs http sirven para el visor a pantalla completa. */
  const validLightboxImages: string[] =
    selectedProperty?.images?.filter((url: string) => typeof url === 'string' && url.startsWith('http')) || [];

  // Apertura automática desde los parámetros de la URL (?id / ?new / ?proprietarioId).
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current || typeof window === 'undefined') return;
    bootstrappedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('id');
    const isNew = params.get('new');
    const propId = params.get('proprietarioId');

    if (urlId) {
      fetch(`/api/immobili?id=${urlId}`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            openDetail(data);
            window.history.replaceState({}, '', '/immobili');
          }
        })
        .catch(console.error);
    } else if (isNew === 'true') {
      createNew(propId || undefined);
      window.history.replaceState({}, '', '/immobili');
    }
  }, [openDetail, createNew]);

  return {
    selectedProperty, setSelectedProperty,
    isLoadingDetail, detailError,
    isModalOpen, setIsModalOpen,
    viewMode, setViewMode,
    isSaving,
    ownerData,
    ownerProperties, showOwnerPropsModal, setShowOwnerPropsModal,
    isMapOpen, setIsMapOpen,
    deleteModalOpen, setDeleteModalOpen,
    deleteConfirmed, setDeleteConfirmed,
    deleteTimer,
    openDetail, createNew, saveProperty, startDelete, executeDelete,
    updateNested, validLightboxImages,
  };
}
