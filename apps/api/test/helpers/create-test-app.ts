import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { S3Service } from '../../src/aws/s3.service';
import { SqsService } from '../../src/aws/sqs.service';

/** Shared mock objects — reset between tests with jest.clearAllMocks() */
export const mockS3 = {
  generateUploadUrl: jest.fn().mockResolvedValue('https://s3.example.com/upload?signed=1'),
  generateDownloadUrl: jest.fn().mockResolvedValue('https://s3.example.com/download?signed=1'),
};

export const mockSqs = {
  sendMessage: jest.fn().mockResolvedValue({}),
};

/**
 * Creates a fully-initialized NestJS test app with the real database but
 * with S3Service and SqsService replaced by in-memory mocks.
 *
 * Prerequisites: `docker compose up -d` (PostgreSQL on localhost:5432).
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(S3Service)
    .useValue(mockS3)
    .overrideProvider(SqsService)
    .useValue(mockSqs)
    .compile();

  const app = moduleFixture.createNestApplication();

  // Mirror the bootstrap configuration from main.ts
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

/**
 * Deletes all rows belonging to a test user (in FK-safe order).
 * Call in afterAll to avoid polluting the database between runs.
 */
export async function cleanupUser(app: INestApplication, email: string): Promise<void> {
  const ds = app.get(DataSource);
  await ds.query(
    `DELETE FROM generated_documents
     WHERE case_id IN (SELECT id FROM cases WHERE user_id = (SELECT id FROM users WHERE email = $1))`,
    [email],
  );
  await ds.query(
    `DELETE FROM documents
     WHERE case_id IN (SELECT id FROM cases WHERE user_id = (SELECT id FROM users WHERE email = $1))`,
    [email],
  );
  await ds.query(
    `DELETE FROM cases WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
    [email],
  );
  await ds.query(`DELETE FROM users WHERE email = $1`, [email]);
}
