"use client";

/**
 * «Dati aziendali» — los datos de la agencia que salen en las páginas legales.
 *
 * Antes estaban escritos a mano en el código y completarlos exigía tocar un
 * fichero y volver a desplegar. Ahora los edita Francesco desde aquí.
 *
 * OCULTAR ESTO EN REACT NO ES SEGURIDAD. La barrera está en el servidor:
 * /api/admin/datos-titular exige rol propietario en el GET y en el PUT, contra
 * el token firmado y el estado vivo del usuario, en cada petición. Lo de aquí
 * es que a un vendedor no se le pinte un formulario que va a contestarle 403.
 */

import { useEffect, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Building2, Loader2, Save, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasAtLeast } from "@/lib/roles";
import {
  CAMPOS_TITULAR,
  DATOS_VACIOS,
  camposQueFaltan,
  type ClaveTitular,
  type DatosTitular,
} from "@/lib/datos-titular";

interface Respuesta {
  datos: DatosTitular;
  existe: boolean;
  actualizadoAt: number | null;
  actualizadoPor: string | null;
  faltan: ClaveTitular[];
  errorDeLectura: boolean;
}

const jsonFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

const campoClase =
  "w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition-colors focus:ring-2";

const fecha = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

export default function DatiAziendaliSection() {
  const { user } = useAuth();
  const esPropietario = hasAtLeast(user?.ruolo, "propietario");

  // Clave condicional: sin esto, la consola de cualquier otro rol se llenaría
  // de 403 en cada carga del home.
  const { data, isLoading, error, mutate } = useSWR<Respuesta>(
    esPropietario ? "/api/admin/datos-titular" : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 10_000 },
  );

  const [form, setForm] = useState<DatosTitular>(DATOS_VACIOS);
  const [errores, setErrores] = useState<Partial<Record<ClaveTitular, string>>>({});
  const [guardando, setGuardando] = useState(false);
  const [tocado, setTocado] = useState(false);

  // El formulario se rellena cuando llegan los datos, y NO se vuelve a pisar
  // después: sin `tocado`, una revalidación de SWR mientras Francesco escribe
  // le borraría lo que lleva tecleado.
  useEffect(() => {
    if (data?.datos && !tocado) setForm(data.datos);
  }, [data, tocado]);

  if (!esPropietario) return null;

  const cambiar = (clave: ClaveTitular, valor: string) => {
    setTocado(true);
    setForm((f) => ({ ...f, [clave]: valor }));
    setErrores((e) => ({ ...e, [clave]: undefined }));
  };

  // Se calcula sobre lo que hay EN PANTALLA, no sobre lo guardado: así el
  // contador baja mientras Francesco escribe, antes de darle a guardar.
  const faltan = camposQueFaltan(form);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    try {
      const res = await fetch("/api/admin/datos-titular", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));

      // 422 = el cuerpo se entendio pero su contenido no vale. El servidor
      // manda el error de cada campo y se pinta debajo del que corresponde.
      if (res.status === 422 && body?.errores) {
        setErrores(body.errores);
        toast.error("Controlla i campi segnalati.");
        return;
      }
      if (!res.ok) {
        toast.error(body?.error || "Impossibile salvare i dati.");
        return;
      }

      toast.success(
        body?.faltan?.length
          ? `Salvato. Mancano ancora ${body.faltan.length} campi.`
          : "Dati aziendali salvati. Le pagine legali sono aggiornate.",
      );
      setTocado(false);
      mutate();
    } catch {
      toast.error("Errore di rete. Riprova.");
    } finally {
      setGuardando(false);
    }
  };

  const guardadoEl = fecha(data?.actualizadoAt ?? null);

  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-md">
            <Building2 className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800">Dati aziendali</h2>
            <p className="text-[13px] text-slate-400 font-medium">
              Compaiono nell&apos;Informativa sulla Privacy e nei Termini di Servizio.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-bold">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-slate-400 hover:text-indigo-600 transition-colors"
          >
            Privacy <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-slate-400 hover:text-indigo-600 transition-colors"
          >
            Termini <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {isLoading && (
        <div className="py-16 flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          <p className="text-sm font-semibold text-slate-400">Caricamento dati...</p>
        </div>
      )}

      {error && !isLoading && (
        <div className="py-16 text-center px-6">
          <p className="font-bold text-slate-700">Impossibile caricare i dati aziendali.</p>
          <p className="text-sm text-slate-400 mt-1">Riprova fra un momento.</p>
        </div>
      )}

      {!isLoading && !error && (
        <form onSubmit={guardar} className="p-6 space-y-5">
          {/* Estado: qué falta, o que ya está todo. Es lo primero que se ve. */}
          {faltan.length > 0 ? (
            <div role="status" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div className="text-sm font-medium">
                <p>
                  <strong className="font-black">
                    Mancano {faltan.length} {faltan.length === 1 ? "campo" : "campi"}.
                  </strong>{' '}
                  Finché non sono compilati, le pagine legali mostrano un avviso e{' '}
                  <strong>non vanno pubblicate</strong>.
                </p>
                <p className="mt-1.5 text-[13px]">
                  Da completare:{' '}
                  {faltan
                    .map((k) => CAMPOS_TITULAR.find((c) => c.clave === k)?.etiqueta ?? k)
                    .join(' · ')}
                </p>
              </div>
            </div>
          ) : (
            <div role="status" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">
                <strong className="font-black">Dati completi.</strong> Le pagine legali sono
                pronte per essere pubblicate e per essere indicate a Google.
              </p>
            </div>
          )}

          {data?.errorDeLectura && (
            <p className="text-[13px] font-semibold text-rose-600">
              Attenzione: non è stato possibile leggere i dati salvati. Il modulo è vuoto ma
              i dati potrebbero esistere — non salvare finché non si ricarica correttamente.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {CAMPOS_TITULAR.map((campo) => {
              const vacioObligatorio = campo.obligatorio && !form[campo.clave]?.trim();
              const errorCampo = errores[campo.clave];
              const id = `titular-${campo.clave}`;

              return (
                <div key={campo.clave} className={campo.clave === 'direccion' ? 'md:col-span-2' : ''}>
                  <label
                    htmlFor={id}
                    className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5"
                  >
                    {campo.etiqueta}
                    {campo.obligatorio && <span className="text-rose-500 ml-1" aria-hidden="true">*</span>}
                    {!campo.obligatorio && (
                      <span className="ml-2 text-[10px] font-bold normal-case tracking-normal text-slate-300">
                        facoltativo
                      </span>
                    )}
                  </label>

                  <input
                    id={id}
                    type={campo.tipo}
                    value={form[campo.clave] ?? ''}
                    onChange={(e) => cambiar(campo.clave, e.target.value)}
                    placeholder={campo.ejemplo}
                    maxLength={300}
                    aria-invalid={Boolean(errorCampo) || undefined}
                    aria-describedby={`${id}-ayuda`}
                    className={`${campoClase} ${
                      errorCampo
                        ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                        : vacioObligatorio
                          ? 'border-amber-300 bg-amber-50/40 focus:border-amber-400 focus:ring-amber-100'
                          : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
                    }`}
                  />

                  <p
                    id={`${id}-ayuda`}
                    className={`text-[11px] mt-1.5 font-medium ${
                      errorCampo ? 'text-rose-600' : 'text-slate-400'
                    }`}
                  >
                    {errorCampo || campo.ayuda}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <p className="text-[11px] font-medium text-slate-400">
              {guardadoEl
                ? `Ultimo salvataggio: ${guardadoEl}${data?.actualizadoPor ? ` da ${data.actualizadoPor}` : ''}`
                : 'Non ancora salvato.'}
            </p>

            <button
              type="submit"
              disabled={guardando}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700 disabled:opacity-60"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {guardando ? 'Salvataggio...' : 'Salva dati aziendali'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
