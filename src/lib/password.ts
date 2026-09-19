/**
 * Hashing de contrasenas con scrypt.
 *
 * Sin dependencias nuevas: scrypt viene en el modulo crypto de Node. La ruta de
 * login corre en Node, no en Edge, asi que esta disponible.
 *
 * POR QUE ESTE MODULO ESTA SEPARADO DE lib/auth.ts, que es donde uno lo
 * pondria: src/middleware.ts importa lib/auth.ts y el middleware corre en
 * EDGE, donde node:crypto no existe. Un import de node:crypto alli no rompe el
 * login: rompe el build del proyecto entero. lib/auth.ts esta escrito a
 * proposito solo con Web Crypto y sin Buffer, y esa frontera hay que
 * respetarla.
 *
 * POR QUE scrypt Y NO UN SHA A SECAS. Un SHA-256 se calcula en microsegundos,
 * asi que una tarjeta grafica prueba miles de millones de candidatas por
 * segundo. scrypt esta disenado para ser lento Y para exigir memoria, que es lo
 * que encarece atacarlo en paralelo.
 *
 * POR QUE LA VARIANTE ASINCRONA Y NO scryptSync. Es el mismo algoritmo, pero
 * scryptSync BLOQUEA el event loop unos 100 ms por intento. El rate limiter
 * del login falla abierto cuando Firestore no responde, asi que con la version
 * sincrona bastaria con lanzar intentos de login contra una instancia para
 * dejarla clavada. La asincrona hace el trabajo en el threadpool y la
 * instancia sigue atendiendo.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// N=16384 exige 128 * N * r = 16 MiB y tarda del orden de 50-100 ms. Los
// parametros viajan DENTRO del hash, de modo que se pueden subir manana sin
// invalidar los hashes ya guardados.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

// maxmem explicito: el limite por defecto de Node es 32 MiB y subir N lo
// rebasaria en silencio, con un error confuso en pleno login.
const maxmemPara = (n: number, r: number) => 256 * n * r;

/** Devuelve un string autocontenido: scrypt$N$r$p$sal$hash, todo en base64. */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password mancante');
  }
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: maxmemPara(N, R) });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

/**
 * Comprueba una contrasena contra un hash guardado.
 *
 * Devuelve false ante cualquier problema en vez de lanzar: un documento
 * corrupto en la base de datos no debe tumbar el login con un 500, tiene que
 * ser simplemente una credencial que no valida.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (typeof password !== 'string' || typeof stored !== 'string') return false;

    const partes = stored.split('$');
    if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

    const n = Number(partes[1]);
    const r = Number(partes[2]);
    const p = Number(partes[3]);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

    // Cota defensiva: los parametros salen de la base de datos, y un N absurdo
    // en un documento manipulado reservaria memoria hasta tumbar el proceso.
    if (n < 1024 || n > 1048576 || r < 1 || r > 32 || p < 1 || p > 16) return false;

    const salt = Buffer.from(partes[4], 'base64');
    const esperado = Buffer.from(partes[5], 'base64');
    if (salt.length === 0 || esperado.length === 0) return false;

    // La longitud se toma del hash guardado, asi que los dos buffers miden
    // siempre lo mismo y timingSafeEqual nunca lanza por longitudes distintas.
    const calculado = await scryptAsync(password, salt, esperado.length, {
      N: n, r, p, maxmem: maxmemPara(n, r),
    });

    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

// ── Igualacion de tiempos ────────────────────────────────────────────────────

let hashSenuelo: string | null = null;

/**
 * Quema el mismo tiempo que una verificacion real.
 *
 * Sin esto, un email inexistente responderia en un milisegundo y uno que SI
 * existe con la contrasena mal tardaria ochenta: la diferencia es medible y
 * convierte el login en un detector de cuentas validas. Se llama cuando no se
 * ha encontrado al usuario, para que las dos ramas cuesten lo mismo.
 *
 * El senuelo se calcula una sola vez por proceso y se reutiliza.
 */
export async function burnPasswordTime(password: string): Promise<void> {
  if (!hashSenuelo) {
    hashSenuelo = await hashPassword(randomBytes(24).toString('hex'));
  }
  await verifyPassword(typeof password === 'string' ? password : '', hashSenuelo);
}
