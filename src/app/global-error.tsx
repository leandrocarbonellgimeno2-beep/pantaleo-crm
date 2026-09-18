"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Límite de error raíz.
 *
 * Cubre el caso que `error.tsx` no puede cubrir: un fallo dentro del propio
 * layout raíz (AuthProvider, ConfirmProvider o AuthenticatedLayout). Cuando eso
 * ocurre, Next descarta el layout entero y monta este componente en su lugar,
 * por lo que tiene que aportar sus propias etiquetas <html> y <body>.
 *
 * Va con estilos EN LÍNEA a propósito: `globals.css` se importa desde el layout
 * raíz, que es justamente lo que ha fallado, así que no se puede dar Tailwind
 * por disponible. Un aviso de error que depende de la hoja de estilos rota es
 * un aviso que no se ve.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          background: "#f8fafc",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          color: "#1e293b",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            background: "#fff",
            border: "1px solid #f1f5f9",
            borderRadius: "24px",
            padding: "32px",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              margin: "0 auto 24px",
              borderRadius: "9999px",
              background: "#fff1f2",
              color: "#f43f5e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "30px",
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            !
          </div>

          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>
            Errore critico
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              color: "#64748b",
              fontWeight: 500,
              lineHeight: 1.6,
            }}
          >
            L&apos;applicazione non è riuscita ad avviarsi. I tuoi dati non sono
            stati modificati.
          </p>

          {error.digest && (
            <p
              style={{
                margin: "16px 0 0",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "11px",
                letterSpacing: "0.05em",
                color: "#94a3b8",
              }}
            >
              Rif. errore: {error.digest}
            </p>
          )}

          <button
            onClick={reset}
            style={{
              marginTop: "32px",
              width: "100%",
              padding: "14px 20px",
              border: "none",
              borderRadius: "12px",
              background: "#4f46e5",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Riprova
          </button>
        </div>
      </body>
    </html>
  );
}
