import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { DocumentStatus, DocumentType, DocumentProcessingJob } from '@afterlight/shared';
import { DocumentEntity } from '../entities/document.entity';
import { CasesService } from '../cases/cases.service';
import { S3Service } from '../aws/s3.service';
import { SqsService } from '../aws/sqs.service';
import { EventsGateway } from '../events/events.gateway';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { ProcessingResultDto } from './dto/processing-result.dto';

export interface InitiateUploadResult {
  document: DocumentEntity;
  uploadUrl: string;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documentRepository: Repository<DocumentEntity>,
    private readonly casesService: CasesService,
    private readonly s3Service: S3Service,
    private readonly sqsService: SqsService,
    private readonly eventsGateway: EventsGateway,
    private readonly config: ConfigService,
  ) {}

  async initiateUpload(
    userId: string,
    dto: InitiateUploadDto,
  ): Promise<InitiateUploadResult> {
    // Verify case belongs to the requesting user
    const caseEntity = await this.casesService.findOne(userId, dto.caseId);

    const documentId = uuidv4();
    const extension = dto.fileName.includes('.')
      ? dto.fileName.split('.').pop() ?? 'bin'
      : 'bin';
    const s3Key = `cases/${caseEntity.id}/documents/${documentId}.${extension}`;

    const bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET');
    const uploadUrl = await this.s3Service.generateUploadUrl(
      bucket,
      s3Key,
      dto.contentType,
      900, // 15 minute TTL
    );

    const document = this.documentRepository.create({
      id: documentId,
      caseId: caseEntity.id,
      type: DocumentType.DEATH_CERTIFICATE,
      status: DocumentStatus.PENDING,
      s3Key,
    });

    const saved = await this.documentRepository.save(document);
    this.logger.log(`Initiated upload for document ${documentId} in case ${caseEntity.id}`);

    return { document: saved, uploadUrl };
  }

  async findAll(userId: string, caseId: string): Promise<DocumentEntity[]> {
    // Verify case ownership
    await this.casesService.findOne(userId, caseId);

    return this.documentRepository.find({
      where: { caseId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(
    userId: string,
    caseId: string,
    documentId: string,
  ): Promise<DocumentEntity> {
    // Verify case ownership
    await this.casesService.findOne(userId, caseId);

    const document = await this.documentRepository.findOne({
      where: { id: documentId, caseId },
    });

    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    return document;
  }

  async enqueueProcessing(
    userId: string,
    caseId: string,
    documentId: string,
  ): Promise<DocumentEntity> {
    const document = await this.findOne(userId, caseId, documentId);

    document.status = DocumentStatus.PROCESSING;
    const updated = await this.documentRepository.save(document);

    const job: DocumentProcessingJob = {
      documentId: document.id,
      caseId: document.caseId,
      s3Key: document.s3Key,
    };

    const queueUrl = this.config.getOrThrow<string>('AWS_SQS_QUEUE_URL');
    await this.sqsService.sendMessage(queueUrl, job as unknown as Record<string, unknown>);

    this.logger.log(`Enqueued processing for document ${documentId}`);
    return updated;
  }

  async handleProcessingResult(dto: ProcessingResultDto): Promise<DocumentEntity> {
    const document = await this.documentRepository.findOne({
      where: { id: dto.documentId },
    });

    if (!document) {
      throw new NotFoundException(`Document ${dto.documentId} not found`);
    }

    document.status = dto.status;

    if (dto.extractedData !== undefined) {
      document.extractedData = dto.extractedData;
    }

    if (dto.errorMessage !== undefined) {
      document.errorMessage = dto.errorMessage;
    }

    const updated = await this.documentRepository.save(document);

    const extra: Parameters<typeof this.eventsGateway.emitDocumentStatus>[2] = {};
    if (dto.extractedData !== undefined) extra.extractedData = dto.extractedData;
    if (dto.errorMessage !== undefined) extra.errorMessage = dto.errorMessage;
    this.eventsGateway.emitDocumentStatus(document.id, dto.status, extra);

    this.logger.log(
      `Processed result for document ${dto.documentId}: status=${dto.status}`,
    );

    return updated;
  }
}
