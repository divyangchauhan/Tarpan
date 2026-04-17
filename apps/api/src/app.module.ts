import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AwsModule,
    AuthModule,
    CasesModule,
    DocumentsModule,
    GeneratedDocumentsModule,
    TemplatesModule,
    EventsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
