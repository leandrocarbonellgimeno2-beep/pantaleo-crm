/**
 * useImmobili — SWR hook for full-catalogue fetch
 * 
 * Architecture:
 * - Fetches ALL properties in one shot (status + type + text search only)
 * - Advanced filtering happens client-side via useMemo in page.tsx
 * - Visual pagination (slice) happens in page.tsx
 * - Changing filters = ZERO network requests
 */

import useSWR from 'swr';

interface ImmobiliParams {
  searchTerm: string;
  filterStato: 'Attivi' | 'Sospesi' | 'Tutti';
  filterType: 'Tutti' | 'Vendita' | 'Affitto';
  codice?: string;
}

interface ImmobiliResponse {
  data: any[];
  totalCount: number;
}

// Abort any in-flight request when filters change before the previous fetch resolves
let activeController: AbortController | null = null;

const fetcher = async (url: string): Promise<ImmobiliResponse> => {
  activeController?.abort();
  activeController = new AbortController();
  try {
    const res = await fetch(url, { signal: activeController.signal });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    const raw: any[] = Array.isArray(json.data) ? json.data : [];

    // Defensive sort: highest Codice always first, regardless of server order
    raw.sort((a, b) => Number(b.DatiBase?.Codice ?? 0) - Number(a.DatiBase?.Codice ?? 0));

    return {
      data: raw,
      totalCount: json.totalCount ?? raw.length ?? 0,
    };
  } catch (e: any) {
    if (e.name === 'AbortError') throw e; // SWR discards aborted fetches
    throw e;
  }
};

function buildUrl(params: ImmobiliParams): string {
  const sp = new URLSearchParams();

  if (params.filterStato === 'Attivi') sp.set('status', 'attivi');
  else if (params.filterStato === 'Sospesi') sp.set('status', 'sospesi');
  else sp.set('status', 'tutti');

  if (params.filterType === 'Vendita') sp.set('type', 'vendita');
  else if (params.filterType === 'Affitto') sp.set('type', 'affitto');
  else sp.set('type', 'tutti');

  const trimmed = params.searchTerm.trim();
  const exactCode = params.codice || (trimmed && /^\d+$/.test(trimmed) ? trimmed : '');

  if (exactCode) {
    sp.set('codice', exactCode);
  } else if (trimmed) {
    sp.set('q', trimmed);
  }

  return `/api/immobili?${sp.toString()}`;
}

export function useImmobili(params: ImmobiliParams) {
  const url = buildUrl(params);

  const { data, error, isLoading, isValidating, mutate } = useSWR<ImmobiliResponse>(
    url,
    fetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      errorRetryCount: 2,
    }
  );

  return {
    /** Full catalogue (all properties matching status/type/search) */
    immobiliData: data?.data || [],
    totalCount: data?.totalCount || 0,
    loading: isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
  };
}
