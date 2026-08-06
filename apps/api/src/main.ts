// instrument.ts must be the first import — Sentry requires this for correct instrumentation.
import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json-logger';
import { configureTrustedProxy } from './common/http/trust-proxy';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    logger: new JsonLogger(),
  });

  // CloudFront forwards through the ALB before reaching Express. Trust only
  // those two proxy hops so throttling keys requests by the original client IP.
  configureTrustedProxy(app);

  // Sentry global filter — captures unhandled exceptions and reports to Sentry
  app.useGlobalFilters(new SentryGlobalFilter(app.getHttpAdapter()));

  // Global validation pipe — validates all incoming DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // throw on unknown properties
      transform: true, // auto-transform payloads to DTO instances
    }),
  );

  // URI versioning: /v1/...
  app.enableVersioning({ type: VersioningType.URI });

  // CORS for local development
  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true,
  });

  // API prefix
  app.setGlobalPrefix('api');

  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
}

void bootstrap();
