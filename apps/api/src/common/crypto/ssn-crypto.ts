import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Application-layer encryption for Social Security Numbers (P6-09).
 *
 * Format of an encrypted value:
 *   enc:v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
 *
 * The `enc:v1:` prefix makes the scheme self-describing so that:
 *  - encryption is idempotent (already-encrypted values pass through unchanged),
 *  - decryption tolerates legacy plaintext rows (passed through unchanged),
 *    which keeps the backfill migration safe to run mid-deploy.
 */

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

/**
 * Reads and validates the AES-256 key from SSN_ENCRYPTION_KEY (base64, 32 bytes).
 * Lazily resolved + cached so the value is read after ConfigModule has loaded
 * the .env file into process.env, and so missing-key failures are loud.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env['SSN_ENCRYPTION_KEY'];
  if (!raw) {
    throw new Error('SSN_ENCRYPTION_KEY is not set — cannot encrypt/decrypt SSNs');
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SSN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (base64), got ${key.length}`,
    );
  }

  cachedKey = key;
  return key;
}

/** Test-only: clear the cached key so a new SSN_ENCRYPTION_KEY can take effect. */
export function resetSsnKeyCache(): void {
  cachedKey = null;
}

export function isEncryptedSsn(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Encrypts a plaintext SSN. Already-encrypted input is returned unchanged. */
export function encryptSsn(plaintext: string): string {
  if (isEncryptedSsn(plaintext)) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString(
    'base64',
  )}`;
}

/** Decrypts an encrypted SSN. Non-prefixed (legacy plaintext) input passes through. */
export function decryptSsn(value: string): string {
  if (!isEncryptedSsn(value)) return value;

  const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(':');
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('Malformed encrypted SSN payload');
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
