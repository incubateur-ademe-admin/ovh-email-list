import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { BASIC_AUTH_PASS, BASIC_AUTH_USER, APP_DOMAIN } from './lib/config';

const COOKIE_NAME = 'basic-auth';
const COOKIE_MAX_AGE = 5 * 60; // 5 minutes en secondes

export function middleware(req: NextRequest) {
  const cookie = req.cookies.get('basic-auth');
  const authHeader = req.headers.get('authorization');

  const resAuth = new NextResponse('Auth required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Protected Area"',
    },
  });

  // Si le cookie est présent → ne PAS regarder le header
  if (cookie?.value !== '1') {
    resAuth.cookies.set({
      name: COOKIE_NAME,
      value: '1',
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
      domain: process.env.NODE_ENV === 'production' ? APP_DOMAIN : undefined, // Remplacez par votre domaine de production
    });
    return resAuth;
  } else if (authHeader){
    const base64 = authHeader.split(' ')[1];
    const [user, pass] = atob(base64).split(':');
    if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
      return NextResponse.next();
    }
  }

  return resAuth;
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'], // Protège toutes les routes sauf les assets
};
