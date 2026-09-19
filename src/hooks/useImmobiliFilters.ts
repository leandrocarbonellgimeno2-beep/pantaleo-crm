"use client";

import { useEffect, useMemo, useState } from 'react';
import { useImmobili } from '@/hooks/useImmobili';
import { useDebounce } from '@/hooks/useDebounce';
import {
  type AdvFilters,
  applyAdvancedFilters,
  countActiveFilters,
  createEmptyAdvFilters,
  NON_RESIDENTIAL_TYPES,
} from '@/lib/immobili/filters';

const PAGE_SIZE = 15;

/**
 * Búsqueda, filtros, carga del catálogo y paginación visual del listado.
 *
 * El servidor solo recibe estado, tipo, búsqueda y código; los filtros
 * avanzados y la paginación son enteramente de cliente, y por eso "cargar
 * más" no genera tráfico.
 */
export function useImmobiliFilters() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'Tutti' | 'Vendita' | 'Affitto'>('Tutti');
  const [filterStato, setFilterStato] = useState<'Attivi' | 'Sospesi' | 'Tutti'>('Attivi');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [advFilters, setAdvFilters] = useState<AdvFilters>(createEmptyAdvFilters);
  const resetAdvFilters = () => setAdvFilters(createEmptyAdvFilters());

  // Las tipologías no residenciales no tienen camere, bagni ni superficie:
  // al elegirlas se limpian esos filtros para no dejar criterios imposibles.
  useEffect(() => {
    if (NON_RESIDENTIAL_TYPES.includes(advFilters.tipologia)) {
      setAdvFilters(p => ({ ...p, camereMin: '', bagniMin: '', superficieMin: '', superficieMax: '' }));
    }
  }, [advFilters.tipologia]);

  // El input responde al instante; el filtrado espera 300 ms.
  const debouncedSearch = useDebounce(searchTerm, 300);
  // El codigo TAMBIEN, y le faltaba. Entra en la clave de SWR igual que la
  // busqueda de texto, asi que escribir «10047» disparaba cinco peticiones a
  // /api/immobili y cuatro abortos del AbortController. El cuidado que se puso
  // con searchTerm no se habia extendido aqui.
  const debouncedCodice = useDebounce(advFilters.codice.trim(), 300);

  const {
    immobiliData,
    totalCount,
    loading,
    isValidating,
    refresh,
    cambiarEstadoLocal,
    quitarLocal,
    fusionarLocal,
  } = useImmobili({
    searchTerm: debouncedSearch,
    filterStato,
    filterType,
    codice: debouncedCodice,
  });

  // true cuando cambió un filtro y SWR está trayendo datos nuevos mientras aún
  // sirve los anteriores. Sirve para ocultar la lista vieja en vez de enseñar
  // resultados que ya no corresponden.
  const isFilterTransitioning = isValidating && !loading;

  const filteredImmobili = useMemo(
    () => applyAdvancedFilters(immobiliData, advFilters),
    [immobiliData, advFilters],
  );
  const activeFilterCount = useMemo(() => countActiveFilters(advFilters), [advFilters]);
  const hasActiveSearch = searchTerm.trim() !== '' || activeFilterCount > 0;

  // Paginación visual: se pintan de 15 en 15, sin red.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, filterStato, filterType, advFilters]);

  const displayedCount = Math.min(visibleCount, filteredImmobili.length);
  const remaining = Math.max(0, filteredImmobili.length - visibleCount);
  const showMore = () => setVisibleCount(c => c + PAGE_SIZE);

  return {
    searchTerm, setSearchTerm,
    filterType, setFilterType,
    filterStato, setFilterStato,
    isFilterOpen, setIsFilterOpen,
    advFilters, setAdvFilters, resetAdvFilters,
    filteredImmobili, activeFilterCount, hasActiveSearch,
    totalCount, loading, isFilterTransitioning, refresh,
    cambiarEstadoLocal, quitarLocal, fusionarLocal,
    visibleCount, setVisibleCount, displayedCount, remaining, showMore,
    PAGE_SIZE,
  };
}
