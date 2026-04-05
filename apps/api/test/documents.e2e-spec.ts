/**
 * Documents + GeneratedDocuments e2e tests.
 *
 * Requires: docker compose up -d
 *
 * Flow under test:
 *   1. Initiate upload  → document record created, S3 pre-signed URL returned
 *   2. Enqueue processing → SQS message sent, status → PROCESSING
 *   3. Internal processing-result callback → status → PROCESSED
 *   4. Create generated-document → SQS message sent, status → GENERATING
 *   5. Internal generation-result callback → status → READY
 */
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DocumentStatus, GeneratedDocumentStatus, InstitutionType } from '@afterlight/shared';
import { cleanupUser, createTestApp, mockS3, mockSqs } from './helpers/create-test-app';

const EMAIL = `docs-e2e-${Date.now()}@test.local`;
const PASSWORD = 'Password123!';

const DECEASED_INFO = {
  firstName: 'Helen',
  lastName: 'Carter',
  dateOfBirth: '1938-03-22',
  dateOfDeath: '2024-09-15',
  placeOfDeath: 'Denver, CO',
};

const EXECUTOR_INFO = {
  name: 'James Carter',
  address: '7 Oak Street, Denver, CO',
  relationship: 'Son',
};

const INTERNAL_SECRET = 'test-internal-secret';

describe('Documents + GeneratedDocuments (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let caseId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Register user and get token
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: PASSWORD, firstName: 'Doc', lastName: 'Tester' });
    token = regRes.body.accessToken as string;

    // Create a case with executor info (needed for generated documents)
    const caseRes = await request(app.getHttpServer())
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ deceasedInfo: DECEASED_INFO });
    caseId = caseRes.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/cases/${caseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ executorInfo: EXECUTOR_INFO });
  });

  afterAll(async () => {
    await cleanupUser(app, EMAIL);
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Initiate Upload ───────────────────────────────────────────────────────

  describe('POST /cases/:caseId/documents/initiate-upload', () => {
    it('201 — creates document record and returns upload URL', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'cert.pdf', contentType: 'application/pdf' })
        .expect(201);

      expect(res.body).toMatchObject({
        document: expect.objectContaining({
          id: expect.any(String),
          caseId,
          status: DocumentStatus.PENDING,
        }),
        uploadUrl: expect.stringContaining('https://'),
      });
      expect(mockS3.generateUploadUrl).toHaveBeenCalledTimes(1);
    });

    it('400 — missing fileName', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ contentType: 'application/pdf' })
        .expect(400);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .send({ fileName: 'cert.pdf', contentType: 'application/pdf' })
        .expect(401);
    });

    it('404 — case not found for this user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/cases/00000000-0000-0000-0000-000000000000/documents/initiate-upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'cert.pdf', contentType: 'application/pdf' })
        .expect(404);
    });
  });

  // ── List + Get Documents ──────────────────────────────────────────────────

  describe('GET /cases/:caseId/documents', () => {
    let documentId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'list-test.pdf', contentType: 'application/pdf' });
      documentId = res.body.document.id as string;
    });

    it('200 — returns array of documents for the case', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cases/${caseId}/documents`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = (res.body as Array<{ id: string }>).map((d) => d.id);
      expect(ids).toContain(documentId);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/cases/${caseId}/documents`)
        .expect(401);
    });
  });

  describe('GET /cases/:caseId/documents/:id', () => {
    let documentId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'get-test.pdf', contentType: 'application/pdf' });
      documentId = res.body.document.id as string;
    });

    it('200 — returns the document', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cases/${caseId}/documents/${documentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.id).toBe(documentId);
    });

    it('404 — non-existent document UUID', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/cases/${caseId}/documents/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('400 — invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/cases/${caseId}/documents/not-a-uuid`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  // ── Enqueue Processing ────────────────────────────────────────────────────

  describe('POST /cases/:caseId/documents/:id/process', () => {
    let documentId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'process-test.pdf', contentType: 'application/pdf' });
      documentId = res.body.document.id as string;
    });

    it('202 — sets status to PROCESSING and enqueues SQS message', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/${documentId}/process`)
        .set('Authorization', `Bearer ${token}`)
        .expect(202);

      expect(res.body.status).toBe(DocumentStatus.PROCESSING);
      expect(mockSqs.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ── Internal: Processing Result ───────────────────────────────────────────

  describe('PATCH /documents/:id/processing-result', () => {
    let documentId: string;

    beforeAll(async () => {
      // Create and enqueue a fresh document to receive callback
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'callback-test.pdf', contentType: 'application/pdf' });
      documentId = uploadRes.body.document.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/${documentId}/process`)
        .set('Authorization', `Bearer ${token}`);
    });

    it('200 — updates document status to PROCESSED with extracted data', async () => {
      const extractedData = {
        first_name: 'Helen',
        last_name: 'Carter',
        date_of_birth: '1938-03-22',
        date_of_death: '2024-09-15',
      };

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/documents/${documentId}/processing-result`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .send({
          documentId,
          status: DocumentStatus.PROCESSED,
          extractedData,
        })
        .expect(200);

      expect(res.body.status).toBe(DocumentStatus.PROCESSED);
      expect(res.body.extractedData).toMatchObject({ first_name: 'Helen' });
    });

    it('200 — can mark document as FAILED with errorMessage', async () => {
      // Create a separate document for the failure scenario
      const failUploadRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'fail-test.pdf', contentType: 'application/pdf' });
      const failDocId = failUploadRes.body.document.id as string;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/documents/${failDocId}/processing-result`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .send({
          documentId: failDocId,
          status: DocumentStatus.FAILED,
          errorMessage: 'Could not parse document',
        })
        .expect(200);

      expect(res.body.status).toBe(DocumentStatus.FAILED);
      expect(res.body.errorMessage).toBe('Could not parse document');
    });

    it('401 — no internal secret header', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/documents/${documentId}/processing-result`)
        .send({ documentId, status: DocumentStatus.PROCESSED })
        .expect(401);
    });

    it('401 — wrong internal secret', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/documents/${documentId}/processing-result`)
        .set('x-internal-secret', 'wrong-secret')
        .send({ documentId, status: DocumentStatus.PROCESSED })
        .expect(401);
    });
  });

  // ── Full Flow: Generated Documents ────────────────────────────────────────

  describe('POST /cases/:caseId/generated-documents', () => {
    let processedDocumentId: string;

    beforeAll(async () => {
      // Bring a document all the way to PROCESSED status
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'gen-doc-test.pdf', contentType: 'application/pdf' });
      processedDocumentId = uploadRes.body.document.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/documents/${processedDocumentId}/processing-result`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .send({
          documentId: processedDocumentId,
          status: DocumentStatus.PROCESSED,
          extractedData: {
            first_name: 'Helen',
            last_name: 'Carter',
            date_of_birth: '1938-03-22',
            date_of_death: '2024-09-15',
          },
        });
    });

    it('202 — enqueues generation job and returns GENERATING document', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/generated-documents`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          documentId: processedDocumentId,
          institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION,
        })
        .expect(202);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        caseId,
        documentId: processedDocumentId,
        institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION,
        status: GeneratedDocumentStatus.GENERATING,
      });
      expect(mockSqs.sendMessage).toHaveBeenCalled();
    });

    it('409 — document not yet processed', async () => {
      // Create a fresh PENDING document
      const pendingUploadRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'pending.pdf', contentType: 'application/pdf' });
      const pendingDocId = pendingUploadRes.body.document.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/generated-documents`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          documentId: pendingDocId,
          institutionType: InstitutionType.BANK,
        })
        .expect(409);
    });

    it('422 — case missing executorInfo', async () => {
      // Create a case without executor info
      const caseRes = await request(app.getHttpServer())
        .post('/api/v1/cases')
        .set('Authorization', `Bearer ${token}`)
        .send({ deceasedInfo: DECEASED_INFO });
      const bareCase = caseRes.body.id as string;

      // Create and process a document for that case
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${bareCase}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'bare.pdf', contentType: 'application/pdf' });
      const bareDocId = uploadRes.body.document.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/documents/${bareDocId}/processing-result`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .send({
          documentId: bareDocId,
          status: DocumentStatus.PROCESSED,
          extractedData: { first_name: 'Helen', last_name: 'Carter' },
        });

      await request(app.getHttpServer())
        .post(`/api/v1/cases/${bareCase}/generated-documents`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          documentId: bareDocId,
          institutionType: InstitutionType.BANK,
        })
        .expect(422);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/generated-documents`)
        .send({
          documentId: processedDocumentId,
          institutionType: InstitutionType.BANK,
        })
        .expect(401);
    });
  });

  // ── List Generated Documents ──────────────────────────────────────────────

  describe('GET /cases/:caseId/generated-documents', () => {
    let processedDocumentId: string;
    let generatedDocId: string;

    beforeAll(async () => {
      // Create and process a document, then generate from it
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'list-gen-test.pdf', contentType: 'application/pdf' });
      processedDocumentId = uploadRes.body.document.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/documents/${processedDocumentId}/processing-result`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .send({
          documentId: processedDocumentId,
          status: DocumentStatus.PROCESSED,
          extractedData: { first_name: 'Helen', last_name: 'Carter' },
        });

      const genRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/generated-documents`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          documentId: processedDocumentId,
          institutionType: InstitutionType.IRS,
        });
      generatedDocId = genRes.body.id as string;
    });

    it('200 — returns array containing the generated document', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/cases/${caseId}/generated-documents`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = (res.body as Array<{ id: string }>).map((d) => d.id);
      expect(ids).toContain(generatedDocId);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/cases/${caseId}/generated-documents`)
        .expect(401);
    });
  });

  // ── Internal: Generation Result ───────────────────────────────────────────

  describe('PATCH /generated-documents/:id/result', () => {
    let generatedDocId: string;

    beforeAll(async () => {
      // Full setup: upload → process → generate
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'gen-result-test.pdf', contentType: 'application/pdf' });
      const docId = uploadRes.body.document.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/documents/${docId}/processing-result`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .send({
          documentId: docId,
          status: DocumentStatus.PROCESSED,
          extractedData: { first_name: 'Helen', last_name: 'Carter' },
        });

      const genRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/generated-documents`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          documentId: docId,
          institutionType: InstitutionType.MEDICARE,
        });
      generatedDocId = genRes.body.id as string;
    });

    it('200 — updates status to READY with s3Key', async () => {
      const s3Key = `generated/${caseId}/${generatedDocId}.pdf`;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/generated-documents/${generatedDocId}/result`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .send({
          generatedDocumentId: generatedDocId,
          status: GeneratedDocumentStatus.READY,
          s3Key,
        })
        .expect(200);

      expect(res.body.status).toBe(GeneratedDocumentStatus.READY);
      expect(res.body.s3Key).toBe(s3Key);
    });

    it('200 — can mark generation as FAILED', async () => {
      // Create a separate generated doc for the failure scenario
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/documents/initiate-upload`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'gen-fail.pdf', contentType: 'application/pdf' });
      const docId = uploadRes.body.document.id as string;

      await request(app.getHttpServer())
        .patch(`/api/v1/documents/${docId}/processing-result`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .send({
          documentId: docId,
          status: DocumentStatus.PROCESSED,
          extractedData: { first_name: 'Helen', last_name: 'Carter' },
        });

      const genRes = await request(app.getHttpServer())
        .post(`/api/v1/cases/${caseId}/generated-documents`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          documentId: docId,
          institutionType: InstitutionType.PASSPORT,
        });
      const failGenId = genRes.body.id as string;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/generated-documents/${failGenId}/result`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .send({
          generatedDocumentId: failGenId,
          status: GeneratedDocumentStatus.FAILED,
          errorMessage: 'Template rendering error',
        })
        .expect(200);

      expect(res.body.status).toBe(GeneratedDocumentStatus.FAILED);
      expect(res.body.errorMessage).toBe('Template rendering error');
    });

    it('401 — no internal secret header', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/generated-documents/${generatedDocId}/result`)
        .send({
          generatedDocumentId: generatedDocId,
          status: GeneratedDocumentStatus.READY,
        })
        .expect(401);
    });

    it('401 — wrong internal secret', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/generated-documents/${generatedDocId}/result`)
        .set('x-internal-secret', 'not-the-secret')
        .send({
          generatedDocumentId: generatedDocId,
          status: GeneratedDocumentStatus.READY,
        })
        .expect(401);
    });
  });
});
