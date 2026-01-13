import crypto from 'crypto';

if (process.argv.length < 4) {
  console.error('Usage: node scripts/verify_hash.js <password> <hash>');
  process.exit(2);
}

const pw = process.argv[2];
const hash = process.argv[3];

if (!hash.startsWith('pbkdf2$')) {
  console.error('Hash must be in format pbkdf2$iterations$saltHex$hashHex');
  process.exit(2);
}

const [, iterStr, saltHex, hashHex] = hash.split('$');
const iterations = parseInt(iterStr, 10) || 310000;
const salt = Buffer.from(saltHex, 'hex');
const expected = Buffer.from(hashHex, 'hex');
const derived = crypto.pbkdf2Sync(pw, salt, iterations, expected.length, 'sha256');

const ok = crypto.timingSafeEqual(derived, expected);
console.log(ok ? 'MATCH' : 'NO_MATCH');
process.exit(ok ? 0 : 1);
