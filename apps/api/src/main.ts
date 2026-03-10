import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

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
