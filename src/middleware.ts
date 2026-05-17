import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p));
  const isStaticResource =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.');

  if (isPublicPath || isStaticResource) return NextResponse.next();

  // API routes get a 401 JSON response; page routes get a login redirect.
  const isApiRoute = pathname.startsWith('/api/');

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
