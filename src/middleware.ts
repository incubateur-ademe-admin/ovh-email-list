import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { APP_DOMAIN, COOKIE_NAME, IS_PRODUCTION } from './lib/config';


export function middleware(req: NextRequest) {
  // experimental: support for Chrome DevTools
  if (req.url.includes("/.well-known/appspecific/com.chrome.devtools.json") && !IS_PRODUCTION) {
    console.log("Serving Chrome DevTools configuration");
    return NextResponse.json({
      workspace: {
        root: import.meta.url.replace("file://", "").replace("src/middleware.ts", ""),
        uuid: crypto.randomUUID(),
      },
      deployment: {
        url: APP_DOMAIN,
      },
    });
  }

  const cookie = req.cookies.get(COOKIE_NAME);

  if (cookie?.value === '1') {
    // Si le cookie est présent, on autorise l'accès
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/login', req.url));

  // const resAuth = new NextResponse('Auth required', {
  //   status: 401,
  //   headers: {
  //     'WWW-Authenticate': 'Basic realm="Protected Area"',
  //   },
  // });

  // // Si le cookie est présent → ne PAS regarder le header
  // if (cookie?.value !== '1') {
  //   resAuth.cookies.set({
  //     name: COOKIE_NAME,
  //     value: '1',
  //     maxAge: COOKIE_MAX_AGE,
  //     httpOnly: true,
  //     secure: process.env.NODE_ENV === 'production',
  //     path: '/',
  //     sameSite: 'lax',
  //     domain: process.env.NODE_ENV === 'production' ? APP_DOMAIN : undefined, // Remplacez par votre domaine de production
  //   });
  //   return resAuth;
  // } else if (authHeader){
  //   const base64 = authHeader.split(' ')[1];
  //   const [user, pass] = atob(base64).split(':');
  //   if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
  //     return NextResponse.next();
  //   }
  // }

  // return resAuth;
}

export const config = {
  matcher: ['/((?!api|_next/|_static|login|[\\w-]+\\.\\w+).*)'], // Protège toutes les routes sauf les assets et login
};
