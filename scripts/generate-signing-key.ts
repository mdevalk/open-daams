import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { concatBytes } from '@noble/hashes/utils';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

// Required by @noble/ed25519 v2's sync sign/verify (no Web Crypto dependency).
ed.etc.sha512Sync = (...m) => sha512(m.length === 1 ? m[0] : concatBytes(...m));

const KEY_DIR = path.join(process.cwd(), 'keys');
const KEY_PATH = path.join(KEY_DIR, 'permit-signing-key.private.json');

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function main() {
  const force = process.argv.includes('--force');

  if (existsSync(KEY_PATH) && !force) {
    console.error(`A signing key already exists at ${KEY_PATH}.`);
    console.error('Re-running would orphan every signature issued with the current key.');
    console.error('Pass --force to overwrite anyway.');
    process.exit(1);
  }

  const privateKeyBytes = ed.utils.randomPrivateKey();
  const publicKeyBytes = ed.getPublicKey(privateKeyBytes);
  const year = new Date().getFullYear();
  const kid = `hdab-nl-signing-key-${year}-v1`;

  const jwk = {
    key_ops: ['sign'],
    ext: true,
    alg: 'Ed25519',
    crv: 'Ed25519',
    d: toBase64Url(privateKeyBytes),
    x: toBase64Url(publicKeyBytes),
    kty: 'OKP',
    kid,
    use: 'sig',
  };

  mkdirSync(KEY_DIR, { recursive: true });
  writeFileSync(KEY_PATH, JSON.stringify(jwk, null, 2) + '\n');

  console.log(`Generated a new permit-signing keypair at ${KEY_PATH} (kid: ${kid}).`);
  console.log('This file is gitignored — keep it out of version control.');
}

main();
