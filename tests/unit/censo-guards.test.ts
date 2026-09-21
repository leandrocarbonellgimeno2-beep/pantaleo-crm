import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CENSO DE GUARDS: todo manejador HTTP de `src/app/api` comprueba permisos.
 *
 * Este test no prueba una ruta concreta, prueba que no se olvide NINGUNA. Nace
 * de un olvido real: los cuatro GET de `/api/idealista/*` se quedaron sin
 * `guard()` mientras sus hermanos POST/PUT/DELETE, en el MISMO fichero, sí lo
 * llevaban. No era una decisión, era un descuido, y ningún test lo veía porque
 * todos los que había miraban rutas concretas.
 *
 * Qué se colaba por ese hueco: el proxy (src/proxy.ts) ya exige cookie válida
 * para todo `/api/*`, así que un desconocido recibía 401 igualmente. Lo que
 * NO se comprobaba es lo único que vive dentro de `guard()`: la cuenta
 * BLOQUEADA y el rol VIVO de `_users`. O sea que a un empleado despedido, o
 * degradado, el resto del CRM ya le decía que no y esas cuatro rutas le seguían
 * contestando mientras le durase la cookie.
 *
 * Es un censo ESTÁTICO —lee el código fuente— a propósito. Un test de
 * integración por ruta exigiría simular la API de Idealista y, sobre todo,
 * habría que acordarse de escribirlo para cada ruta nueva: justo la clase de
 * olvido que este fichero existe para cazar. Aquí, una ruta nueva sin guard
 * rompe el test el día que se escribe.
 *
 * La lista de EXENTAS es explícita y cada entrada lleva su porqué. Añadir algo
 * ahí es una decisión consciente que se lee en la revisión; olvidarse un guard
 * no lo es.
 */

const RAIZ_API = join(process.cwd(), 'src', 'app', 'api');

const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * Manejadores que NO deben llevar `guard()`, con el motivo. La clave es
 * `<ruta relativa sin route.ts>:<MÉTODO>`.
 */
const EXENTAS: Record<string, string> = {
  'auth/login:POST':
    'Es el login. Exigir sesión para iniciar sesión no tendría sentido; valida credenciales y tiene rate-limit propio.',
  'auth/logout:POST':
    'Solo borra la cookie. Un bloqueado debe poder cerrar sesión.',
  'auth/session:GET':
    'Devuelve únicamente lo que ya lleva la cookie firmada de quien pregunta. No consulta Firestore.',
  'cron/purge-deleted:GET':
    'La invoca Vercel Cron sin navegador ni cookies. Se autentica con CRON_SECRET y rechaza si la variable no está puesta.',
  'account/password:POST':
    'requireAuth sin rol, deliberado: el email sale de la sesión, exige la contraseña actual y tiene rate-limit. Cualquier rol debe poder cambiar la suya.',
  'presence/heartbeat:POST':
    'requireAuth sin rol: el email sale de la sesión y solo escribe su propio latido.',
};

function ficherosDeRuta(): string[] {
  return readdirSync(RAIZ_API, { recursive: true, encoding: 'utf8' })
    .filter((p) => p.endsWith('route.ts'))
    .map((p) => p.split('\\').join('/'));
}

/**
 * Trocea el fichero en un bloque por manejador exportado, y saca el NOMBRE del
 * parámetro de cada uno.
 *
 * Lo del nombre no es quisquillosidad: `/api/upload` llama a `guard(req, …)` y
 * no a `guard(request, …)`. Buscar el literal «guard(request» daba esas dos
 * rutas por desprotegidas cuando sí lo están. Un censo con falsos positivos se
 * acaba desactivando, y entonces tampoco caza los verdaderos.
 */
function manejadores(fuente: string): Array<{ metodo: string; parametro: string; cuerpo: string }> {
  const marcas: Array<{ metodo: string; parametro: string; desde: number }> = [];

  for (const metodo of METODOS) {
    const aguja = `export async function ${metodo}(`;
    let i = fuente.indexOf(aguja);
    while (i !== -1) {
      const abre = i + aguja.length;
      const cierra = fuente.indexOf(')', abre);
      // «req: NextRequest» o «request: Request» → nos quedamos con el nombre.
      const parametro = fuente.slice(abre, cierra).split(':')[0].trim();
      marcas.push({ metodo, parametro, desde: i });
      i = fuente.indexOf(aguja, i + 1);
    }
  }

  marcas.sort((a, b) => a.desde - b.desde);

  return marcas.map((m, i) => ({
    metodo: m.metodo,
    parametro: m.parametro,
    // Hasta el siguiente manejador, o hasta el final si es el último.
    cuerpo: fuente.slice(m.desde, i + 1 < marcas.length ? marcas[i + 1].desde : undefined),
  }));
}

describe('censo de guards en src/app/api', () => {
  const rutas = ficherosDeRuta();

  it('hay rutas que censar (si esto falla, el censo mira donde no es)', () => {
    expect(rutas.length).toBeGreaterThan(20);
  });

  it('todo manejador HTTP comprueba permisos, o está exento con motivo', () => {
    const sinGuard: string[] = [];

    for (const ruta of rutas) {
      const fuente = readFileSync(join(RAIZ_API, ruta), 'utf8');
      const nombre = ruta.slice(0, -'/route.ts'.length);

      for (const { metodo, parametro, cuerpo } of manejadores(fuente)) {
        const clave = `${nombre}:${metodo}`;
        if (clave in EXENTAS) continue;

        // `guard()` cubre rol vivo + bloqueo. `requireAuth`/`requireRole` solo
        // valen donde la exención lo justifica, y esas ya están arriba.
        //
        // Se exige `await guard(<su propio parámetro>`: así no cuela un guard
        // nombrado en un comentario, ni uno al que se le pase otra cosa.
        if (!cuerpo.includes(`await guard(${parametro}`)) sinGuard.push(clave);
      }
    }

    expect(
      sinGuard,
      `Estos manejadores no llaman a guard(). Si es un olvido, añade ` +
        `«const denegado = await guard(request, '<rol>'); if (denegado) return denegado;». ` +
        `Si es deliberado, añádelo a EXENTAS con su motivo:\n  ${sinGuard.join('\n  ')}`,
    ).toEqual([]);
  });

  it('la lista de exentas no se queda con entradas fantasma', () => {
    // Una exención que ya no corresponde a ningún manejador es una exención
    // que nadie revisa. Si la ruta se borró o se renombró, sobra.
    const existentes = new Set<string>();

    for (const ruta of rutas) {
      const fuente = readFileSync(join(RAIZ_API, ruta), 'utf8');
      const nombre = ruta.slice(0, -'/route.ts'.length);
      for (const { metodo } of manejadores(fuente)) existentes.add(`${nombre}:${metodo}`);
    }

    const fantasma = Object.keys(EXENTAS).filter((k) => !existentes.has(k));
    expect(fantasma, `exenciones que ya no apuntan a ningún manejador: ${fantasma.join(', ')}`).toEqual([]);
  });

  it('los cuatro GET de idealista llevan guard: es el olvido que originó el censo', () => {
    for (const n of ['contacts', 'dry-run', 'images', 'properties']) {
      const fuente = readFileSync(join(RAIZ_API, 'idealista', n, 'route.ts'), 'utf8');
      const get = manejadores(fuente).find((m) => m.metodo === 'GET');
      expect(get, `idealista/${n} deberia exportar un GET`).toBeTruthy();
      expect(get!.cuerpo, `idealista/${n} GET sin guard`).toContain("guard(request, 'secretaria')");
    }
  });

  it('cada GET de idealista exige lo mismo que sus hermanos que escriben', () => {
    // El sintoma del olvido era la incoherencia DENTRO del mismo fichero:
    // POST/PUT/DELETE a 'secretaria' y el GET a nada. Que lean quienes escriben.
    for (const n of ['contacts', 'images', 'properties']) {
      const fuente = readFileSync(join(RAIZ_API, 'idealista', n, 'route.ts'), 'utf8');
      const niveles = new Set(
        manejadores(fuente)
          .map((m) => m.cuerpo.match(/guard\(request, '([a-z]+)'\)/)?.[1])
          .filter(Boolean),
      );
      expect([...niveles], `idealista/${n} mezcla niveles entre metodos`).toEqual(['secretaria']);
    }
  });
});
