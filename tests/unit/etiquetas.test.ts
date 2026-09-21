import { describe, it, expect } from 'vitest';
import { nombrePersona, telefonoPersona, direccionInmueble, refInmueble } from '@/lib/etiquetas';

/**
 * Los buscadores de la agenda leian campos que en esa forma NO EXISTEN.
 *
 * Leer un campo ausente en JavaScript no falla: da `undefined`. Por eso el
 * error no aparecia en ninguna consola, solo en la pantalla:
 *
 *   - el buscador de personas guardaba «undefined undefined» como nombre de la
 *     cita cuando era un cliente (acertaba con los propietarios, que si tienen
 *     los campos sueltos)
 *   - el de inmuebles pintaba filas EN BLANCO y al elegir una escribia cadena
 *     vacia en la direccion, borrando lo que el agente habia tecleado
 */

const CLIENTE = {
  id: 'c1',
  DatiPersonali: { Nome: 'Mario', Cognome: 'Rossi', Telefono: '3331112233' },
};

const PROPIETARIO = {
  id: 'p1',
  nome: 'Francesco', cognome: 'Pantaleo', cell1: '3284455667',
};

const INMUEBLE = {
  id: 'i1',
  DatiBase: { Indirizzo: 'Via Roma 12', Citta: 'Marsala', Zona: 'Centro', Riferimento: '1001', Codice: 'A-1001' },
};

describe('el nombre sale bien en las DOS formas', () => {
  it('cliente: el nombre vive en DatiPersonali', () => {
    expect(nombrePersona(CLIENTE)).toBe('Mario Rossi');
    // Lo que hacia antes:
    expect(`${(CLIENTE as any).nome} ${(CLIENTE as any).cognome}`).toBe('undefined undefined');
  });

  it('propietario: el nombre vive suelto en el primer nivel', () => {
    expect(nombrePersona(PROPIETARIO)).toBe('Francesco Pantaleo');
  });

  it('cliente heredado, con los campos sueltos y sin DatiPersonali', () => {
    expect(nombrePersona({ nome: 'Anna', cognome: 'Bianchi' })).toBe('Anna Bianchi');
  });

  it('la forma canonica manda sobre la heredada', () => {
    const mezcla = { DatiPersonali: { Nome: 'Nuevo', Cognome: 'Apellido' }, nome: 'Viejo', cognome: 'Antiguo' };
    expect(nombrePersona(mezcla)).toBe('Nuevo Apellido');
  });

  it('solo nombre, sin apellido: no deja un espacio colgando', () => {
    expect(nombrePersona({ nome: 'Anna' })).toBe('Anna');
    expect(nombrePersona({ DatiPersonali: { Cognome: 'Bianchi' } })).toBe('Bianchi');
  });

  it('sin nada devuelve cadena vacia, nunca «undefined»', () => {
    for (const nada of [null, undefined, {}, 'texto', 42]) {
      expect(nombrePersona(nada)).toBe('');
      expect(nombrePersona(nada)).not.toContain('undefined');
    }
  });
});

describe('el telefono tambien', () => {
  it('cliente y propietario', () => {
    expect(telefonoPersona(CLIENTE)).toBe('3331112233');
    expect(telefonoPersona(PROPIETARIO)).toBe('3284455667');
  });

  it('sin telefono, cadena vacia', () => {
    expect(telefonoPersona({ nome: 'Anna' })).toBe('');
    expect(telefonoPersona(null)).toBe('');
  });
});

describe('el inmueble: ni filas en blanco ni direcciones borradas', () => {
  it('la direccion vive en DatiBase', () => {
    expect(direccionInmueble(INMUEBLE)).toBe('Via Roma 12');
    // Lo que hacia antes: cadena vacia, que al guardarse BORRABA la direccion.
    expect((INMUEBLE as any).indirizzo || (INMUEBLE as any).titolo || '').toBe('');
  });

  it('sin Indirizzo cae a ciudad y zona, para que la fila no salga vacia', () => {
    const sinCalle = { DatiBase: { Citta: 'Marsala', Zona: 'Centro' } };
    expect(direccionInmueble(sinCalle)).toBe('Marsala — Centro');
  });

  it('la referencia: Riferimento primero, Codice despues', () => {
    expect(refInmueble(INMUEBLE)).toBe('1001');
    expect(refInmueble({ DatiBase: { Codice: 'A-77' } })).toBe('A-77');
  });

  it('si no hay nada reconocible, cadena vacia y no «undefined»', () => {
    expect(direccionInmueble({ DatiBase: {} })).toBe('');
    expect(refInmueble({})).toBe('');
    expect(direccionInmueble(null)).toBe('');
  });
});
