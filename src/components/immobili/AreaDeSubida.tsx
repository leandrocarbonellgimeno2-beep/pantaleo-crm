"use client";

import type { DropzoneRootProps, DropzoneInputProps } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * El dibujo del área de subida de fotos, sin nada de comportamiento.
 *
 * ESTÁ EN SU PROPIO FICHERO POR UNA RAZÓN CONCRETA, NO POR ORDEN
 * `PropertyEditForm` importa esto de forma ESTÁTICA para pintarlo mientras llega
 * el chunk perezoso de `PhotoDropzone`. Si viviera dentro de PhotoDropzone.tsx,
 * que sí importa `useDropzone`, esa importación estática arrastraría
 * react-dropzone al paquete principal y la carga perezosa no ahorraría nada:
 * el empaquetador incluye el módulo entero, no la función suelta.
 *
 * Los dos `import type` de react-dropzone no cuentan: TypeScript los borra al
 * compilar y no dejan ninguna importación en el JavaScript generado.
 */

export interface AreaDeSubidaProps {
  /** false mientras el inmueble no se haya guardado: aún no hay dónde subir. */
  habilitado?: boolean;
  arrastrando?: boolean;
  rootProps?: DropzoneRootProps;
  inputProps?: DropzoneInputProps;
}

export function AreaDeSubida({
  habilitado = true,
  arrastrando = false,
  rootProps,
  inputProps,
}: AreaDeSubidaProps) {
  return (
    <div
      {...rootProps}
      className={cn(
        "border-2 border-dashed rounded-xl p-8 text-center transition-colors",
        habilitado ? "cursor-pointer" : "opacity-50 cursor-not-allowed",
        arrastrando && habilitado
          ? "border-primary bg-primary/5"
          : "border-slate-300 bg-slate-50 hover:border-primary hover:bg-slate-50/80",
      )}
    >
      {inputProps && (
        <input {...inputProps} aria-label="Carica foto dell'immobile" disabled={!habilitado} />
      )}
      <UploadCloud className="h-10 w-10 text-slate-400 mx-auto mb-3" />
      <p className="font-bold text-slate-700 text-lg">
        {habilitado
          ? "Trascina le foto qui o clicca per sfogliare"
          : "Salva prima le informazioni per caricare foto"}
      </p>
      <p className="text-sm text-slate-500 mt-1">
        Caricamento automatico su Firebase Storage e aggiornamento Firestore
      </p>
    </div>
  );
}
