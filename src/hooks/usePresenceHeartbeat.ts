"use client";

/**
 * Latido de presencia.
 *
 * Avisa al servidor de que esta persona sigue trabajando y en que pantalla.
 *
 * TRES DECISIONES QUE ABARATAN ESTO Y LO HACEN FIABLE:
 *
 * 1. SOLO CON LA PESTANA VISIBLE. Una pestana de fondo no escribe nada. En la
 *    practica la mitad del tiempo lo estan, asi que esto reduce a la mitad la
 *    mayor fuente de escrituras del plan.
 *
 * 2. sendBeacon AL CERRAR. Sin esto habria que esperar a que caducara el
 *    latido para ver a alguien desconectado, y el panel mostraria gente
 *    trabajando minuto y medio despues de haberse ido. sendBeacon es lo unico
 *    que el navegador garantiza enviar mientras la pagina se descarga: un
 *    fetch normal ahi se cancela.
 *
 * 3. pagehide Y NO beforeunload. beforeunload no se dispara de forma fiable en
 *    moviles ni cuando el navegador descarta la pestana; pagehide si.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const INTERVALO_MS = 45_000;
const RUTA = "/api/presence/heartbeat";

export function usePresenceHeartbeat(activo: boolean) {
  const pathname = usePathname();
  // La ruta se guarda en una ref para que el temporizador no tenga que
  // recrearse en cada navegacion: el intervalo sigue corriendo y lee el valor
  // actual cuando le toca latir.
  const rutaActual = useRef(pathname);
  rutaActual.current = pathname;

  useEffect(() => {
    if (!activo) return;

    let vivo = true;

    const latir = () => {
      if (!vivo || document.visibilityState !== "visible") return;
      fetch(RUTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPage: rutaActual.current }),
        keepalive: true,
      }).catch(() => {
        // La presencia es accesoria: si falla, no se le dice nada al usuario.
      });
    };

    latir();
    const temporizador = setInterval(latir, INTERVALO_MS);

    // Al volver a la pestana se late enseguida, sin esperar al siguiente turno.
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") latir();
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    const alSalir = () => {
      try {
        const cuerpo = new Blob([JSON.stringify({ offline: true })], {
          type: "application/json",
        });
        navigator.sendBeacon(RUTA, cuerpo);
      } catch {
        // Navegador sin sendBeacon: el latido caduca solo en 90 segundos.
      }
    };
    window.addEventListener("pagehide", alSalir);

    return () => {
      vivo = false;
      clearInterval(temporizador);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("pagehide", alSalir);
    };
  }, [activo]);
}
