/**
 * Cases e2e tests — CRUD with auth, ownership isolation.
 *
 * Requires: docker compose up -d
 */
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { cleanupUser, createTestApp } from './helpers/create-test-app';

const CASES_URL = '/api/v1/cases';

const EMAIL_A = `cases-e2e-a-${Date.now()}@test.local`;
const EMAIL_B = `cases-e2e-b-${Date.now()}@test.local`;
const PASSWORD = 'Password123!';

const DECEASED_INFO = {
  firstName: 'Robert',
  lastName: 'Mitchell',
  dateOfBirth: '1942-07-14',
  dateOfDeath: '2024-11-03',
  placeOfDeath: 'Springfield, IL',
};

describe('Cases (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Register two users to test ownership isolation
    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: EMAIL_A, password: PASSWORD, firstName: 'Alice', lastName: 'A' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: EMAIL_B, password: PASSWORD, firstName: 'Bob', lastName: 'B' }),
    ]);

    tokenA = resA.body.accessToken as string;
    tokenB = resB.body.accessToken as string;
  });

  afterAll(async () => {
    await cleanupUser(app, EMAIL_A);
    await cleanupUser(app, EMAIL_B);
    await app.close();
  });

  // ── Create ────────────────────────────────────────────────────────────────

  describe('POST /cases', () => {
    it('201 — creates a case and returns it', async () => {
      const res = await request(app.getHttpServer())
        .post(CASES_URL)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ deceasedInfo: DECEASED_INFO })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        status: 'ACTIVE',
        deceasedInfo: expect.objectContaining({ firstName: 'Robert' }),
      });
    });

    it('400 — missing required deceasedInfo fields', async () => {
      await request(app.getHttpServer())
        .post(CASES_URL)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ deceasedInfo: { firstName: 'Only' } }) // missing lastName, dates, place
        .expect(400);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer())
        .post(CASES_URL)
        .send({ deceasedInfo: DECEASED_INFO })
        .expect(401);
    });
  });

  // ── List ──────────────────────────────────────────────────────────────────

  describe('GET /cases', () => {
    let caseIdForList: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(CASES_URL)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ deceasedInfo: DECEASED_INFO });
      caseIdForList = res.body.id as string;
    });

    it('200 — returns only the authenticated user\'s cases', async () => {
      // Create a case for user B
      await request(app.getHttpServer())
        .post(CASES_URL)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ deceasedInfo: DECEASED_INFO });

      const resA = await request(app.getHttpServer())
        .get(CASES_URL)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get(CASES_URL)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      // Each user sees only their own cases
      expect(Array.isArray(resA.body)).toBe(true);
      const idsA = (resA.body as Array<{ id: string }>).map((c) => c.id);
      const idsB = (resB.body as Array<{ id: string }>).map((c) => c.id);
      expect(idsA).toContain(caseIdForList);
      // None of user A's cases appear in user B's list
      idsA.forEach((id) => expect(idsB).not.toContain(id));
    });
  });

  // ── Get one ───────────────────────────────────────────────────────────────

  describe('GET /cases/:id', () => {
    let caseId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(CASES_URL)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ deceasedInfo: DECEASED_INFO });
      caseId = res.body.id as string;
    });

    it('200 — returns the case for its owner', async () => {
      const res = await request(app.getHttpServer())
        .get(`${CASES_URL}/${caseId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.id).toBe(caseId);
    });

    it('404 — another user cannot access the case', async () => {
      await request(app.getHttpServer())
        .get(`${CASES_URL}/${caseId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('404 — non-existent UUID', async () => {
      await request(app.getHttpServer())
        .get(`${CASES_URL}/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('400 — invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get(`${CASES_URL}/not-a-uuid`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });
  });

  // ── Update ────────────────────────────────────────────────────────────────

  describe('PATCH /cases/:id', () => {
    let caseId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(CASES_URL)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ deceasedInfo: DECEASED_INFO });
      caseId = res.body.id as string;
    });

    it('200 — updates status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${CASES_URL}/${caseId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      expect(res.body.status).toBe('COMPLETED');
    });

    it('200 — patches deceasedInfo without overwriting other fields', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${CASES_URL}/${caseId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ deceasedInfo: { firstName: 'Updated' } })
        .expect(200);

      expect(res.body.deceasedInfo.firstName).toBe('Updated');
      expect(res.body.deceasedInfo.lastName).toBe(DECEASED_INFO.lastName);
    });

    it('200 — adds executorInfo', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${CASES_URL}/${caseId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          executorInfo: {
            name: 'Sarah Mitchell',
            address: '412 Maple Ave, Springfield, IL',
            relationship: 'Daughter',
          },
        })
        .expect(200);

      expect(res.body.executorInfo).toMatchObject({ name: 'Sarah Mitchell' });
    });

    it('404 — another user cannot update the case', async () => {
      await request(app.getHttpServer())
        .patch(`${CASES_URL}/${caseId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ status: 'ARCHIVED' })
        .expect(404);
    });
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  describe('DELETE /cases/:id', () => {
    it('204 — deletes the case', async () => {
      const createRes = await request(app.getHttpServer())
        .post(CASES_URL)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ deceasedInfo: DECEASED_INFO });

      const caseId: string = createRes.body.id as string;

      await request(app.getHttpServer())
        .delete(`${CASES_URL}/${caseId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);

      // Subsequent GET should 404
      await request(app.getHttpServer())
        .get(`${CASES_URL}/${caseId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('404 — another user cannot delete the case', async () => {
      const createRes = await request(app.getHttpServer())
        .post(CASES_URL)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ deceasedInfo: DECEASED_INFO });

      const caseId: string = createRes.body.id as string;

      await request(app.getHttpServer())
        .delete(`${CASES_URL}/${caseId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });
});
