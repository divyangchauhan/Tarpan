import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExecutorInfoToCase1700000000001 implements MigrationInterface {
  name = 'AddExecutorInfoToCase1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cases"
        ADD COLUMN "executorInfo" JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cases"
        DROP COLUMN "executorInfo"
    `);
  }
}
