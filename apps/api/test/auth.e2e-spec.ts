/**
 * Auth e2e tests — covers register, login, refresh, logout and the
 * 401 guard on protected routes.
 *
 * Requires: docker compose up -d
 */
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { cleanupUser, createTestApp } from './helpers/create-test-app';

const BASE = '/api/v1/auth';

// Unique email per run so parallel CI jobs don't clash
const EMAIL = `auth-e2e-${Date.now()}@test.local`;
const PASSWORD = 'Password123!';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanupUser(app, EMAIL);
    await app.close();
  });

  // ── Registration ──────────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('201 — registers a new user and returns tokens + user object', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/register`)
        .send({ email: EMAIL, password: PASSWORD, firstName: 'Alice', lastName: 'Test' })
        .expect(201);

      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      // Password hash must never appear in the response
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('409 — duplicate email returns Conflict', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/register`)
        .send({ email: EMAIL, password: PASSWORD, firstName: 'Dup', lastName: 'User' })
        .expect(409);
    });

    it('400 — missing required fields', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/register`)
        .send({ email: 'incomplete@test.local' })
        .expect(400);
    });

    it('400 — invalid email format', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/register`)
        .send({ email: 'not-an-email', password: PASSWORD, firstName: 'X', lastName: 'Y' })
        .expect(400);
    });

    it('400 — password too short (< 8 chars)', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/register`)
        .send({ email: 'short@test.local', password: 'abc', firstName: 'X', lastName: 'Y' })
        .expect(400);
    });
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('200 — returns tokens on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/login`)
        .send({ email: EMAIL, password: PASSWORD })
        .expect(200);

      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('401 — wrong password', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/login`)
        .send({ email: EMAIL, password: 'WrongPassword!' })
        .expect(401);
    });

    it('401 — user not found', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/login`)
        .send({ email: 'nobody@test.local', password: PASSWORD })
        .expect(401);
    });
  });

  // ── Refresh ───────────────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('200 — issues new token pair with a valid refresh token', async () => {
      // First login to get a refresh token
      const loginRes = await request(app.getHttpServer())
        .post(`${BASE}/login`)
        .send({ email: EMAIL, password: PASSWORD });

      const refreshToken: string = loginRes.body.refreshToken as string;

      const res = await request(app.getHttpServer())
        .post(`${BASE}/refresh`)
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      // Tokens should be rotated (different values)
      expect(res.body.accessToken).not.toBe(refreshToken);
    });

    it('401 — no Authorization header', async () => {
      await request(app.getHttpServer()).post(`${BASE}/refresh`).expect(401);
    });

    it('401 — malformed token', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/refresh`)
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('204 — succeeds with valid access token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post(`${BASE}/login`)
        .send({ email: EMAIL, password: PASSWORD });

      const accessToken: string = loginRes.body.accessToken as string;

      await request(app.getHttpServer())
        .post(`${BASE}/logout`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('401 — no token', async () => {
      await request(app.getHttpServer()).post(`${BASE}/logout`).expect(401);
    });
  });

  // ── Guard behaviour ───────────────────────────────────────────────────────

  describe('Protected routes', () => {
    it('401 — GET /api/v1/cases without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/cases').expect(401);
    });

    it('200 — GET /api/v1/cases with valid access token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post(`${BASE}/login`)
        .send({ email: EMAIL, password: PASSWORD });

      const accessToken: string = loginRes.body.accessToken as string;

      await request(app.getHttpServer())
        .get('/api/v1/cases')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });
});
