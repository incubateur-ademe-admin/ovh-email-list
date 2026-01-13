import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { APP_DOMAIN, COOKIE_NAME, IS_PRODUCTION, COOKIE_SECRET } from './lib/config';

// Edge runtime safe verification using Web Crypto
async function verifySignedCookieValueEdge(value: string) {
  if (!value || !COOKIE_SECRET) return { valid: false };
  const parts = value.split('.');
  if (parts.length !== 2) return { valid: false };
  const [b64, sigHex] = parts;

  // hex to Uint8Array
  const hexToBytes = (hex: string) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  };

  try {
    const keyData = new TextEncoder().encode(COOKIE_SECRET);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sig = hexToBytes(sigHex);
    const data = new TextEncoder().encode(b64);
    const ok = await crypto.subtle.verify('HMAC', cryptoKey, sig, data);
    if (!ok) return { valid: false };

    const payloadJson = atob(b64);
    const payload = JSON.parse(payloadJson);
    if (typeof payload.exp !== 'number') return { valid: false };
    if (payload.exp < Date.now()) return { valid: false, expired: true };
    return { valid: true };
  } catch {
    return { valid: false };
  }
}


export async function middleware(req: NextRequest) {
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

  if (cookie?.value) {
    const { valid, expired } = await verifySignedCookieValueEdge(cookie.value);
    if (valid) return NextResponse.next();
    if (expired) {
      const returnTo = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
      return NextResponse.redirect(new URL(`/login?expired=1&returnTo=${returnTo}`, req.url));
    }
  }

  // Not authenticated: include returnTo so user returns to same page after login
  const returnTo = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(new URL(`/login?returnTo=${returnTo}`, req.url));

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
