import { ValueTransformer } from 'typeorm';
import { decryptSsn, encryptSsn } from './ssn-crypto';

interface WithSsn {
  socialSecurityNumber?: string;
}

/**
 * TypeORM column transformer for JSONB columns whose payload contains a
 * `socialSecurityNumber` field (Document.extractedData, Case.deceasedInfo).
 *
 * Encrypts the SSN on write and decrypts it on read, leaving every other
 * field untouched. The original object is never mutated.
 */
export function ssnJsonbTransformer<T extends WithSsn>(): ValueTransformer {
  return {
    to(value: T | null | undefined): T | null | undefined {
      if (!value || !value.socialSecurityNumber) return value;
      return { ...value, socialSecurityNumber: encryptSsn(value.socialSecurityNumber) };
    },
    from(value: T | null | undefined): T | null | undefined {
      if (!value || !value.socialSecurityNumber) return value;
      return { ...value, socialSecurityNumber: decryptSsn(value.socialSecurityNumber) };
    },
  };
}
