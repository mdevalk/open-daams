import { randomBytes } from 'crypto';

// Bitcoin/base58btc alphabet — excludes 0/O/I/l to avoid visual ambiguity,
// same alphabet a real did:key multibase encoding would use.
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Sample/placeholder identity for the data-holder writer, researcher, and
// output-controller roles (StorageLocation.writerDid, AuthorizedPerson.did)
// — syntactically did:key-shaped, but not derived from a real Ed25519
// keypair. No proof-of-possession is verifiable against it; it's a tracked
// reference, same convention as SpeProvisioningOrder.environmentReference.
export function generateSampleDid(): string {
  const bytes = randomBytes(32);
  let id = '';
  for (const byte of bytes) id += BASE58_ALPHABET[byte % BASE58_ALPHABET.length];
  return `did:key:z${id}`;
}
