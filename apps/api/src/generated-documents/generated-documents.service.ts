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
import {
  DocumentGenerationJob,
  DocumentStatus,
  GeneratedDocumentStatus,
  InstitutionType,
} from '@afterlight/shared';
import { GeneratedDocumentEntity } from '../entities/generated-document.entity';
import { CasesService } from '../cases/cases.service';
import { DocumentsService } from '../documents/documents.service';
import { SqsService } from '../aws/sqs.service';
import { S3Service } from '../aws/s3.service';
import { CreateGeneratedDocumentDto } from './dto/create-generated-document.dto';
import { GenerationResultDto } from './dto/generation-result.dto';

const INSTITUTION_TYPE_TO_TEMPLATE_ID: Record<InstitutionType, string> = {
  [InstitutionType.SOCIAL_SECURITY_ADMINISTRATION]: 'ssa-721',
  [InstitutionType.MEDICARE]: 'medicare',
  [InstitutionType.IRS]: 'irs-notification',
  [InstitutionType.VETERANS_AFFAIRS]: 'veterans-affairs',
  [InstitutionType.STATE_DMV]: 'dmv-notification',
  [InstitutionType.VOTER_REGISTRATION]: 'voter-registration',
  [InstitutionType.PASSPORT]: 'passport-cancellation',
  [InstitutionType.BANK]: 'bank-closure',
  [InstitutionType.CREDIT_CARD]: 'credit-card-cancellation',
  [InstitutionType.PENSION_401K]: 'pension-401k',
  [InstitutionType.LIFE_INSURANCE]: 'life-insurance',
  [InstitutionType.USPS]: 'usps-notification',
  [InstitutionType.SUBSCRIPTION_STREAMING]: 'subscription-cancellation',
  [InstitutionType.SUBSCRIPTION_UTILITY]: 'subscription-cancellation',
  [InstitutionType.EMPLOYER_HR]: 'employer-notification',
  [InstitutionType.PROFESSIONAL_LICENSE_BOARD]: 'professional-license',
};

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

    const templateId = INSTITUTION_TYPE_TO_TEMPLATE_ID[dto.institutionType];
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
      // extractedData is stored with snake_case keys (as-is from the Python processor)
      deceased: document.extractedData as unknown as DocumentGenerationJob['deceased'],
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
    const doc = await this.generatedDocumentRepository.findOne({
      where: { id: dto.generatedDocumentId },
    });

    if (!doc) {
      throw new NotFoundException(`GeneratedDocument ${dto.generatedDocumentId} not found`);
    }

    doc.status = dto.status;
    if (dto.s3Key !== undefined) doc.s3Key = dto.s3Key;
    if (dto.errorMessage !== undefined) doc.errorMessage = dto.errorMessage;

    const updated = await this.generatedDocumentRepository.save(doc);
    this.logger.log(
      `Generation result for ${dto.generatedDocumentId}: status=${dto.status}`,
    );
    return updated;
  }
}
