/**
 * useClienti — SWR hook for client fetch
 * When only one operation type is active (vendita/affitto), pushes the filter
 * to the server to avoid loading the full collection. When both or neither
 * filter is active, loads all and filters client-side via useMemo in page.tsx.
 */
import useSWR from 'swr';

interface ClientiResponse {
  data: any[];
  totalCount: number;
}

interface UseClientiParams {
  tipo?: 'vendita' | 'affitto' | null;
}

const fetcher = async (url: string): Promise<ClientiResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  const arr = Array.isArray(json) ? json : (json.data || []);
  return { data: arr, totalCount: arr.length };
};

function buildUrl(tipo?: 'vendita' | 'affitto' | null): string {
  if (!tipo) return '/api/clienti';
  return `/api/clienti?tipo=${tipo}`;
}

export function useClienti(params?: UseClientiParams) {
  const tipo = params?.tipo ?? null;
  const url = buildUrl(tipo);

  const { data, error, isLoading, isValidating, mutate } = useSWR<ClientiResponse>(
    url,
    fetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
      errorRetryCount: 2,
    }
  );

  return {
    clienti: data?.data || [],
    totalCount: data?.totalCount || 0,
    loading: isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
  };
}
