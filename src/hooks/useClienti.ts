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
      // Alineado con useImmobili y useProprietari. Volver a la pestana
      // revalidaba la lista entera de clientes: sin ?limit=, /api/clienti
      // devuelve la coleccion proyectada completa, de modo que cada foco
      // costaba del orden de 453 lecturas de Firestore.
      //
      // Lo que sigue refrescando la lista: el montaje de la pagina, cambiar
      // el filtro vendita/affitto (cambia la clave SWR), reconectar la red, y
      // el refresh() manual que ya se llama tras guardar y tras borrar.
      // Queda un hueco reconocido: un cliente creado desde otra pestana no
      // aparece hasta alguna de esas cuatro cosas.
      revalidateOnFocus: false,
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
