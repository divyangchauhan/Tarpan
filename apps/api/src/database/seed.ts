/**
 * Demo seed script — populates the database with a realistic AfterLight demo case
 * and triggers real PDF generation via the SQS pipeline.
 *
 * Usage:
 *   cd apps/api && pnpm ts-node -r tsconfig-paths/register src/database/seed.ts
 *
 * Requires the full stack to be running (docker compose up -d + pnpm dev + processor worker).
 * Safe to run multiple times: existing demo data is deleted and re-created.
 */

/* eslint-disable no-console */
import * as dotenv from 'dotenv';
dotenv.config(); // load .env before anything reads process.env
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
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

const GENERATION_TIMEOUT_MS = 120_000; // 2 minutes
const POLL_INTERVAL_MS = 3_000;

// Must match INSTITUTION_TYPE_TO_TEMPLATE_ID in generated-documents.service.ts
const TEMPLATE_ID: Partial<Record<InstitutionType, string>> = {
  [InstitutionType.SOCIAL_SECURITY_ADMINISTRATION]: 'ssa-721',
  [InstitutionType.MEDICARE]: 'medicare',
  [InstitutionType.IRS]: 'irs-notification',
  [InstitutionType.BANK]: 'bank-closure',
  [InstitutionType.LIFE_INSURANCE]: 'life-insurance',
  [InstitutionType.STATE_DMV]: 'dmv-notification',
  [InstitutionType.VOTER_REGISTRATION]: 'voter-registration',
};

const DEMO_INSTITUTIONS: Array<{ institutionType: InstitutionType; institutionName?: string }> = [
  { institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION },
  { institutionType: InstitutionType.MEDICARE },
  { institutionType: InstitutionType.IRS },
  { institutionType: InstitutionType.BANK },
  { institutionType: InstitutionType.LIFE_INSURANCE },
  { institutionType: InstitutionType.STATE_DMV },
  { institutionType: InstitutionType.VOTER_REGISTRATION },
];

const EXTRACTED_DATA = {
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
};

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
  const certDoc = await documentRepo.save(
    documentRepo.create({
      caseId: demoCase.id,
      type: DocumentType.DEATH_CERTIFICATE,
      status: DocumentStatus.PROCESSED,
      s3Key: `cases/${demoCase.id}/documents/death-certificate.pdf`,
      extractedData: EXTRACTED_DATA as unknown as DocumentEntity['extractedData'],
    }),
  );
  console.log(`  ✓  Created processed document: ${certDoc.id}`);

  // ── 4. Generated documents — create records then trigger real generation ──
  const sqsClient = new SQSClient({
    region: process.env['AWS_REGION'] ?? 'us-east-1',
    ...(process.env['AWS_ENDPOINT_URL'] ? { endpoint: process.env['AWS_ENDPOINT_URL'] } : {}),
  });
  const queueUrl = process.env['SQS_DOCUMENT_GENERATION_QUEUE_URL'];
  if (!queueUrl) {
    throw new Error('SQS_DOCUMENT_GENERATION_QUEUE_URL is not set');
  }

  const generatedDocs = await Promise.all(
    DEMO_INSTITUTIONS.map((inst) =>
      generatedDocRepo.save(
        generatedDocRepo.create({
          caseId: demoCase.id,
          documentId: certDoc.id,
          institutionType: inst.institutionType,
          institutionName: inst.institutionName ?? null,
          status: GeneratedDocumentStatus.GENERATING,
          s3Key: null,
        }),
      ),
    ),
  );
  console.log(`  ✓  Created ${generatedDocs.length} generated document records`);

  // Send a real SQS generation job for each so the processor builds the actual PDFs
  await Promise.all(
    generatedDocs.map(async (doc, i) => {
      const inst = DEMO_INSTITUTIONS[i]!;
      const templateId = TEMPLATE_ID[inst.institutionType];
      if (!templateId) throw new Error(`No template ID for ${inst.institutionType}`);

      const job = {
        generatedDocumentId: doc.id,
        templateId,
        caseId: demoCase.id,
        documentId: certDoc.id,
        deceased: EXTRACTED_DATA,
        executorName: demoCase.executorInfo!.name,
        executorAddress: demoCase.executorInfo!.address,
        executorRelationship: demoCase.executorInfo!.relationship,
        executorPhone: demoCase.executorInfo!.phone ?? null,
        executorEmail: demoCase.executorInfo!.email ?? null,
        institutionName: inst.institutionName ?? null,
        institutionAddress: null,
      };

      await sqsClient.send(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(job) }),
      );
    }),
  );
  console.log(`  ✓  Enqueued ${generatedDocs.length} generation jobs — waiting for PDFs…`);

  // ── 5. Poll until all generated docs are READY (or FAILED) ────────────────
  const ids = new Set(generatedDocs.map((d) => d.id));
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const rows = await generatedDocRepo.findBy([...ids].map((id) => ({ id })));
    const pending = rows.filter((r) => r.status === GeneratedDocumentStatus.GENERATING);
    const failed = rows.filter((r) => r.status === GeneratedDocumentStatus.FAILED);
    const ready = rows.filter((r) => r.status === GeneratedDocumentStatus.READY);

    console.log(
      `  …  ${ready.length}/${ids.size} ready, ${pending.length} pending, ${failed.length} failed`,
    );

    if (failed.length > 0) {
      for (const f of failed) {
        console.error(`  ✗  ${f.institutionType}: ${f.errorMessage ?? 'unknown error'}`);
      }
    }

    if (pending.length === 0) break;
  }

  const finalRows = await generatedDocRepo.findBy([...ids].map((id) => ({ id })));
  const allReady = finalRows.every((r) => r.status === GeneratedDocumentStatus.READY);

  if (!allReady) {
    const stillPending = finalRows.filter((r) => r.status === GeneratedDocumentStatus.GENERATING);
    console.warn(
      `  ⚠  ${stillPending.length} document(s) still generating after timeout — run the processor worker and re-seed`,
    );
  }

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
