import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que cada recuadro de firma lea y escriba EL MISMO campo.
 *
 * El fallo que fija esto: `IncaricoAcquistoForm` pintaba
 *
 *     value={form.firmaCliente}
 *     onSave={(b64) => { u('firmaAcquirente', b64); }}
 *     onClear={() => u('firmaCliente', '')}
 *
 * `firmaAcquirente` no existe en ninguna otra parte del proyecto: aparecia una
 * sola vez, justo ahi. El comprador firmaba, el trazo se guardaba en una clave
 * que nadie lee, y el incarico salia SIN SU FIRMA. Nada fallaba, nada se
 * quejaba: en JavaScript escribir una clave nueva en un objeto es legal.
 *
 * Es un fallo de UNA palabra en un campo con valor legal, del tipo que no se
 * ve leyendo el codigo porque las tres lineas parecen correctas por separado.
 * Por eso se comprueba sobre el fuente y no sobre el comportamiento.
 */

const CARPETA = join(process.cwd(), 'src/components/documenti');

/** Cada bloque <SignaturePad ... /> del fichero, con sus props. */
function recuadrosDeFirma(fuente: string): string[] {
  const bloques: string[] = [];
  const re = /<SignaturePad\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fuente))) {
    // Hasta el cierre del elemento. Los props usan llaves, asi que se corta en
    // el `/>` y no en el primer `>`.
    const desde = m.index;
    const cierre = fuente.indexOf('/>', desde);
    if (cierre > -1) bloques.push(fuente.slice(desde, cierre));
  }
  return bloques;
}

const campoDe = (texto: string, patron: RegExp): string | null => {
  const m = texto.match(patron);
  return m ? m[1] : null;
};

const formularios = readdirSync(CARPETA).filter((f) => f.endsWith('Form.tsx'));

describe('los recuadros de firma de los formularios de documentos', () => {
  it('hay formularios que revisar (si esto falla, el test se quedo mirando al vacio)', () => {
    expect(formularios.length).toBeGreaterThanOrEqual(5);
  });

  for (const fichero of formularios) {
    const fuente = readFileSync(join(CARPETA, fichero), 'utf8');
    const recuadros = recuadrosDeFirma(fuente);

    it(`${fichero}: value, onSave y onClear apuntan al mismo campo`, () => {
      expect(recuadros.length).toBeGreaterThan(0);

      for (const recuadro of recuadros) {
        const lee = campoDe(recuadro, /value=\{form\.(\w+)\}/);
        const escribe = campoDe(recuadro, /onSave=\{\([^)]*\)\s*=>\s*\{?\s*\w+\(['"](\w+)['"]/);
        const borra = campoDe(recuadro, /onClear=\{\(\)\s*=>\s*\w+\(['"](\w+)['"]/);

        const titulo = campoDe(recuadro, /title="([^"]+)"/) || '(sin titulo)';

        expect(lee, `${fichero} · ${titulo}: no se entiende que campo LEE`).toBeTruthy();
        expect(escribe, `${fichero} · ${titulo}: no se entiende que campo ESCRIBE`).toBeTruthy();

        expect(
          escribe,
          `${fichero} · ${titulo}: lee '${lee}' y escribe '${escribe}'. ` +
            'La firma se guardaria en un campo que nadie lee y el PDF saldria sin ella.',
        ).toBe(lee);

        if (borra) {
          expect(
            borra,
            `${fichero} · ${titulo}: lee '${lee}' y borra '${borra}'.`,
          ).toBe(lee);
        }
      }
    });

    it(`${fichero}: todo campo de firma que se escribe existe en el estado inicial`, () => {
      for (const recuadro of recuadros) {
        const escribe = campoDe(recuadro, /onSave=\{\([^)]*\)\s*=>\s*\{?\s*\w+\(['"](\w+)['"]/);
        if (!escribe) continue;
        // El estado inicial declara `firmaAgente: ''`, `firmaCliente: ''`, etc.
        const declarado = new RegExp(`\\b${escribe}\\s*:\\s*['"]`).test(fuente);
        expect(
          declarado,
          `${fichero}: se escribe '${escribe}', que no esta en el estado inicial del formulario.`,
        ).toBe(true);
      }
    });
  }
});
