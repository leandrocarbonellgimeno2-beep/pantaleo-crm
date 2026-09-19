import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, burnPasswordTime } from '@/lib/password';

describe('hashPassword / verifyPassword — camino feliz', () => {
  it('una contrasena valida verifica contra su propio hash', async () => {
    const h = await hashPassword('Contrasena-Muy-Larga-123');
    expect(await verifyPassword('Contrasena-Muy-Larga-123', h)).toBe(true);
  });

  it('una contrasena distinta no verifica', async () => {
    const h = await hashPassword('correcta');
    expect(await verifyPassword('incorrecta', h)).toBe(false);
    expect(await verifyPassword('Correcta', h)).toBe(false); // sensible a mayusculas
    expect(await verifyPassword('correcta ', h)).toBe(false); // y a espacios
  });

  it('dos hashes de la MISMA contrasena son distintos', async () => {
    // Sal aleatoria por usuario: sin ella, dos personas con la misma
    // contrasena tendrian el mismo hash y una tabla precalculada valdria
    // para las dos.
    const a = await hashPassword('misma');
    const b = await hashPassword('misma');
    expect(a).not.toBe(b);
    expect(await verifyPassword('misma', a)).toBe(true);
    expect(await verifyPassword('misma', b)).toBe(true);
  });

  it('el hash no contiene la contrasena', async () => {
    const h = await hashPassword('secreto-en-claro');
    expect(h.includes('secreto-en-claro')).toBe(false);
  });

  it('acepta unicode y contrasenas largas', async () => {
    const p = 'contraseña-ñÁÉ-😀-' + 'x'.repeat(200);
    expect(await verifyPassword(p, await hashPassword(p))).toBe(true);
  });
});

describe('hashPassword — formato', () => {
  it('lleva los parametros dentro para poder subirlos manana', async () => {
    // Sin esto, cambiar N invalidaria todos los hashes ya guardados.
    const h = await hashPassword('x');
    const partes = h.split('$');
    expect(partes).toHaveLength(6);
    expect(partes[0]).toBe('scrypt');
    expect(Number(partes[1])).toBeGreaterThanOrEqual(16384);
  });

  it('rechaza una contrasena vacia al hashear', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });
});

describe('verifyPassword — entradas corruptas devuelven false, no lanzan', () => {
  it('un documento corrupto no debe tumbar el login con un 500', async () => {
    for (const malo of [
      '',
      'no-es-un-hash',
      'scrypt$16384$8$1$solo-cinco-partes',
      'bcrypt$16384$8$1$c2FsdA==$aGFzaA==',
      'scrypt$abc$8$1$c2FsdA==$aGFzaA==',
      'scrypt$16384$8$1$$aGFzaA==',
      'scrypt$16384$8$1$c2FsdA==$',
    ]) {
      expect(await verifyPassword('cualquiera', malo)).toBe(false);
    }
  });

  it('LA TRAMPA: una contrasena en claro no se acepta como hash', async () => {
    // Durante la migracion conviven el JSON en claro y los hashes. Si
    // verifyPassword tratase el texto plano como hash valido, un documento a
    // medio migrar abriria la puerta con la contrasena visible en la base.
    expect(await verifyPassword('miclave', 'miclave')).toBe(false);
  });

  it('rechaza parametros absurdos en vez de intentar reservar la memoria', async () => {
    // Un N enorme en un documento manipulado agotaria la memoria del proceso.
    expect(await verifyPassword('x', 'scrypt$99999999$8$1$c2FsdA==$aGFzaA==')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$16384$9999$1$c2FsdA==$aGFzaA==')).toBe(false);
  });

  it('tolera tipos que no son string', async () => {
    expect(await verifyPassword(null as any, await hashPassword('x'))).toBe(false);
    expect(await verifyPassword('x', null as any)).toBe(false);
  });
});

describe('burnPasswordTime', () => {
  it('no lanza y no revela nada', async () => {
    await expect(burnPasswordTime('lo-que-sea')).resolves.toBeUndefined();
    await expect(burnPasswordTime('')).resolves.toBeUndefined();
    await expect(burnPasswordTime(null as any)).resolves.toBeUndefined();
  });

  it('tarda un tiempo comparable a una verificacion real', async () => {
    // Es su unica razon de ser: que un email inexistente no responda mucho
    // antes que uno real con la contrasena mal, porque esa diferencia
    // convierte el login en un detector de cuentas validas.
    const h = await hashPassword('referencia');

    await burnPasswordTime('calentamiento'); // el senuelo se calcula la primera vez

    const t0 = process.hrtime.bigint();
    await verifyPassword('mala', h);
    const real = Number(process.hrtime.bigint() - t0);

    const t1 = process.hrtime.bigint();
    await burnPasswordTime('mala');
    const senuelo = Number(process.hrtime.bigint() - t1);

    // Margen amplio a proposito: en CI los tiempos bailan. Lo que se descarta
    // es una diferencia de ORDEN DE MAGNITUD, que es la que se puede medir
    // desde fuera por la red.
    expect(senuelo).toBeGreaterThan(real / 10);
    expect(senuelo).toBeLessThan(real * 10);
  });
});
