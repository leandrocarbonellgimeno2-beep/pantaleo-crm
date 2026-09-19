"use client";

import { useDropzone } from "react-dropzone";
import type { Accept } from "react-dropzone";
import { AreaDeSubida } from "@/components/immobili/AreaDeSubida";

// Fuera del componente: un objeto nuevo en cada render obliga a react-dropzone
// a rehacer su validador de tipos de fichero sin que nada haya cambiado.
const ACEPTA: Accept = { "image/*": [], "application/pdf": [] };

/**
 * Zona de subida de fotos del inmueble: el comportamiento.
 *
 * POR QUÉ ES UN COMPONENTE APARTE
 * `react-dropzone` se cargaba en el arranque de /immobili aunque solo se usa
 * dentro de la ficha de un inmueble, o sea dentro de un modal. Como
 * `useDropzone` es un hook y no un componente, `next/dynamic` no se le puede
 * aplicar directamente: hay que sacar a un componente propio el trozo de
 * interfaz que lo usa, y cargar ese componente. Esto es ese componente, y es el
 * ÚNICO fichero del proyecto que importa react-dropzone como valor.
 *
 * El dibujo vive aparte, en AreaDeSubida, para que el sustituto que se pinta
 * mientras llega el chunk ocupe exactamente lo mismo. Ahí se explica por qué la
 * separación es obligatoria y no cosmética.
 */

interface Props {
  onDrop: (files: File[]) => void;
  /** false mientras el inmueble no se haya guardado: aún no hay dónde subir. */
  habilitado: boolean;
}

export default function PhotoDropzone({ onDrop, habilitado }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACEPTA,
    // `disabled` no estaba antes: el <input> se deshabilitaba pero el div seguía
    // aceptando el arrastre, así que soltar fotos sobre un inmueble todavía sin
    // guardar disparaba una subida que no tenía a dónde ir. El propio rótulo del
    // área ya decía que no se podía; ahora además es verdad.
    disabled: !habilitado,
  });

  return (
    <AreaDeSubida
      habilitado={habilitado}
      arrastrando={isDragActive}
      rootProps={getRootProps()}
      inputProps={getInputProps()}
    />
  );
}
