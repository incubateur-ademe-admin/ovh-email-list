import crypto from 'crypto';

function makeHash(password: string, iterations = 310000, keylen = 32) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(password, salt, iterations, keylen, 'sha256');
  return `pbkdf2$${iterations}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

if (require.main === module) {
  const pw = process.argv[2];
  if (!pw) {
    console.error('Usage: node scripts/make_hash <password>');
    process.exit(2);
  }
  const hash = makeHash(pw);
  console.log(hash);
  console.log('');
  console.log('# Add this to your .env:');
  console.log(`BASIC_AUTH_HASH=${hash}`);
}

export { makeHash };
