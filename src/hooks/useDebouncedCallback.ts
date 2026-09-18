"use client";

import { useEffect, useRef } from 'react';

/**
 * Envuelve un callback para que solo se ejecute cuando pasan `delay` ms sin
 * nuevas llamadas.
 *
 * Pensado para los typeaheads de los formularios de documentos, que llamaban a
 * la API directamente desde el onChange del input: una petición por tecla. Con
 * la búsqueda de clientes escaneando la colección, eso multiplicaba por diez el
 * coste de cada búsqueda.
 *
 * Se diferencia de useDebounce (que retrasa un VALOR) en que aquí se retrasa la
 * llamada, sin reestructurar el componente a estado + efecto.
 */
export function useDebouncedCallback<A extends any[]>(
  fn: (...args: A) => void,
  delay = 300,
): (...args: A) => void {
  const timer = useRef<NodeJS.Timeout | null>(null);
  const fnRef = useRef(fn);

  // La referencia se mantiene al día sin reprogramar el temporizador, para que
  // el callback devuelto sea estable y no rompa el memo de quien lo reciba.
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (...args: A) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(...args), delay);
  };
}
