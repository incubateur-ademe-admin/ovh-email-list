import { COOKIE_SECRET } from './config';

type VerifyResult = { valid: boolean; expired?: boolean };

// No top-level Node crypto imports to keep module Edge-safe on import; functions load crypto dynamically.

export async function createSignedCookieValue(maxAgeSeconds: number) {
  const payload = JSON.stringify({ v: 1, exp: Date.now() + maxAgeSeconds * 1000 });
  const b64 = Buffer.from(payload).toString('base64');
  // use async dynamic import for crypto
  const { createHmac } = await import('crypto');
  const sig = createHmac('sha256', COOKIE_SECRET || '').update(b64).digest('hex');
  return `${b64}.${sig}`;
}

export async function verifySignedCookieValue(value: string): Promise<VerifyResult> {
  if (!value || !COOKIE_SECRET) return { valid: false };
  const parts = value.split('.');
  if (parts.length !== 2) return { valid: false };
  const [b64, sigHex] = parts;

  try {
    const crypto = await import('crypto');
    const expected = crypto.createHmac('sha256', COOKIE_SECRET || '').update(b64).digest('hex');
    const sigBuf = Buffer.from(sigHex, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expectedBuf.length) return { valid: false };
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return { valid: false };

    const payload = JSON.parse(Buffer.from(b64, 'base64').toString());
    if (typeof payload.exp !== 'number') return { valid: false };
    if (payload.exp < Date.now()) return { valid: false, expired: true };
    return { valid: true };
  } catch {
    return { valid: false };
  }
}

// Verify password. Supports `BASIC_AUTH_HASH` with format
// `pbkdf2$iterations$saltHex$hashHex`
export async function verifyPassword(password: string): Promise<boolean> {
  const rawHashEnv = process.env.BASIC_AUTH_HASH;
  const hashEnv = rawHashEnv ? rawHashEnv.trim().replace(/^"|"$/g, '') : rawHashEnv;

  if (hashEnv && hashEnv.startsWith('pbkdf2$')) {
    try {
      const [, iterStr, saltHex, hashHex] = hashEnv.split('$');
      const iterations = parseInt(iterStr, 10) || 310000;
      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(hashHex, 'hex');
      // dynamic import of crypto
      const crypto = await import('crypto');
      const derived = crypto.pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  return false;
}
