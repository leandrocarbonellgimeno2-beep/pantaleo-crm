"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { compressImage } from '@/lib/immobili/imageCompression';

interface ConfirmRequest {
  title: string;
  message: string;
  danger: boolean;
}

interface UsePropertyImagesOptions {
  property: any;
  /** Aplica la nueva lista de fotos al inmueble en memoria. */
  onImagesChange: (images: string[]) => void;
  /** Revalida el listado tras persistir. */
  /** Recibe la lista ya persistida, para poder refrescar la tarjeta sin red. */
  onSaved: (images: string[]) => void;
  confirm: (opts: ConfirmRequest) => Promise<boolean>;
}

/**
 * Subida, borrado y reordenado de las fotos de un inmueble.
 *
 * Las mutaciones se hacen por URL, no por índice: la galería del formulario se
 * pinta desde extractImages(), que concatena los campos legacy, así que su
 * índice no corresponde al del array `images` que se muta.
 *
 * `imagesRef` mantiene la lista vigente. Sin él, onDrop calculaba la lista
 * final a partir de la instantánea capturada al empezar el drop: con dos
 * subidas solapadas, la segunda pisaba a la primera y se perdían fotos.
 */
export function usePropertyImages({
  property,
  onImagesChange,
  onSaved,
  confirm,
}: UsePropertyImagesOptions) {
  const [uploadingPreviews, setUploadingPreviews] = useState<string[]>([]);
  const [draggedUrl, setDraggedUrl] = useState<string | null>(null);
  const [dragOverUrl, setDragOverUrl] = useState<string | null>(null);

  const imagesRef = useRef<string[]>([]);
  useEffect(() => {
    imagesRef.current = property?.images || [];
  }, [property]);

  const propertyId = property?.id;

  /** Persiste la lista completa. Devuelve false si el backend falla. */
  const persist = useCallback(async (images: string[]): Promise<boolean> => {
    try {
      const res = await fetch('/api/immobili', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: propertyId, images }),
      });
      if (!res.ok) throw new Error('Errore backend');
      onSaved(images);
      return true;
    } catch (err) {
      console.error('[immobili] errore salvataggio foto', err);
      return false;
    }
  }, [propertyId, onSaved]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!property || acceptedFiles.length === 0) return;
    const previews = acceptedFiles.map(file => URL.createObjectURL(file));
    setUploadingPreviews(prev => [...prev, ...previews]);

    try {
      const results = await Promise.all(acceptedFiles.map(async (file) => {
        try {
          const compressedBlob = await compressImage(file);
          const formData = new FormData();
          formData.append('file', compressedBlob, file.name.replace(/\.[^/.]+$/, '.webp'));
          formData.append(
            'path',
            `immobili/${property.DatiBase?.Codice}/foto/FotoN_${Date.now()}_${file.name.replace(/\.[^/.]+$/, '')}.webp`,
          );
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          const data = await res.json();
          if (res.ok && data.url) return data.url as string;
          console.error('Errore caricamento foto dal server', data);
          return null;
        } catch (err) {
          console.error('Errore compr./upload', err);
          return null;
        }
      }));

      const successfulUrls = results.filter((url): url is string => url !== null);
      if (successfulUrls.length === 0) {
        toast.error('Nessuna foto caricata. Riprova.');
        return;
      }

      // Desde la lista VIGENTE, no desde la capturada al empezar el drop.
      const finalImages = [...imagesRef.current, ...successfulUrls];
      imagesRef.current = finalImages;
      onImagesChange(finalImages);
      await persist(finalImages);
    } catch (err) {
      console.error('Errore onDrop', err);
      toast.error('Errore durante il caricamento. Riprova.');
    } finally {
      setUploadingPreviews(prev => prev.filter(p => !previews.includes(p)));
      previews.forEach(p => URL.revokeObjectURL(p));
    }
  }, [property, onImagesChange, persist]);

  const deletePhoto = async (e: React.MouseEvent, urlToDelete: string) => {
    e.stopPropagation();

    const currentImages = imagesRef.current;
    if (!currentImages.includes(urlToDelete)) {
      toast.error('Questa foto proviene da un campo legacy e non può essere rimossa da qui.');
      return;
    }

    const ok = await confirm({
      title: 'Eliminare la foto?',
      message: "La foto verrà rimossa definitivamente dall'immobile.",
      danger: true,
    });
    if (!ok) return;

    const newImages = currentImages.filter(url => url !== urlToDelete);
    imagesRef.current = newImages;
    onImagesChange(newImages);

    if (!(await persist(newImages))) {
      toast.error("Errore durante l'eliminazione della foto.");
      imagesRef.current = currentImages;
      onImagesChange(currentImages);
      return;
    }

    // Solo se borra de Storage cuando Firestore ya no la referencia.
    await fetch('/api/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlToDelete }),
    });
  };

  const onDragStart = (e: React.DragEvent, url: string) => {
    setDraggedUrl(url);
    // Needed for Firefox
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.outerHTML);
  };

  const onDragEnter = (url: string) => setDragOverUrl(url);

  const onDragEnd = async () => {
    const resetDrag = () => { setDraggedUrl(null); setDragOverUrl(null); };
    if (!draggedUrl || !dragOverUrl || draggedUrl === dragOverUrl) {
      resetDrag();
      return;
    }

    const newImages = [...imagesRef.current];
    const from = newImages.indexOf(draggedUrl);
    const to = newImages.indexOf(dragOverUrl);
    if (from === -1 || to === -1) {
      toast.error('Una delle foto proviene da un campo legacy: impossibile riordinare da qui.');
      resetDrag();
      return;
    }

    newImages.splice(from, 1);
    newImages.splice(to, 0, draggedUrl);
    imagesRef.current = newImages;
    onImagesChange(newImages);
    resetDrag();

    if (!(await persist(newImages))) {
      toast.error('Errore nel salvataggio del nuovo ordine.');
    }
  };

  return {
    uploadingPreviews,
    dragOverUrl,
    onDrop,
    deletePhoto,
    onDragStart,
    onDragEnter,
    onDragEnd,
  };
}
