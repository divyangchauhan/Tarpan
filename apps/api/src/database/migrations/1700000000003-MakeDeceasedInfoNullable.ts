import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeDeceasedInfoNullable1700000000003 implements MigrationInterface {
  name = 'MakeDeceasedInfoNullable1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cases"
        ALTER COLUMN "deceasedInfo" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "cases" SET "deceasedInfo" = '{}' WHERE "deceasedInfo" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "cases"
        ALTER COLUMN "deceasedInfo" SET NOT NULL
    `);
  }
}
