import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsApprovedToUsers1700000000003 implements MigrationInterface {
  name = 'AddIsApprovedToUsers1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT false
    `);
    // Approve all pre-existing users so nobody is locked out by this migration.
    await queryRunner.query(`
      UPDATE "users" SET "isApproved" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "isApproved"
    `);
  }
}
