"use client";

import { useEffect, useState, useRef } from "react";
import { MapPin, Loader2, MapPinOff } from "lucide-react";

// Cache di geocodifica per evitare richieste duplicate a Nominatim
const geocodeCache: Record<string, { lat: number; lng: number } | null> = {};

interface PropertyMapProps {
  indirizzo?: string;
  citta?: string;
  zona?: string;
}

export default function PropertyMap({ indirizzo, citta, zona }: PropertyMapProps) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // Geocodifica con Nominatim (OpenStreetMap) — Contesto regionale: Sicilia
  useEffect(() => {
    if (!citta && !indirizzo) {
      setError("Nessun indirizzo disponibile per la mappa.");
      setLoading(false);
      return;
    }

    // Costruire query con contesto regionale forzato (Sicilia, Provincia di Trapani)
    // Il 100% degli immobili dell'agenzia è in Sicilia, ~90% a Marsala
    const cittaEffettiva = citta || "Marsala";
    const queryParts = [indirizzo, zona, cittaEffettiva, "Sicilia", "Italia"].filter(Boolean);
    const query = queryParts.join(", ");
    const cacheKey = query.toLowerCase().trim();

    // Controlla cache
    if (cacheKey in geocodeCache) {
      const cached = geocodeCache[cacheKey];
      if (cached) {
        setCoords(cached);
      } else {
        setError("Mappa non disponibile per questa via.");
      }
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function geocode() {
      try {
        setLoading(true);
        setError("");

        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=it`;
        
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) throw new Error("Errore geocodifica");

        const data = await res.json();

        if (data && data.length > 0) {
          const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          geocodeCache[cacheKey] = result;
          setCoords(result);
        } else {
          // Fallback: prova solo con la città + provincia + regione
          const fallbackQuery = `${cittaEffettiva}, Trapani, Sicilia, Italia`;
          const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1&countrycodes=it`;
          const fallbackRes = await fetch(fallbackUrl, { signal: controller.signal });
          const fallbackData = await fallbackRes.json();
          if (fallbackData && fallbackData.length > 0) {
            const result = { lat: parseFloat(fallbackData[0].lat), lng: parseFloat(fallbackData[0].lon) };
            geocodeCache[cacheKey] = result;
            setCoords(result);
          } else {
            geocodeCache[cacheKey] = null;
            setError("Mappa non disponibile per questa via.");
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError("Errore nel caricamento della mappa.");
        }
      } finally {
        setLoading(false);
      }
    }

    // Debounce di 300ms per non saturare Nominatim
    const timeout = setTimeout(geocode, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [indirizzo, citta, zona]);

  // Renderizzare la mappa con Leaflet (importazione dinamica per SSR)
  useEffect(() => {
    if (!coords || !mapRef.current) return;

    const currentCoords = coords; // Cattura locale per type narrowing
    let isCancelled = false;

    async function initMap() {
      const L = (await import("leaflet")).default;

      // Importare CSS di Leaflet
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
        link.crossOrigin = "";
        document.head.appendChild(link);
      }

      if (isCancelled) return;

      // Distruggere mappa precedente se esiste
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Aspettare che il CSS sia caricato
      await new Promise((r) => setTimeout(r, 100));

      if (isCancelled || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [currentCoords.lat, currentCoords.lng],
        zoom: 15,
        scrollWheelZoom: false,
        dragging: true,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      // Cerchio di offuscamento (250m raggio) — NO pin esatto
      L.circle([currentCoords.lat, currentCoords.lng], {
        radius: 250,
        color: "#4f46e5",
        fillColor: "#6366f1",
        fillOpacity: 0.12,
        weight: 2,
        opacity: 0.5,
        dashArray: "6 4",
      }).addTo(map);

      // Marker centrale piccolo e discreto con tooltip
      const icon = L.divIcon({
        html: `<div style="width:12px;height:12px;background:#4f46e5;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(79,70,229,0.4);"></div>`,
        className: "",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      L.marker([currentCoords.lat, currentCoords.lng], { icon })
        .addTo(map)
        .bindTooltip("Zona approssimativa", { 
          direction: "top", 
          offset: [0, -8],
          className: "leaflet-tooltip-custom" 
        });

      mapInstanceRef.current = map;

      // Forzare il ridimensionamento dopo il rendering
      setTimeout(() => map.invalidateSize(), 200);
    }

    initMap();

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [coords]);

  // Stato di caricamento
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-indigo-500" />
          <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">Zona dell&apos;Immobile</h3>
        </div>
        <div className="h-72 flex items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm font-medium text-slate-400">Caricamento mappa...</p>
          </div>
        </div>
      </div>
    );
  }

  // Stato di errore
  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-indigo-500" />
          <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">Zona dell&apos;Immobile</h3>
        </div>
        <div className="h-48 flex items-center justify-center bg-slate-50/50">
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <MapPinOff className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Mappa renderizzata
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-indigo-500" />
          <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">Zona dell&apos;Immobile</h3>
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
          Area Approssimativa
        </span>
      </div>
      <div ref={mapRef} className="h-72 w-full z-0" style={{ minHeight: "288px" }} />
    </div>
  );
}
