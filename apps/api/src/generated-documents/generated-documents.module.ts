import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeneratedDocumentEntity } from '../entities/generated-document.entity';
import { CasesModule } from '../cases/cases.module';
import { DocumentsModule } from '../documents/documents.module';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { GeneratedDocumentsService } from './generated-documents.service';
import { GeneratedDocumentsController } from './generated-documents.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GeneratedDocumentEntity]),
    CasesModule,
    DocumentsModule,
  ],
  controllers: [GeneratedDocumentsController],
  providers: [GeneratedDocumentsService, InternalSecretGuard],
})
export class GeneratedDocumentsModule {}
