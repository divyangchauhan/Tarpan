import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DocumentGenerationJob, DocumentStatus, GeneratedDocumentStatus } from '@tarpan/shared';
import { CaseEntity } from '../entities/case.entity';
import { GeneratedDocumentEntity } from '../entities/generated-document.entity';
import { CasesService } from '../cases/cases.service';
import { DocumentsService } from '../documents/documents.service';
import { SqsService } from '../aws/sqs.service';
import { S3Service } from '../aws/s3.service';
import { TemplatesService } from '../templates/templates.service';
import { CreateGeneratedDocumentDto } from './dto/create-generated-document.dto';
import { GenerationResultDto } from './dto/generation-result.dto';

function buildGenerationDeceased(
  extractedData: NonNullable<DocumentGenerationJob['deceased']>,
  deceasedInfo: CaseEntity['deceasedInfo'],
): DocumentGenerationJob['deceased'] {
  if (!deceasedInfo) return extractedData;

  const result = { ...extractedData } as Record<string, unknown>;
  const name = [deceasedInfo.firstName, deceasedInfo.middleName, deceasedInfo.lastName]
    .filter(Boolean)
    .join(' ');

  if (name) {
    result.full_name = name;
    result.fullName = name;
  }

  const fields: Array<[keyof NonNullable<CaseEntity['deceasedInfo']>, string, string]> = [
    ['firstName', 'first_name', 'firstName'],
    ['middleName', 'middle_name', 'middleName'],
    ['lastName', 'last_name', 'lastName'],
    ['dateOfBirth', 'date_of_birth', 'dateOfBirth'],
    ['dateOfDeath', 'date_of_death', 'dateOfDeath'],
    ['placeOfDeath', 'place_of_death', 'placeOfDeath'],
    ['socialSecurityNumber', 'social_security_number', 'socialSecurityNumber'],
  ];

  for (const [caseKey, snakeKey, camelKey] of fields) {
    const value = deceasedInfo[caseKey];
    if (value !== undefined) {
      result[snakeKey] = value;
      result[camelKey] = value;
    }
  }

  return result as DocumentGenerationJob['deceased'];
}

@Injectable()
export class GeneratedDocumentsService {
  private readonly logger = new Logger(GeneratedDocumentsService.name);

  constructor(
    @InjectRepository(GeneratedDocumentEntity)
    private readonly generatedDocumentRepository: Repository<GeneratedDocumentEntity>,
    private readonly casesService: CasesService,
    private readonly documentsService: DocumentsService,
    private readonly sqsService: SqsService,
    private readonly s3Service: S3Service,
    private readonly config: ConfigService,
    private readonly templatesService: TemplatesService,
  ) {}

  async create(
    userId: string,
    caseId: string,
    dto: CreateGeneratedDocumentDto,
  ): Promise<GeneratedDocumentEntity> {
    const caseEntity = await this.casesService.findOne(userId, caseId);

    if (!caseEntity.executorInfo) {
      throw new UnprocessableEntityException(
        'Case is missing executorInfo. Add executor details before generating documents.',
      );
    }

    const document = await this.documentsService.findOne(userId, caseId, dto.documentId);

    if (document.status !== DocumentStatus.PROCESSED || !document.extractedData) {
      throw new ConflictException(
        `Document ${dto.documentId} has not been processed yet. Wait for status PROCESSED before generating.`,
      );
    }

    const templateId = this.templatesService.getTemplateId(dto.institutionType);
    const { executorInfo } = caseEntity;

    const generatedDoc = this.generatedDocumentRepository.create({
      caseId,
      documentId: dto.documentId,
      institutionType: dto.institutionType,
      institutionName: dto.institutionName ?? null,
      status: GeneratedDocumentStatus.GENERATING,
    });
    const saved = await this.generatedDocumentRepository.save(generatedDoc);

    const job: DocumentGenerationJob = {
      generatedDocumentId: saved.id,
      templateId,
      caseId,
      documentId: dto.documentId,
      deceased: buildGenerationDeceased(
        document.extractedData as unknown as DocumentGenerationJob['deceased'],
        caseEntity.deceasedInfo,
      ),
      executorName: executorInfo.name,
      executorAddress: executorInfo.address,
      executorRelationship: executorInfo.relationship,
      executorPhone: executorInfo.phone ?? null,
      executorEmail: executorInfo.email ?? null,
      institutionName: dto.institutionName ?? null,
      institutionAddress: null,
    };

    const queueUrl = this.config.getOrThrow<string>('SQS_DOCUMENT_GENERATION_QUEUE_URL');
    await this.sqsService.sendMessage(queueUrl, job as unknown as Record<string, unknown>);

    this.logger.log(
      `Enqueued generation job for generated document ${saved.id} (template: ${templateId})`,
    );
    return saved;
  }

  async findAll(userId: string, caseId: string): Promise<GeneratedDocumentEntity[]> {
    await this.casesService.findOne(userId, caseId);

    const docs = await this.generatedDocumentRepository.find({
      where: { caseId },
      order: { createdAt: 'DESC' },
    });

    const bucket = this.config.getOrThrow<string>('S3_GENERATED_DOCS_BUCKET');

    return Promise.all(
      docs.map(async (doc) => {
        if (doc.status === GeneratedDocumentStatus.READY && doc.s3Key) {
          // Attach a short-lived pre-signed download URL
          (doc as GeneratedDocumentEntity & { downloadUrl?: string }).downloadUrl =
            await this.s3Service.generateDownloadUrl(bucket, doc.s3Key, 900);
        }
        return doc;
      }),
    );
  }

  async handleGenerationResult(dto: GenerationResultDto): Promise<GeneratedDocumentEntity> {
    // Make the state transition conditional in the database. A read followed
    // by save is racy: concurrent READY/FAILED callbacks can both observe
    // GENERATING and the later save can downgrade the terminal result.
    await this.generatedDocumentRepository.update(
      { id: dto.generatedDocumentId, status: GeneratedDocumentStatus.GENERATING },
      {
        status: dto.status,
        ...(dto.s3Key !== undefined ? { s3Key: dto.s3Key } : {}),
        ...(dto.errorMessage !== undefined ? { errorMessage: dto.errorMessage } : {}),
      },
    );

    // Whether this callback won the conditional update or arrived after a
    // terminal callback, return the current committed row. This also makes
    // retries idempotent. A zero-row update may mean either a missing row or
    // an already-terminal row, so distinguish those cases with a read.
    const updated = await this.generatedDocumentRepository.findOne({
      where: { id: dto.generatedDocumentId },
    });

    if (!updated) {
      throw new NotFoundException(`GeneratedDocument ${dto.generatedDocumentId} not found`);
    }

    this.logger.log(`Generation result for ${dto.generatedDocumentId}: status=${dto.status}`);
    return updated;
  }
}
