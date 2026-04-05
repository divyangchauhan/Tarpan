import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  CaseStatus,
  DocumentStatus,
  GeneratedDocumentStatus,
  InstitutionType,
} from '@afterlight/shared';
import { CaseEntity } from '../entities/case.entity';
import { DocumentEntity } from '../entities/document.entity';
import { GeneratedDocumentEntity } from '../entities/generated-document.entity';
import { CasesService } from '../cases/cases.service';
import { DocumentsService } from '../documents/documents.service';
import { SqsService } from '../aws/sqs.service';
import { S3Service } from '../aws/s3.service';
import { GeneratedDocumentsService } from './generated-documents.service';
import { CreateGeneratedDocumentDto } from './dto/create-generated-document.dto';
import { GenerationResultDto } from './dto/generation-result.dto';

const mockExecutorInfo = {
  name: 'Robert Smith',
  address: '456 Elm St\nSpringfield, IL 62701',
  relationship: 'Son',
  phone: '(217) 555-0100',
  email: 'robert@example.com',
};

const mockCase: CaseEntity = {
  id: 'case-id',
  userId: 'user-id',
  status: CaseStatus.ACTIVE,
  deceasedInfo: {
    firstName: 'Jane',
    lastName: 'Smith',
    dateOfBirth: '1945-03-15',
    dateOfDeath: '2024-11-20',
    placeOfDeath: 'Springfield, IL',
  },
  executorInfo: mockExecutorInfo,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: null as unknown as import('../entities/user.entity').UserEntity,
  documents: [],
};

const mockDocument: DocumentEntity = {
  id: 'doc-id',
  caseId: 'case-id',
  type: 'DEATH_CERTIFICATE' as import('@afterlight/shared').DocumentType,
  status: DocumentStatus.PROCESSED,
  s3Key: 'cases/case-id/documents/doc-id.pdf',
  extractedData: {
    full_name: 'Jane Smith',
    date_of_death: '2024-11-20',
    place_of_death: 'Springfield, IL',
  } as unknown as import('@afterlight/shared').ExtractedCertificateData,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  case: mockCase,
};

const mockGeneratedDoc: GeneratedDocumentEntity = {
  id: 'gen-doc-id',
  caseId: 'case-id',
  documentId: 'doc-id',
  institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION,
  institutionName: null,
  status: GeneratedDocumentStatus.GENERATING,
  s3Key: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as GeneratedDocumentEntity;

const mockGeneratedDocRepository = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
};

const mockCasesService = {
  findOne: jest.fn(),
};

const mockDocumentsService = {
  findOne: jest.fn(),
};

const mockSqsService = {
  sendMessage: jest.fn(),
};

const mockS3Service = {
  generateDownloadUrl: jest.fn(),
};

const mockConfigService = {
  getOrThrow: jest.fn(),
};

describe('GeneratedDocumentsService', () => {
  let service: GeneratedDocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneratedDocumentsService,
        {
          provide: getRepositoryToken(GeneratedDocumentEntity),
          useValue: mockGeneratedDocRepository,
        },
        { provide: CasesService, useValue: mockCasesService },
        { provide: DocumentsService, useValue: mockDocumentsService },
        { provide: SqsService, useValue: mockSqsService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<GeneratedDocumentsService>(GeneratedDocumentsService);
    jest.clearAllMocks();
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateGeneratedDocumentDto = {
      documentId: 'doc-id',
      institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION,
    };

    beforeEach(() => {
      mockCasesService.findOne.mockResolvedValue(mockCase);
      mockDocumentsService.findOne.mockResolvedValue(mockDocument);
      mockGeneratedDocRepository.create.mockReturnValue(mockGeneratedDoc);
      mockGeneratedDocRepository.save.mockResolvedValue(mockGeneratedDoc);
      mockConfigService.getOrThrow.mockReturnValue(
        'http://sqs.us-east-1.amazonaws.com/123456789/afterlight-document-generation',
      );
      mockSqsService.sendMessage.mockResolvedValue(undefined);
    });

    it('should create a generated document and enqueue a generation job', async () => {
      const result = await service.create('user-id', 'case-id', dto);

      expect(mockCasesService.findOne).toHaveBeenCalledWith('user-id', 'case-id');
      expect(mockDocumentsService.findOne).toHaveBeenCalledWith('user-id', 'case-id', 'doc-id');
      expect(mockGeneratedDocRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: 'case-id',
          documentId: 'doc-id',
          institutionType: InstitutionType.SOCIAL_SECURITY_ADMINISTRATION,
          status: GeneratedDocumentStatus.GENERATING,
        }),
      );
      expect(mockSqsService.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          generatedDocumentId: mockGeneratedDoc.id,
          templateId: 'ssa-721',
          caseId: 'case-id',
          executorName: mockExecutorInfo.name,
          executorAddress: mockExecutorInfo.address,
          executorRelationship: mockExecutorInfo.relationship,
        }),
      );
      expect(result).toEqual(mockGeneratedDoc);
    });

    it('should use the correct template ID for every institution type', async () => {
      const cases: Array<[InstitutionType, string]> = [
        // Government
        [InstitutionType.SOCIAL_SECURITY_ADMINISTRATION, 'ssa-721'],
        [InstitutionType.MEDICARE, 'medicare'],
        [InstitutionType.IRS, 'irs-notification'],
        [InstitutionType.VETERANS_AFFAIRS, 'veterans-affairs'],
        [InstitutionType.STATE_DMV, 'dmv-notification'],
        [InstitutionType.VOTER_REGISTRATION, 'voter-registration'],
        [InstitutionType.PASSPORT, 'passport-cancellation'],
        // Financial
        [InstitutionType.BANK, 'bank-closure'],
        [InstitutionType.CREDIT_CARD, 'credit-card-cancellation'],
        [InstitutionType.PENSION_401K, 'pension-401k'],
        [InstitutionType.LIFE_INSURANCE, 'life-insurance'],
        // Utilities & Services
        [InstitutionType.USPS, 'usps-notification'],
        [InstitutionType.SUBSCRIPTION_STREAMING, 'subscription-cancellation'],
        [InstitutionType.SUBSCRIPTION_UTILITY, 'subscription-cancellation'],
        // Professional
        [InstitutionType.EMPLOYER_HR, 'employer-notification'],
        [InstitutionType.PROFESSIONAL_LICENSE_BOARD, 'professional-license'],
      ];

      for (const [institutionType, expectedTemplate] of cases) {
        jest.clearAllMocks();
        mockCasesService.findOne.mockResolvedValue(mockCase);
        mockDocumentsService.findOne.mockResolvedValue(mockDocument);
        mockGeneratedDocRepository.create.mockReturnValue({ ...mockGeneratedDoc, institutionType });
        mockGeneratedDocRepository.save.mockResolvedValue({ ...mockGeneratedDoc, institutionType });
        mockConfigService.getOrThrow.mockReturnValue('http://queue-url');
        mockSqsService.sendMessage.mockResolvedValue(undefined);

        await service.create('user-id', 'case-id', { documentId: 'doc-id', institutionType });

        expect(mockSqsService.sendMessage).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ templateId: expectedTemplate }),
        );
      }
    });

    it('should pass institutionName when provided', async () => {
      await service.create('user-id', 'case-id', {
        ...dto,
        institutionType: InstitutionType.BANK,
        institutionName: 'Chase Bank',
      });

      expect(mockGeneratedDocRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ institutionName: 'Chase Bank' }),
      );
      expect(mockSqsService.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ institutionName: 'Chase Bank' }),
      );
    });

    it('should throw UnprocessableEntityException when case has no executorInfo', async () => {
      mockCasesService.findOne.mockResolvedValue({ ...mockCase, executorInfo: null });

      await expect(service.create('user-id', 'case-id', dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mockSqsService.sendMessage).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when document is not yet processed', async () => {
      mockDocumentsService.findOne.mockResolvedValue({
        ...mockDocument,
        status: DocumentStatus.PENDING,
        extractedData: null,
      });

      await expect(service.create('user-id', 'case-id', dto)).rejects.toThrow(ConflictException);
      expect(mockSqsService.sendMessage).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when document has no extractedData', async () => {
      mockDocumentsService.findOne.mockResolvedValue({
        ...mockDocument,
        status: DocumentStatus.PROCESSED,
        extractedData: null,
      });

      await expect(service.create('user-id', 'case-id', dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all generated documents for the case', async () => {
      mockCasesService.findOne.mockResolvedValue(mockCase);
      mockGeneratedDocRepository.find.mockResolvedValue([mockGeneratedDoc]);

      const result = await service.findAll('user-id', 'case-id');

      expect(mockGeneratedDocRepository.find).toHaveBeenCalledWith({
        where: { caseId: 'case-id' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });

    it('should attach a pre-signed downloadUrl for READY documents', async () => {
      const readyDoc = {
        ...mockGeneratedDoc,
        status: GeneratedDocumentStatus.READY,
        s3Key: 'generated/case-id/ssa-721/gen-doc-id.pdf',
      };
      mockCasesService.findOne.mockResolvedValue(mockCase);
      mockGeneratedDocRepository.find.mockResolvedValue([readyDoc]);
      mockConfigService.getOrThrow.mockReturnValue('afterlight-generated-docs');
      mockS3Service.generateDownloadUrl.mockResolvedValue('https://s3.example.com/signed-url');

      const result = await service.findAll('user-id', 'case-id');

      expect(mockS3Service.generateDownloadUrl).toHaveBeenCalledWith(
        'afterlight-generated-docs',
        readyDoc.s3Key,
        900,
      );
      expect((result[0] as GeneratedDocumentEntity & { downloadUrl?: string }).downloadUrl).toBe(
        'https://s3.example.com/signed-url',
      );
    });

    it('should not generate download URLs for non-READY documents', async () => {
      mockCasesService.findOne.mockResolvedValue(mockCase);
      mockGeneratedDocRepository.find.mockResolvedValue([mockGeneratedDoc]); // GENERATING status

      await service.findAll('user-id', 'case-id');

      expect(mockS3Service.generateDownloadUrl).not.toHaveBeenCalled();
    });
  });

  // ── handleGenerationResult ────────────────────────────────────────────────

  describe('handleGenerationResult', () => {
    it('should update document status to READY with s3Key', async () => {
      const dto: GenerationResultDto = {
        generatedDocumentId: 'gen-doc-id',
        status: GeneratedDocumentStatus.READY,
        s3Key: 'generated/case-id/ssa-721/gen-doc-id.pdf',
      };

      const updated = {
        ...mockGeneratedDoc,
        status: GeneratedDocumentStatus.READY,
        s3Key: dto.s3Key,
      };

      mockGeneratedDocRepository.findOne.mockResolvedValue({ ...mockGeneratedDoc });
      mockGeneratedDocRepository.save.mockResolvedValue(updated);

      const result = await service.handleGenerationResult(dto);

      expect(mockGeneratedDocRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'gen-doc-id' },
      });
      expect(mockGeneratedDocRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: GeneratedDocumentStatus.READY,
          s3Key: dto.s3Key,
        }),
      );
      expect(result.status).toBe(GeneratedDocumentStatus.READY);
    });

    it('should update document status to FAILED with errorMessage', async () => {
      const dto: GenerationResultDto = {
        generatedDocumentId: 'gen-doc-id',
        status: GeneratedDocumentStatus.FAILED,
        errorMessage: 'Generation failed: WeasyPrintError',
      };

      const updated = {
        ...mockGeneratedDoc,
        status: GeneratedDocumentStatus.FAILED,
        errorMessage: dto.errorMessage,
      };

      mockGeneratedDocRepository.findOne.mockResolvedValue({ ...mockGeneratedDoc });
      mockGeneratedDocRepository.save.mockResolvedValue(updated);

      const result = await service.handleGenerationResult(dto);

      expect(mockGeneratedDocRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: GeneratedDocumentStatus.FAILED,
          errorMessage: dto.errorMessage,
        }),
      );
      expect(result.status).toBe(GeneratedDocumentStatus.FAILED);
    });

    it('should throw NotFoundException when generated document is not found', async () => {
      const dto: GenerationResultDto = {
        generatedDocumentId: 'non-existent-id',
        status: GeneratedDocumentStatus.READY,
      };

      mockGeneratedDocRepository.findOne.mockResolvedValue(null);

      await expect(service.handleGenerationResult(dto)).rejects.toThrow(NotFoundException);
    });
  });
});
