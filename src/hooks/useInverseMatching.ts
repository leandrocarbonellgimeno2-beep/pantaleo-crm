"use client";

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * Matching inverso: dado un inmueble, busca clientes compatibles.
 *
 * El estado se reinicia cuando cambia el inmueble. Antes no lo hacía, y desde
 * el modal de "otras propiedades del propietario" se podía saltar de un
 * inmueble a otro dejando a la vista los matches del anterior.
 */
export function useInverseMatching(property: any) {
  const propertyId = property?.id;

  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const reset = useCallback(() => {
    setMatches([]);
    setPage(0);
    setTotal(0);
    setHasMore(false);
    setExpanded(null);
    setOpen(false);
  }, []);

  // Al cambiar de inmueble, los resultados anteriores dejan de ser válidos.
  useEffect(() => {
    reset();
  }, [propertyId, reset]);

  const run = async (nextPage = 0) => {
    if (!propertyId) return;
    if (nextPage === 0) {
      setLoading(true);
      setMatches([]);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await fetch('/api/match-inverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immobile: property, page: nextPage }),
      });
      const json = await res.json();
      setMatches(prev => (nextPage === 0 ? (json.matches || []) : [...prev, ...(json.matches || [])]));
      setTotal(json.total || 0);
      setHasMore(json.hasMore || false);
      setPage(nextPage);
    } catch (e: any) {
      toast.error(`Errore nella ricerca dei clienti: ${e.message}`);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  return {
    matches, loading, loadingMore, page, total, hasMore,
    expanded, setExpanded,
    open, setOpen,
    run, reset,
  };
}
