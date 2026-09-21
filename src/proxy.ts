import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

/**
 * Rutas que se sirven SIN sesión.
 *
 * `/privacy` y `/terms` tienen que ser públicas de verdad, y no por comodidad:
 * Google exige poder abrirlas —desde su propia infraestructura, sin ninguna
 * cookie— para publicar la aplicación OAuth. Si el proxy las mandara a
 * /login, Google vería una redirección en vez de la política y rechazaría la
 * publicación; y mientras la app no esté publicada, el refresh_token del
 * calendario caduca cada 7 días.
 *
 * Son dos páginas de texto legal: no enseñan ni un dato de la agencia.
 */
const PUBLIC_PATHS = ['/login', '/api/auth', '/privacy', '/terms'];

// Rutas que se autentican por su cuenta y no pueden depender de la cookie de
// sesión: el cron de Vercel invoca el endpoint sin navegador ni cookies, y el
// handler valida su propio CRON_SECRET (api/cron/purge-deleted/route.ts).
const SELF_AUTHENTICATED_PATHS = ['/api/cron/'];

// Extensiones de ficheros realmente estáticos. Deliberadamente NO se usa
// `pathname.includes('.')`: un punto dentro de un segmento dinámico
// (p. ej. /api/proprietari/a.b/immobili) no convierte la ruta en un asset, y
// esa heurística dejaba pasar peticiones sin autenticar hasta el route handler.
const STATIC_FILE_EXT =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|woff2?|ttf|otf|txt|xml|webmanifest)$/i;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isApiRoute = pathname.startsWith('/api/');

  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p));
  const isSelfAuthenticated = SELF_AUTHENTICATED_PATHS.some(p => pathname.startsWith(p));
  const isStaticResource =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    (!isApiRoute && STATIC_FILE_EXT.test(pathname));

  if (isPublicPath || isSelfAuthenticated || isStaticResource) return NextResponse.next();

  // API routes get a 401 JSON response; page routes get a login redirect.
  const sessionCookie = request.cookies.get('pantaleo_session');

  if (!sessionCookie?.value) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const payload = await verifySession(sessionCookie.value);

  if (!payload) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Token is forged, tampered, or expired — clear cookie and redirect
    const res = NextResponse.redirect(new URL('/login', request.url));
    res.cookies.set('pantaleo_session', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return res;
  }

  // /admin ya no existe como pantalla: la administracion vive dentro del home,
  // en su propia pestaña, que solo se pinta para el rol propietario.
  //
  // La redireccion se queda porque la URL puede estar en un marcador, en el
  // historial del navegador o en un enlace pegado en un chat. Mandar a la
  // portada es mejor que un 404, y no hace falta comprobar el rol aqui: quien
  // no sea propietario simplemente no vera la pestaña al llegar.
  //
  // El filtro por rol que habia aqui NO se ha aflojado, ha cambiado de sitio:
  // la barrera de verdad sigue estando en /api/admin/*, que comprueba el token
  // firmado en cada peticion. Esta linea solo evitaba una pantalla rota.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
