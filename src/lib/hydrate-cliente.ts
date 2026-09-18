/**
 * Hidratación de clientes parciales.
 *
 * EL PROBLEMA
 * El listado de clienti va proyectado (api/clienti/route.ts usa .select(...)),
 * así que los objetos que alimentan la lista NO tienen FirmaDigitale ni
 * Documentazione. Además existen documentos legacy sin DatiPersonali ni
 * Richiesta, con el nombre en campos sueltos de primer nivel (nome, cognome,
 * cell1). El modal recibía esos objetos tal cual y cualquier acceso anidado
 * reventaba el render: ese fue el crash de "Hoja Legal y Firma", y el mismo
 * patrón sigue vivo en el tab por defecto para los clientes legacy.
 *
 * LA SOLUCIÓN
 * Un único punto que garantiza la FORMA completa del Cliente, en lugar de
 * sembrar `?.` por las 1.291 líneas de la página. Se aplica tanto al objeto
 * parcial de la lista como al documento completo del refetch.
 *
 * OJO: hidratar arregla la LECTURA. La escritura la protege el guardado por
 * field paths (src/lib/firestore-update.ts): aunque aquí rellenemos huecos con
 * valores vacíos, el servidor ya no reemplaza mapas enteros.
 */
import { Cliente, generateEmptyCliente } from '@/types/cliente';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Fusiona `partial` sobre `base` en profundidad.
 * - Los arrays y escalares de `partial` ganan (reemplazan, no se fusionan).
 * - `undefined` y `null` en `partial` conservan el valor de `base`: un campo
 *   ausente en la proyección no debe convertirse en null y romper el render.
 * - Las claves que solo existen en `partial` se conservan (id, _status, y los
 *   campos legacy de primer nivel).
 */
function deepMerge(
  base: Record<string, unknown>,
  partial: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined || value === null) continue;
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value)
      ? deepMerge(current, value)
      : value;
  }

  return out;
}

/**
 * Devuelve un Cliente con todos sus mapas presentes, listo para render.
 * Seguro con null/undefined: devuelve un cliente vacío.
 */
export function hydrateCliente(partial: Partial<Cliente> | null | undefined): Cliente {
  const base = generateEmptyCliente() as unknown as Record<string, unknown>;
  if (!partial || typeof partial !== 'object') return base as unknown as Cliente;

  const merged = deepMerge(base, partial as Record<string, unknown>);

  // Documentos legacy: el nombre vive en campos sueltos de primer nivel.
  // Se rellenan solo si la forma estructurada está vacía, nunca se pisa.
  const dati = merged.DatiPersonali as Record<string, unknown>;
  const legacy: Array<[string, string]> = [
    ['nome', 'Nome'],
    ['cognome', 'Cognome'],
    ['cell1', 'Telefono'],
  ];
  for (const [flat, nested] of legacy) {
    if (!dati[nested] && typeof merged[flat] === 'string' && merged[flat]) {
      dati[nested] = merged[flat];
    }
  }

  return merged as unknown as Cliente;
}
