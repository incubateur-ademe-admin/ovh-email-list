import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { BASIC_AUTH_PASS, BASIC_AUTH_USER } from './lib/config';

export function middleware(req: NextRequest) {
  const authHeader = req.headers.get('authorization');

  if (authHeader) {
    const base64 = authHeader.split(' ')[1];
    const [user, pass] = atob(base64).split(':');

    if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
      return NextResponse.next(); // OK
    }
  }

  return new NextResponse('Auth required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Protected Area"',
    },
  });
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'], // Protège toutes les routes sauf les assets
};
