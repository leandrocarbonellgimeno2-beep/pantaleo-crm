"use client";

/**
 * AuthContext — fetches /api/auth/session UNA VOLTA per sessione browser e
 * lo condivide a tutti i componenti (Sidebar, pagine, ecc).
 *
 * Sostituisce il pattern precedente in cui ogni montaggio di Sidebar / pagina
 * faceva il proprio fetch di sessione. Risultato: -1 richiesta per ogni
 * navigazione.
 *
 * SWR ci dà già dedup + revalidate-on-focus disattivato → la sessione resta
 * stabile per tutta la durata della pagina.
 */

import { createContext, useContext, ReactNode } from "react";
import useSWR from "swr";

export interface SessionUser {
  email?: string;
  nome?: string;
  ruolo?: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  /** Forza refetch della sessione (es. dopo logout/login). */
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: () => {},
});

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`session fetch failed: ${res.status}`);
  return res.json();
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR<SessionUser>(
    "/api/auth/session",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000, // riusa la stessa risposta per 60s in tutti i componenti
      shouldRetryOnError: false,
    },
  );

  return (
    <AuthContext.Provider
      value={{
        user: error ? null : data || null,
        loading: isLoading,
        refresh: () => mutate(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
