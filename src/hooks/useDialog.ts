"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Convierte un overlay cualquiera en un diálogo modal de verdad.
 *
 * QUÉ APORTA, Y POR QUÉ CADA COSA
 *
 *  · `role="dialog"` + `aria-modal="true"`. Sin esto, un lector de pantalla no
 *    anuncia que se ha abierto nada: sigue leyendo la página de detrás como si
 *    el modal no existiera. Es la diferencia entre «Dialogo, Conferma
 *    eliminazione» y silencio absoluto.
 *
 *  · Trampa de foco. Sin ella, el tabulador se escapa del modal y recorre los
 *    controles de la página de detrás —que están tapados por el overlay—, así
 *    que el usuario de teclado pierde el foco en un limbo invisible y no tiene
 *    forma de saber dónde está.
 *
 *  · Escape para cerrar. Es lo que todo el mundo espera y no lo tenía ni uno
 *    solo de los diálogos salvo ConfirmDialog.
 *
 *  · Devolución del foco. Al cerrar, el foco vuelve al botón que abrió el
 *    diálogo. Si no, se cae a `<body>` y el siguiente tabulador empieza desde
 *    el principio de la página: con una lista de 800 inmuebles eso es una
 *    travesía de cientos de tabulaciones para volver a donde estabas.
 *
 * LA PILA, Y POR QUÉ ES IMPRESCINDIBLE
 * En este CRM hay diálogos que abren otros diálogos (la ficha de un inmueble
 * abre el selector de impresión y la confirmación de borrado). Si cada uno
 * escucha `keydown` en `document` por su cuenta, pasan dos cosas malas: Escape
 * cierra los dos de golpe, y la trampa de foco del de abajo pelea con la del de
 * arriba y devuelve el foco al diálogo tapado, dejando la aplicación
 * inservible. Por eso hay una pila a nivel de módulo y SOLO el diálogo que está
 * arriba reacciona.
 *
 * LO QUE NO HACE, A PROPÓSITO
 * No bloquea el scroll del fondo. Hacerlo obliga a compensar el ancho de la
 * barra de scroll y, si se compensa mal, toda la página da un salto lateral al
 * abrir cualquier modal. No merece la pena arriesgar eso por un detalle que
 * aquí nadie ha pedido.
 */

/** Diálogos abiertos, del más antiguo al más reciente. El último manda. */
const pila: symbol[] = [];

const FOCALIZABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focalizablesDe(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(FOCALIZABLES)).filter(
    // `offsetParent` es null para lo que está oculto con display:none, y
    // descarta de paso los controles de las pestañas que no se ven.
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export interface OpcionesDialogo {
  /** Si el diálogo está montado y visible. */
  abierto: boolean;
  /** Qué hacer cuando el usuario pide cerrar (Escape). */
  alCerrar?: () => void;
  /**
   * Desactiva el cierre con Escape. Solo para diálogos de los que no se puede
   * salir sin decidir algo; en este CRM, ninguno.
   */
  sinEscape?: boolean;
}

export interface Dialogo<T extends HTMLElement = HTMLDivElement> {
  /** Va en el contenedor del diálogo (el panel, no el overlay). */
  ref: React.RefObject<T | null>;
  /** Atributos que hacen del contenedor un diálogo declarado. */
  props: {
    role: "dialog";
    "aria-modal": true;
    tabIndex: -1;
  };
}

export function useDialog<T extends HTMLElement = HTMLDivElement>({
  abierto,
  alCerrar,
  sinEscape = false,
}: OpcionesDialogo): Dialogo<T> {
  const ref = useRef<T | null>(null);

  // El manejador se guarda en una ref para que cambiar `alCerrar` en cada
  // render del padre no reinstale el efecto: reinstalarlo volvería a mover el
  // foco al principio del diálogo en mitad de que el usuario escribe.
  const alCerrarRef = useRef(alCerrar);
  alCerrarRef.current = alCerrar;

  useEffect(() => {
    if (!abierto) return;

    const identidad = Symbol("dialogo");
    pila.push(identidad);
    const soyElDeArriba = () => pila[pila.length - 1] === identidad;

    const veniaDe = document.activeElement as HTMLElement | null;

    // El foco entra en el diálogo. Se enfoca el CONTENEDOR, no el primer
    // control: enfocar el primer botón de una confirmación de borrado pone el
    // foco sobre «Elimina» y un Enter de más borra el inmueble.
    const contenedor = ref.current;
    if (contenedor) {
      // rAF: el nodo puede estar recién montado y aún sin pintar.
      requestAnimationFrame(() => {
        if (soyElDeArriba()) contenedor.focus({ preventScroll: true });
      });
    }

    const alPulsar = (e: KeyboardEvent) => {
      if (!soyElDeArriba()) return;

      if (e.key === "Escape" && !sinEscape) {
        e.preventDefault();
        e.stopPropagation();
        alCerrarRef.current?.();
        return;
      }

      if (e.key !== "Tab") return;

      const raiz = ref.current;
      if (!raiz) return;

      const focalizables = focalizablesDe(raiz);
      if (focalizables.length === 0) {
        // Un diálogo sin controles (un visor de imagen, por ejemplo): el foco
        // se queda en el contenedor en vez de escaparse a la página de detrás.
        e.preventDefault();
        raiz.focus({ preventScroll: true });
        return;
      }

      const primero = focalizables[0];
      const ultimo = focalizables[focalizables.length - 1];
      const actual = document.activeElement;

      // El ciclo se cierra a mano en los dos extremos. El caso de `actual`
      // fuera del diálogo cubre el arranque, cuando el foco está en el
      // contenedor y no en ninguno de sus controles.
      if (e.shiftKey) {
        if (actual === primero || !raiz.contains(actual)) {
          e.preventDefault();
          ultimo.focus();
        }
      } else if (actual === ultimo || !raiz.contains(actual)) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", alPulsar, true);

    return () => {
      document.removeEventListener("keydown", alPulsar, true);
      const i = pila.indexOf(identidad);
      if (i !== -1) pila.splice(i, 1);

      // El foco vuelve a su sitio, pero solo si ese sitio sigue existiendo y
      // sigue en el documento: si el botón que abrió el diálogo se desmontó
      // (borrar un inmueble desmonta su tarjeta), enfocarlo no haría nada y
      // además petaría en algunos navegadores.
      if (veniaDe && document.contains(veniaDe) && typeof veniaDe.focus === "function") {
        veniaDe.focus({ preventScroll: true });
      }
    };
  }, [abierto, sinEscape]);

  return {
    ref,
    props: { role: "dialog", "aria-modal": true, tabIndex: -1 },
  };
}

/**
 * Para los overlays que se cierran al pinchar el fondo. Se comprueba que el
 * clic empezó Y terminó en el overlay: sin eso, seleccionar texto dentro del
 * diálogo y soltar el ratón fuera cierra el formulario y se pierde lo escrito.
 */
export function useCierreAlPinchoFuera(alCerrar: () => void) {
  const empezoFuera = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    empezoFuera.current = e.target === e.currentTarget;
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && empezoFuera.current) alCerrar();
      empezoFuera.current = false;
    },
    [alCerrar],
  );

  return { onMouseDown, onClick };
}
