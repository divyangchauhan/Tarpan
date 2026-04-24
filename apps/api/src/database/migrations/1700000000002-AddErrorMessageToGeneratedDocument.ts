import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddErrorMessageToGeneratedDocument1700000000002 implements MigrationInterface {
  name = 'AddErrorMessageToGeneratedDocument1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "generated_documents"
        ADD COLUMN IF NOT EXISTS "errorMessage" VARCHAR
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "generated_documents"
        DROP COLUMN IF EXISTS "errorMessage"
    `);
  }
}
