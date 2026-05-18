import { resetSsnKeyCache } from './ssn-crypto';
import { ssnJsonbTransformer } from './ssn-jsonb.transformer';

const TEST_KEY = 'HbC+AoHGV5J9Icn7j7/laNhewPQve8+MJiBK4r2UKdw=';

interface Payload {
  firstName?: string;
  socialSecurityNumber?: string;
}

describe('ssnJsonbTransformer', () => {
  const t = ssnJsonbTransformer<Payload>();

  beforeAll(() => {
    process.env['SSN_ENCRYPTION_KEY'] = TEST_KEY;
    resetSsnKeyCache();
  });

  it('encrypts only socialSecurityNumber on write, leaving siblings intact', () => {
    const input: Payload = { firstName: 'Ada', socialSecurityNumber: '123-45-6789' };
    const stored = t.to(input) as Payload;

    expect(stored.firstName).toBe('Ada');
    expect(stored.socialSecurityNumber).not.toBe('123-45-6789');
    expect(stored.socialSecurityNumber!.startsWith('enc:v1:')).toBe(true);
  });

  it('decrypts socialSecurityNumber on read', () => {
    const stored = t.to({ socialSecurityNumber: '987-65-4321' }) as Payload;
    expect((t.from(stored) as Payload).socialSecurityNumber).toBe('987-65-4321');
  });

  it('round-trips through write then read', () => {
    const input: Payload = { firstName: 'Grace', socialSecurityNumber: '111-22-3333' };
    expect(t.from(t.to(input))).toEqual(input);
  });

  it('does not mutate the input object', () => {
    const input: Payload = { socialSecurityNumber: '123-45-6789' };
    t.to(input);
    expect(input.socialSecurityNumber).toBe('123-45-6789');
  });

  it.each([null, undefined])('passes %s through unchanged', (value) => {
    expect(t.to(value as never)).toBe(value);
    expect(t.from(value as never)).toBe(value);
  });

  it('passes a payload without an SSN through unchanged', () => {
    const input: Payload = { firstName: 'Linus' };
    expect(t.to(input)).toEqual(input);
    expect(t.from(input)).toEqual(input);
  });
});
