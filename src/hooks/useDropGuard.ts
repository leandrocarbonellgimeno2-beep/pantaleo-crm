"use client";

import { useEffect } from "react";

/**
 * Impide que el navegador abra un fichero que se suelte fuera de una zona de
 * subida.
 *
 * POR QUÉ HACE FALTA ESTE HOOK, QUE ANTES NO EXISTÍA
 * Lo hacía `react-dropzone` de propina. Su opción `preventDropOnDocument` viene
 * activada por defecto y registra `dragover` y `drop` en `document`
 * (react-dropzone/dist/es/index.js:83 y :544-552). Como `useDropzone` se
 * llamaba en el cuerpo de /immobili, en cada render, esa guarda cubría la
 * pantalla ENTERA: soltar un fichero en cualquier punto del listado no hacía
 * nada.
 *
 * Al volver la librería perezosa y bajarla dentro de la ficha, la guarda se fue
 * con ella. Sin reponerla, soltar una foto sobre el listado hace que el
 * navegador ABANDONE la aplicación para abrir el fichero —y si había un alta a
 * medias, se pierde, porque el inmueble en edición solo vive en memoria—. No es
 * una pérdida de datos en la base, pero sí de trabajo del agente.
 *
 * Y hay un caso todavía peor que este hook también tapa. Cuando el área de
 * subida está deshabilitada (un inmueble aún sin guardar), `react-dropzone`
 * anula TODOS los manejadores del contenedor —`composeHandler` hace
 * `disabled ? null : fn`, índex.js:900— y además se retira del `drop` de
 * documento cuando el destino cae dentro del contenedor. Sin esta guarda,
 * soltar fotos justo encima de la caja gris navegaría fuera del CRM.
 *
 * Son dos oyentes y cero dependencias. Soltar DENTRO de una zona de subida
 * sigue funcionando: el manejador del contenedor corre antes, porque `document`
 * es antepasado y estos oyentes van en fase de burbuja.
 */
export function useDropGuard() {
  useEffect(() => {
    const frenar = (e: DragEvent) => e.preventDefault();
    document.addEventListener("dragover", frenar, false);
    document.addEventListener("drop", frenar, false);
    return () => {
      document.removeEventListener("dragover", frenar);
      document.removeEventListener("drop", frenar);
    };
  }, []);
}
