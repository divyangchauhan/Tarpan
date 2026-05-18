import {
  decryptSsn,
  encryptSsn,
  isEncryptedSsn,
  resetSsnKeyCache,
} from './ssn-crypto';

const TEST_KEY = 'HbC+AoHGV5J9Icn7j7/laNhewPQve8+MJiBK4r2UKdw='; // base64 32 bytes
const SSN = '123-45-6789';

describe('ssn-crypto', () => {
  beforeAll(() => {
    process.env['SSN_ENCRYPTION_KEY'] = TEST_KEY;
    resetSsnKeyCache();
  });

  it('round-trips a plaintext SSN', () => {
    expect(decryptSsn(encryptSsn(SSN))).toBe(SSN);
  });

  it('produces an enc:v1: tagged value that is not the plaintext', () => {
    const enc = encryptSsn(SSN);
    expect(enc).not.toBe(SSN);
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(isEncryptedSsn(enc)).toBe(true);
  });

  it('uses a fresh IV per call (same input → different ciphertext)', () => {
    expect(encryptSsn(SSN)).not.toBe(encryptSsn(SSN));
  });

  it('is idempotent — re-encrypting an encrypted value is a no-op', () => {
    const once = encryptSsn(SSN);
    const twice = encryptSsn(once);
    expect(twice).toBe(once);
    expect(decryptSsn(twice)).toBe(SSN);
  });

  it('passes legacy plaintext through decrypt unchanged', () => {
    expect(decryptSsn(SSN)).toBe(SSN);
    expect(isEncryptedSsn(SSN)).toBe(false);
  });

  it('throws on a tampered ciphertext (GCM auth failure)', () => {
    const enc = encryptSsn(SSN);
    const tampered = enc.slice(0, -4) + (enc.endsWith('A') ? 'B===' : 'A===');
    expect(() => decryptSsn(tampered)).toThrow();
  });

  it('throws on a malformed encrypted payload', () => {
    expect(() => decryptSsn('enc:v1:onlyonepart')).toThrow(/Malformed/);
  });

  describe('key validation', () => {
    const original = process.env['SSN_ENCRYPTION_KEY'];

    afterEach(() => {
      process.env['SSN_ENCRYPTION_KEY'] = original;
      resetSsnKeyCache();
    });

    it('throws when SSN_ENCRYPTION_KEY is missing', () => {
      delete process.env['SSN_ENCRYPTION_KEY'];
      resetSsnKeyCache();
      expect(() => encryptSsn(SSN)).toThrow(/not set/);
    });

    it('throws when the key is not 32 bytes', () => {
      process.env['SSN_ENCRYPTION_KEY'] = Buffer.from('too-short').toString('base64');
      resetSsnKeyCache();
      expect(() => encryptSsn(SSN)).toThrow(/32 bytes/);
    });
  });
});
