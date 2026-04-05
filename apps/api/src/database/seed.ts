/**
 * Demo seed script — populates the database with a realistic AfterLight demo case.
 *
 * Usage:
 *   cd apps/api && pnpm ts-node -r tsconfig-paths/register src/database/seed.ts
 *
 * Requires a running PostgreSQL instance (docker compose up -d).
 * Safe to run multiple times: existing demo data is deleted and re-created.
 */

/* eslint-disable no-console */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from './data-source';
import { UserEntity } from '../entities/user.entity';
import { CaseEntity } from '../entities/case.entity';
import { DocumentEntity } from '../entities/document.entity';
import { GeneratedDocumentEntity } from '../entities/generated-document.entity';
import {
  CaseStatus,
  DocumentStatus,
  DocumentType,
  GeneratedDocumentStatus,
  InstitutionType,
  UserRole,
} from '@afterlight/shared';

const DEMO_EMAIL = 'demo@afterlight.app';
const DEMO_PASSWORD = 'AfterLight2024!';

async function seed(): Promise<void> {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(UserEntity);
  const caseRepo = AppDataSource.getRepository(CaseEntity);
  const documentRepo = AppDataSource.getRepository(DocumentEntity);
  const generatedDocRepo = AppDataSource.getRepository(GeneratedDocumentEntity);

  console.log('🌱  Seeding demo data…');

  // ── 1. Demo user ──────────────────────────────────────────────────────────
  let user = await userRepo.findOne({ where: { email: DEMO_EMAIL } });
  if (user) {
    // Clean up existing demo data before re-seeding
    const existingCases = await caseRepo.find({ where: { userId: user.id } });
    await Promise.all(
      existingCases.flatMap((c) => [
        generatedDocRepo.delete({ caseId: c.id }),
        documentRepo.delete({ caseId: c.id }),
      ]),
    );
    await caseRepo.delete({ userId: user.id });
    console.log('  ↻  Cleared existing demo data');
  } else {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    user = userRepo.create({
      email: DEMO_EMAIL,
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Mitchell',
      role: UserRole.USER,
    });
    user = await userRepo.save(user);
    console.log(`  ✓  Created demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  // ── 2. Demo case ──────────────────────────────────────────────────────────
  const demoCase = await caseRepo.save(
    caseRepo.create({
      userId: user.id,
      status: CaseStatus.ACTIVE,
      deceasedInfo: {
        firstName: 'Robert',
        middleName: 'James',
        lastName: 'Mitchell',
        dateOfBirth: '1942-07-14',
        dateOfDeath: '2024-11-03',
        placeOfDeath: 'Springfield, Illinois',
      },
      executorInfo: {
        name: 'Sarah Mitchell',
        address: '412 Maple Avenue\nSpringfield, IL 62704',
        relationship: 'Daughter',
        phone: '(217) 555-0198',
        email: DEMO_EMAIL,
      },
    }),
  );
  console.log(`  ✓  Created demo case: ${demoCase.id}`);

  // ── 3. Processed death certificate ────────────────────────────────────────
  const certDocEntity: DocumentEntity = documentRepo.create({
    caseId: demoCase.id,
    type: DocumentType.DEATH_CERTIFICATE,
    status: DocumentStatus.PROCESSED,
    s3Key: `cases/${demoCase.id}/documents/death-certificate.pdf`,
    // The Python processor writes snake_case fields directly into the JSONB column.
    // ExtractedCertificateData uses camelCase for TypeScript consumers, but the raw
    // DB value (and what the seed must produce) mirrors the Python output exactly.
    // TODO: add a transformation layer so the stored shape matches the TS type.
    extractedData: {
      full_name: 'Robert James Mitchell',
      first_name: 'Robert',
      middle_name: 'James',
      last_name: 'Mitchell',
      date_of_birth: '1942-07-14',
      date_of_death: '2024-11-03',
      place_of_death: 'Springfield, Sangamon County, Illinois',
      state: 'IL',
      certificate_number: '2024-IL-SG-048271',
      certifier_name: 'Dr. Patricia Chen',
      certifier_title: 'Attending Physician',
    } as unknown as import('../entities/document.entity').DocumentEntity['extractedData'],
  });
  const certDoc = await documentRepo.save(certDocEntity);
  console.log(`  ✓  Created processed document: ${certDoc.id}`);

  // ── 4. Generated documents (mix of READY and GENERATING) ──────────────────
  const demoInstitutions: Array<{
    institutionType: InstitutionType;
    institutionName?: string;
    status: GeneratedDocumentStatus;
    s3Key?: string;
  }> = [
    {
      institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION,
      status: GeneratedDocumentStatus.READY,
      s3Key: `generated/${demoCase.id}/ssa-721/${demoCase.id}-ssa.pdf`,
    },
    {
      institutionType: InstitutionType.MEDICARE,
      status: GeneratedDocumentStatus.READY,
      s3Key: `generated/${demoCase.id}/medicare/${demoCase.id}-medicare.pdf`,
    },
    {
      institutionType: InstitutionType.IRS,
      status: GeneratedDocumentStatus.READY,
      s3Key: `generated/${demoCase.id}/irs-notification/${demoCase.id}-irs.pdf`,
    },
    {
      institutionType: InstitutionType.BANK,
      institutionName: 'First National Bank of Springfield',
      status: GeneratedDocumentStatus.READY,
      s3Key: `generated/${demoCase.id}/bank-closure/${demoCase.id}-bank.pdf`,
    },
    {
      institutionType: InstitutionType.LIFE_INSURANCE,
      institutionName: 'Midwestern Life Insurance Co.',
      status: GeneratedDocumentStatus.READY,
      s3Key: `generated/${demoCase.id}/life-insurance/${demoCase.id}-life.pdf`,
    },
    {
      institutionType: InstitutionType.STATE_DMV,
      status: GeneratedDocumentStatus.GENERATING,
    },
    {
      institutionType: InstitutionType.VOTER_REGISTRATION,
      status: GeneratedDocumentStatus.GENERATING,
    },
  ];

  for (const inst of demoInstitutions) {
    await generatedDocRepo.save(
      generatedDocRepo.create({
        caseId: demoCase.id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        documentId: certDoc.id,
        institutionType: inst.institutionType,
        institutionName: inst.institutionName ?? null,
        status: inst.status,
        s3Key: inst.s3Key ?? null,
      }),
    );
  }
  console.log(`  ✓  Created ${demoInstitutions.length} generated documents`);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n✅  Seed complete!');
  console.log(`\n   Login: ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}\n`);

  await AppDataSource.destroy();
}

seed().catch((err: unknown) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
