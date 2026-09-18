import { describe, it, expect } from 'vitest';
import { toDocId } from '@/lib/rate-limit';

// La logica transaccional necesita Firestore, asi que aqui se cubre la parte
// pura: la conversion de clave a id de documento, que es donde una entrada
// hostil podria escribir fuera de la coleccion prevista.
describe('toDocId', () => {
  it('deja intactas las claves normales', () => {
    expect(toDocId('login:1.2.3.4')).toBe('login:1.2.3.4');
    expect(toDocId('backup:mario@example.com')).toBe('backup:mario@example.com');
  });

  it('neutraliza las barras, que Firestore no admite en un id', () => {
    // Una cabecera x-forwarded-for hostil podria intentar salirse de la
    // coleccion escribiendo en una subcoleccion arbitraria.
    expect(toDocId('login:../../immobili/abc')).toBe('login:.._.._immobili_abc');
    // Barra invertida literal: en un literal JS hay que escaparla, o '\b' es
    // el caracter de retroceso y el test comprobaria otra cosa.
    expect(toDocId('login:a\\b')).toBe('login:a_b');
  });

  it('acota la longitud', () => {
    expect(toDocId('login:' + 'x'.repeat(5000))).toHaveLength(300);
  });

  it('nunca devuelve una cadena vacia', () => {
    expect(toDocId('')).toBe('unknown');
  });
});
