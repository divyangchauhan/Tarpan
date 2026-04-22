import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEntity } from '../entities/document.entity';
import { CasesModule } from '../cases/cases.module';
import { EventsModule } from '../events/events.module';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { InternalSecretGuard } from './guards/internal-secret.guard';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity]), CasesModule, EventsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, InternalSecretGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
