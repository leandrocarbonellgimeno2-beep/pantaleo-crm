import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth'];

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

export async function middleware(request: NextRequest) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
