/**
 * useProprietari — SWR hook for full-catalogue owner fetch
 * Same architecture as useImmobili: fetch all, filter client-side
 */
import useSWR from 'swr';

interface ProprietariResponse {
  data: any[];
  totalCount: number;
}

const fetcher = async (url: string): Promise<ProprietariResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  // API returns array directly
  const arr = Array.isArray(json) ? json : (json.data || []);
  return { data: arr, totalCount: arr.length };
};

export function useProprietari() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<ProprietariResponse>(
    '/api/proprietari',
    fetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      errorRetryCount: 2,
    }
  );

  return {
    proprietari: data?.data || [],
    totalCount: data?.totalCount || 0,
    loading: isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
  };
}
