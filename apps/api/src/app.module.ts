import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AwsModule } from './aws/aws.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { DocumentsModule } from './documents/documents.module';
import { EventsModule } from './events/events.module';
import { GeneratedDocumentsModule } from './generated-documents/generated-documents.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Default throttler — overridden per-route with @Throttle()
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TerminusModule,
    DatabaseModule,
    AwsModule,
    AuthModule,
    CasesModule,
    DocumentsModule,
    GeneratedDocumentsModule,
    TemplatesModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply @Throttle() metadata to every HTTP request. Routes can opt out
    // explicitly with @SkipThrottle() (health checks and internal callbacks).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
