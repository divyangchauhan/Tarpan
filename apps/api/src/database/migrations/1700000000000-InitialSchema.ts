import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enums
    await queryRunner.query(`
      CREATE TYPE "user_role_enum" AS ENUM ('ADMIN', 'USER')
    `);

    await queryRunner.query(`
      CREATE TYPE "case_status_enum" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED')
    `);

    await queryRunner.query(`
      CREATE TYPE "document_type_enum" AS ENUM ('DEATH_CERTIFICATE')
    `);

    await queryRunner.query(`
      CREATE TYPE "document_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')
    `);

    await queryRunner.query(`
      CREATE TYPE "institution_type_enum" AS ENUM (
        'SOCIAL_SECURITY_ADMINISTRATION',
        'MEDICARE',
        'IRS',
        'VETERANS_AFFAIRS',
        'STATE_DMV',
        'VOTER_REGISTRATION',
        'PASSPORT',
        'BANK',
        'CREDIT_CARD',
        'PENSION_401K',
        'LIFE_INSURANCE',
        'USPS',
        'SUBSCRIPTION_STREAMING',
        'SUBSCRIPTION_UTILITY',
        'EMPLOYER_HR',
        'PROFESSIONAL_LICENSE_BOARD'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "generated_document_status_enum" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED')
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "email"         VARCHAR NOT NULL,
        "passwordHash"  VARCHAR NOT NULL,
        "firstName"     VARCHAR NOT NULL,
        "lastName"      VARCHAR NOT NULL,
        "role"          "user_role_enum" NOT NULL DEFAULT 'USER',
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // Create cases table
    await queryRunner.query(`
      CREATE TABLE "cases" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "user_id"       UUID NOT NULL,
        "status"        "case_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "deceasedInfo"  JSONB NOT NULL,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cases" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_cases_user_id" ON "cases" ("user_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "cases"
        ADD CONSTRAINT "FK_cases_user_id"
        FOREIGN KEY ("user_id")
        REFERENCES "users"("id")
        ON DELETE CASCADE
        ON UPDATE NO ACTION
    `);

    // Create documents table
    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "case_id"       UUID NOT NULL,
        "type"          "document_type_enum" NOT NULL,
        "status"        "document_status_enum" NOT NULL DEFAULT 'PENDING',
        "s3Key"         VARCHAR NOT NULL,
        "extractedData" JSONB,
        "errorMessage"  VARCHAR,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_documents" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_documents_case_id" ON "documents" ("case_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "documents"
        ADD CONSTRAINT "FK_documents_case_id"
        FOREIGN KEY ("case_id")
        REFERENCES "cases"("id")
        ON DELETE CASCADE
        ON UPDATE NO ACTION
    `);

    // Create generated_documents table
    await queryRunner.query(`
      CREATE TABLE "generated_documents" (
        "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
        "case_id"           UUID NOT NULL,
        "document_id"       UUID NOT NULL,
        "institutionType"   "institution_type_enum" NOT NULL,
        "institutionName"   VARCHAR,
        "status"            "generated_document_status_enum" NOT NULL DEFAULT 'PENDING',
        "s3Key"             VARCHAR,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_generated_documents" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_generated_documents_case_id" ON "generated_documents" ("case_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_generated_documents_document_id" ON "generated_documents" ("document_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "generated_documents"
        ADD CONSTRAINT "FK_generated_documents_case_id"
        FOREIGN KEY ("case_id")
        REFERENCES "cases"("id")
        ON DELETE CASCADE
        ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "generated_documents"
        ADD CONSTRAINT "FK_generated_documents_document_id"
        FOREIGN KEY ("document_id")
        REFERENCES "documents"("id")
        ON DELETE CASCADE
        ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "generated_documents" DROP CONSTRAINT "FK_generated_documents_document_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "generated_documents" DROP CONSTRAINT "FK_generated_documents_case_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_generated_documents_document_id"`);
    await queryRunner.query(`DROP INDEX "IDX_generated_documents_case_id"`);
    await queryRunner.query(`DROP TABLE "generated_documents"`);

    await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "FK_documents_case_id"`);
    await queryRunner.query(`DROP INDEX "IDX_documents_case_id"`);
    await queryRunner.query(`DROP TABLE "documents"`);

    await queryRunner.query(`ALTER TABLE "cases" DROP CONSTRAINT "FK_cases_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_cases_user_id"`);
    await queryRunner.query(`DROP TABLE "cases"`);

    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(`DROP TYPE "generated_document_status_enum"`);
    await queryRunner.query(`DROP TYPE "institution_type_enum"`);
    await queryRunner.query(`DROP TYPE "document_status_enum"`);
    await queryRunner.query(`DROP TYPE "document_type_enum"`);
    await queryRunner.query(`DROP TYPE "case_status_enum"`);
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
  }
}
