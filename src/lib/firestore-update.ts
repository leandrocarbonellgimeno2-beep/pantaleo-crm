/**
 * Conversión de payloads anidados a field paths de Firestore.
 *
 * EL PROBLEMA QUE RESUELVE
 * `docRef.update({ DatiBase: {...} })` REEMPLAZA el mapa DatiBase entero: todo
 * subcampo que no venga en el payload se borra. Como los listados usan
 * proyecciones (`.select(...)`), el frontend trabaja a menudo con documentos
 * PARCIALES, y al guardarlos destruye los campos que la proyección omitió.
 * De ahí venían el borrado de campos del incarico al cambiar el estado, la
 * pérdida de proposte al guardar un cliente y el borrado de DocumentiIdentita
 * al subir un adjunto.
 *
 * LA SOLUCIÓN
 * Aplanar el payload a field paths (DatiBase.Stato) para que Firestore
 * actualice solo las hojas recibidas y respete sus hermanas. Es el patrón que
 * ya usaban api/idealista/properties/deactivate y el bloque MatchingOps.
 *
 * POR QUÉ FieldPath Y NO CADENAS CON PUNTOS
 * sanitizeBody solo valida claves de PRIMER NIVEL; las anidadas llegan sin
 * filtrar. Con cadenas, una clave como "a.b" se interpretaría como dos
 * segmentos y escribiría en una ruta no pretendida. FieldPath trata cada
 * segmento de forma literal y lo escapa.
 */
import { FieldPath } from 'firebase-admin/firestore';

/**
 * Solo los objetos planos se recorren. Todo lo demás (arrays, Date, Timestamp,
 * GeoPoint, DocumentReference y los centinelas FieldValue como serverTimestamp,
 * delete, arrayUnion o increment) es una hoja y se escribe tal cual.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export interface FieldPathEntry {
  segments: string[];
  value: unknown;
}

/**
 * Aplana un payload a pares (segmentos, valor).
 *
 * - Los mapas vacíos se omiten: escribir {} reemplazaría el mapa existente y
 *   borraría su contenido, que es justo lo que queremos evitar.
 * - Los valores `undefined` se omiten: Firestore los rechaza y un campo suelto
 *   no debe tumbar un guardado entero.
 * - Los arrays se escriben completos (no se fusionan elemento a elemento), que
 *   es la semántica que el CRM espera para images, Proposti, AltriDocumenti...
 */
export function toFieldPathEntries(data: Record<string, unknown>): FieldPathEntry[] {
  const out: FieldPathEntry[] = [];

  const walk = (obj: Record<string, unknown>, prefix: string[]) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      const segments = [...prefix, key];
      if (isPlainObject(value)) {
        if (Object.keys(value).length === 0) continue;
        walk(value, segments);
      } else {
        out.push({ segments, value });
      }
    }
  };

  walk(data, []);
  return out;
}

/**
 * Construye los argumentos variádicos de `update()`:
 *   const args = buildUpdateArgs(payload);
 *   if (args.length) await ref.update(...(args as [FieldPath, unknown, ...unknown[]]));
 *
 * Devuelve [] si no hay nada que escribir — el llamante DEBE comprobarlo,
 * porque `update()` sin argumentos lanza.
 */
export function buildUpdateArgs(data: Record<string, unknown>): unknown[] {
  const args: unknown[] = [];
  for (const { segments, value } of toFieldPathEntries(data)) {
    args.push(new FieldPath(...segments), value);
  }
  return args;
}
