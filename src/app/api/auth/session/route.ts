import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('pantaleo_session');

    if (!sessionCookie?.value) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const payload = await verifySession(sessionCookie.value);

    if (!payload) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      email: payload.email,
      nome: payload.nome,
      ruolo: payload.ruolo,
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
