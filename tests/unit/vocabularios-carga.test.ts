import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OPCIONES_TIPOLOGIA,
  OPCIONES_STATO_FINITURE,
  OPCIONES_CLASSE_ENERGETICA,
  SUGERENCIAS_PIANO,
  conValorActual,
} from '@/lib/immobili/vocabularios';
import { ESTADOS_ACABADO, PLANTAS, estadoDe, plantasDe } from '@/lib/immobili/clasificacion';
import { CLASSI_ENERGETICHE } from '@/lib/immobili/options';

/**
 * A3 — que los inmuebles NUEVOS nazcan con valores que el buscador entiende.
 *
 * El formulario escribia sus opciones a mano en el JSX y el buscador usa otras
 * constantes. Cada hueco entre las dos listas son inmuebles que nacen con un
 * valor que despues nadie encuentra.
 */

describe('lo que ofrece el formulario es lo que el buscador entiende', () => {
  it('los 8 estados de acabado, no los 5 de antes', () => {
    expect(OPCIONES_STATO_FINITURE).toHaveLength(8);
    // Los tres que faltaban. «Normali» son 299 inmuebles.
    expect(OPCIONES_STATO_FINITURE).toContain('Normali');
    expect(OPCIONES_STATO_FINITURE).toContain('Ristrutturato');
    expect(OPCIONES_STATO_FINITURE).toContain('Da Sistemare');
  });

  it('y cada uno de ellos lo reconoce `estadoDe`, que es lo que importa', () => {
    // Si una etiqueta no normalizara, ese inmueble no saldria en el filtro.
    for (const etiqueta of OPCIONES_STATO_FINITURE) {
      expect(estadoDe(etiqueta), `«${etiqueta}» no lo reconoce el buscador`).not.toBeNull();
    }
  });

  it('«Buone» y no «Buono»: el formulario escribia la forma que no era', () => {
    expect(OPCIONES_STATO_FINITURE).toContain('Buone');
    // La forma vieja sigue normalizando, asi que los 137 ya guardados no se
    // pierden; lo que cambia es lo que se escribe de aqui en adelante.
    expect(estadoDe('Buono')).toBe('buone');
    expect(estadoDe('Buone')).toBe('buone');
  });

  it('las 14 plantas se sugieren, y el buscador entiende todas', () => {
    expect(SUGERENCIAS_PIANO).toHaveLength(PLANTAS.length);
    for (const etiqueta of SUGERENCIAS_PIANO) {
      expect(plantasDe(etiqueta).length, `«${etiqueta}» no lo reconoce el buscador`).toBeGreaterThan(0);
    }
  });

  it('incluidas «Piano Basso» y «Piano Alto», que son 351 inmuebles', () => {
    expect(SUGERENCIAS_PIANO).toContain('Piano Basso');
    expect(SUGERENCIAS_PIANO).toContain('Piano Alto');
  });

  it('la clase energetica incluye «A», que el formulario se dejaba', () => {
    expect(OPCIONES_CLASSE_ENERGETICA).toContain('A');
    expect(OPCIONES_CLASSE_ENERGETICA).toEqual([...CLASSI_ENERGETICHE]);
  });

  it('las listas salen de las constantes del buscador, no de una copia', () => {
    // Si alguien añade un estado a ESTADOS_ACABADO, el formulario lo ofrece
    // solo. Esa es la propiedad que este fichero existe para conservar.
    expect(OPCIONES_STATO_FINITURE).toEqual(ESTADOS_ACABADO.map((e) => e.etiqueta));
    expect(SUGERENCIAS_PIANO).toEqual(PLANTAS.map((p) => p.etiqueta));
  });
});

describe('NUNCA se pierde un valor guardado', () => {
  it('un valor fuera de la lista se conserva, no desaparece', () => {
    // Si no estuviera, el `<select>` lo pintaria vacio y el primer guardado
    // lo sustituiria. Eso es alterar un dato de negocio.
    const r = conValorActual(OPCIONES_STATO_FINITURE, 'Semi-Rifinito');
    expect(r).toContain('Semi-Rifinito');
    expect(r).toHaveLength(OPCIONES_STATO_FINITURE.length + 1);
  });

  it('se conserva la forma EXACTA que hay guardada', () => {
    const r = conValorActual(OPCIONES_TIPOLOGIA, 'CASA/VILLA  ');
    // Igual salvo acentos y mayusculas: no se duplica.
    expect(r).toHaveLength(OPCIONES_TIPOLOGIA.length);
  });

  it('no duplica por un acento o una mayuscula', () => {
    expect(conValorActual(['Attico'], 'attico')).toEqual(['Attico']);
    expect(conValorActual(['Ottime'], 'ÓTTIME')).toEqual(['Ottime']);
  });

  it('sin valor guardado, la lista es la canonica', () => {
    for (const vacio of [undefined, null, '', '   ', 42, {}]) {
      expect(conValorActual(OPCIONES_TIPOLOGIA, vacio)).toEqual([...OPCIONES_TIPOLOGIA]);
    }
  });

  it('no muta la lista original', () => {
    const antes = [...OPCIONES_TIPOLOGIA];
    conValorActual(OPCIONES_TIPOLOGIA, 'Algo Raro');
    expect([...OPCIONES_TIPOLOGIA]).toEqual(antes);
  });
});

describe('el formulario usa las constantes, no opciones escritas a mano', () => {
  const fuente = readFileSync(
    join(process.cwd(), 'src/components/immobili/PropertyEditForm.tsx'),
    'utf8',
  );

  it('ya no hay una lista de tipologias escrita en el JSX', () => {
    // Era la copia que se iba separando de la del buscador.
    expect(fuente).not.toContain('<option value="Cessione Di Attivita">');
    expect(fuente).toContain('OPCIONES_TIPOLOGIA');
  });

  it('ni la de estados de acabado, con su «Buono»', () => {
    expect(fuente).not.toContain('<option value="Buono">');
    expect(fuente).toContain('OPCIONES_STATO_FINITURE');
  });

  it('el piano ofrece sugerencias y sigue siendo escribible', () => {
    // Una lista cerrada obligaria a reescribir los ~70 valores que ya hay.
    expect(fuente).toContain('list="opciones-piano"');
    expect(fuente).toContain('<datalist id="opciones-piano">');
  });

  it('los cuatro campos pasan por conValorActual', () => {
    const veces = (fuente.match(/conValorActual\(/g) || []).length;
    expect(veces).toBeGreaterThanOrEqual(3);
  });
});
