import { scryptAsync } from '@noble/hashes/scrypt.js';
import { hex } from '@better-auth/utils/hex';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const config = { N: 16384, r: 16, p: 1, dkLen: 64 };

async function generateKey(password, salt) {
  return await scryptAsync(password.normalize('NFKC'), salt, {
    N: config.N,
    p: config.p,
    r: config.r,
    dkLen: config.dkLen,
    maxmem: 128 * config.N * config.r * 2,
  });
}

async function hashPassword(password) {
  const salt = hex.encode(webcrypto.getRandomValues(new Uint8Array(16)));
  const key = await generateKey(password, salt);
  return salt + ':' + hex.encode(key);
}

hashPassword('lmtm2026!').then((h) => console.log(h));
