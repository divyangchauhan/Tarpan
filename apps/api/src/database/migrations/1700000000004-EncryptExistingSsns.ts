import { MigrationInterface, QueryRunner } from 'typeorm';
import { decryptSsn, encryptSsn } from '../../common/crypto/ssn-crypto';

/**
 * P6-09 backfill: encrypt plaintext SSNs already stored in
 * documents.extractedData and cases.deceasedInfo.
 *
 * Idempotent — the `enc:v1:` prefix check (inside encryptSsn/decryptSsn) means
 * re-running up() never double-encrypts and down() never double-decrypts.
 */
export class EncryptExistingSsns1700000000004 implements MigrationInterface {
  name = 'EncryptExistingSsns1700000000004';

  private async transform(
    queryRunner: QueryRunner,
    table: 'documents' | 'cases',
    column: 'extractedData' | 'deceasedInfo',
    map: (ssn: string) => string,
  ): Promise<void> {
    const result: unknown = await queryRunner.query(
      `SELECT id, "${column}"->>'socialSecurityNumber' AS ssn
         FROM "${table}"
        WHERE "${column}"->>'socialSecurityNumber' IS NOT NULL`,
    );
    const rows = result as Array<{ id: string; ssn: string }>;

    for (const { id, ssn } of rows) {
      const next = map(ssn);
      if (next === ssn) continue;
      await queryRunner.query(
        `UPDATE "${table}"
            SET "${column}" = jsonb_set("${column}", '{socialSecurityNumber}', to_jsonb($1::text))
          WHERE id = $2`,
        [next, id],
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.transform(queryRunner, 'documents', 'extractedData', encryptSsn);
    await this.transform(queryRunner, 'cases', 'deceasedInfo', encryptSsn);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.transform(queryRunner, 'documents', 'extractedData', decryptSsn);
    await this.transform(queryRunner, 'cases', 'deceasedInfo', decryptSsn);
  }
}
