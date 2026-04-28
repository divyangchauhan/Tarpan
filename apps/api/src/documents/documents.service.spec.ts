import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DocumentStatus, DocumentType, CaseStatus } from '@afterlight/shared';
import { DocumentEntity } from '../entities/document.entity';
import { CaseEntity } from '../entities/case.entity';
import { CasesService } from '../cases/cases.service';
import { S3Service } from '../aws/s3.service';
import { SqsService } from '../aws/sqs.service';
import { EventsGateway } from '../events/events.gateway';
import { DocumentsService } from './documents.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { ProcessingResultDto } from './dto/processing-result.dto';

const mockCase: CaseEntity = {
  id: 'case-id',
  userId: 'user-id',
  status: CaseStatus.ACTIVE,
  deceasedInfo: {
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1940-01-01',
    dateOfDeath: '2024-01-01',
    placeOfDeath: 'New York, NY',
  },
  executorInfo: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: null as unknown as import('../entities/user.entity').UserEntity,
  documents: [],
  generatedDocuments: [],
};

const mockDocument: DocumentEntity = {
  id: 'doc-id',
  caseId: 'case-id',
  type: DocumentType.DEATH_CERTIFICATE,
  status: DocumentStatus.PENDING,
  s3Key: 'cases/case-id/documents/doc-id.pdf',
  extractedData: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  case: mockCase,
};

const mockDocumentRepository = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
};

const mockCasesService = {
  findOne: jest.fn(),
  updateDeceasedInfoByCaseId: jest.fn(),
};

const mockS3Service = {
  generateUploadUrl: jest.fn(),
  generateDownloadUrl: jest.fn(),
};

const mockSqsService = {
  sendMessage: jest.fn(),
};

const mockEventsGateway = {
  emitDocumentStatus: jest.fn(),
};

const mockConfigService = {
  getOrThrow: jest.fn(),
};

describe('DocumentsService', () => {
  let service: DocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getRepositoryToken(DocumentEntity),
          useValue: mockDocumentRepository,
        },
        {
          provide: CasesService,
          useValue: mockCasesService,
        },
        {
          provide: S3Service,
          useValue: mockS3Service,
        },
        {
          provide: SqsService,
          useValue: mockSqsService,
        },
        {
          provide: EventsGateway,
          useValue: mockEventsGateway,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    jest.clearAllMocks();
  });

  describe('initiateUpload', () => {
    const dto: InitiateUploadDto = {
      fileName: 'death-cert.pdf',
      contentType: 'application/pdf',
    };

    it('should create a document and return an upload URL', async () => {
      mockCasesService.findOne.mockResolvedValue(mockCase);
      mockS3Service.generateUploadUrl.mockResolvedValue('https://s3.example.com/upload');
      mockDocumentRepository.create.mockReturnValue(mockDocument);
      mockDocumentRepository.save.mockResolvedValue(mockDocument);
      mockConfigService.getOrThrow.mockReturnValue('test-bucket');

      const result = await service.initiateUpload('user-id', 'case-id', dto);

      expect(mockCasesService.findOne).toHaveBeenCalledWith('user-id', 'case-id');
      expect(mockS3Service.generateUploadUrl).toHaveBeenCalledWith(
        'test-bucket',
        expect.stringContaining('cases/case-id/documents/'),
        'application/pdf',
        900,
      );
      expect(result.uploadUrl).toBe('https://s3.example.com/upload');
      expect(result.document).toEqual(mockDocument);
    });

    it('should propagate NotFoundException from CasesService when case not found', async () => {
      mockCasesService.findOne.mockRejectedValue(new NotFoundException('Case not found'));

      await expect(service.initiateUpload('user-id', 'case-id', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all documents for the case', async () => {
      mockCasesService.findOne.mockResolvedValue(mockCase);
      mockDocumentRepository.find.mockResolvedValue([mockDocument]);

      const result = await service.findAll('user-id', 'case-id');

      expect(mockDocumentRepository.find).toHaveBeenCalledWith({
        where: { caseId: 'case-id' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual([mockDocument]);
    });
  });

  describe('findOne', () => {
    it('should return a document when found', async () => {
      mockCasesService.findOne.mockResolvedValue(mockCase);
      mockDocumentRepository.findOne.mockResolvedValue(mockDocument);

      const result = await service.findOne('user-id', 'case-id', 'doc-id');

      expect(mockDocumentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'doc-id', caseId: 'case-id' },
      });
      expect(result).toEqual(mockDocument);
    });

    it('should throw NotFoundException when document does not exist', async () => {
      mockCasesService.findOne.mockResolvedValue(mockCase);
      mockDocumentRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('user-id', 'case-id', 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('enqueueProcessing', () => {
    it('should update document status to PROCESSING and enqueue an SQS message', async () => {
      const processingDoc = { ...mockDocument, status: DocumentStatus.PROCESSING };

      mockCasesService.findOne.mockResolvedValue(mockCase);
      mockDocumentRepository.findOne.mockResolvedValue({ ...mockDocument });
      mockDocumentRepository.save.mockResolvedValue(processingDoc);
      mockConfigService.getOrThrow.mockReturnValue('https://sqs.url/processing-queue');
      mockSqsService.sendMessage.mockResolvedValue(undefined);

      const result = await service.enqueueProcessing('user-id', 'case-id', 'doc-id');

      expect(mockDocumentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: DocumentStatus.PROCESSING }),
      );
      expect(mockSqsService.sendMessage).toHaveBeenCalledWith(
        'https://sqs.url/processing-queue',
        expect.objectContaining({ documentId: 'doc-id', s3Key: mockDocument.s3Key }),
      );
      expect(result.status).toBe(DocumentStatus.PROCESSING);
    });
  });

  describe('handleProcessingResult', () => {
    it('should update document status and emit WebSocket event on PROCESSED', async () => {
      const extractedData = {
        firstName: 'John',
        extractionConfidence: 0.95,
        needsReview: false,
      };

      const dto: ProcessingResultDto = {
        documentId: 'doc-id',
        status: DocumentStatus.PROCESSED,
        extractedData: extractedData as import('@afterlight/shared').ExtractedCertificateData,
      };

      const updatedDocument = {
        ...mockDocument,
        status: DocumentStatus.PROCESSED,
        extractedData,
      };

      mockDocumentRepository.findOne.mockResolvedValue({ ...mockDocument });
      mockDocumentRepository.save.mockResolvedValue(updatedDocument);

      const result = await service.handleProcessingResult(dto);

      expect(mockDocumentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'doc-id' },
      });
      expect(mockDocumentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: DocumentStatus.PROCESSED }),
      );
      expect(mockEventsGateway.emitDocumentStatus).toHaveBeenCalledWith(
        'case-id',
        'doc-id',
        DocumentStatus.PROCESSED,
        expect.objectContaining({ extractedData }),
      );
      expect(result.status).toBe(DocumentStatus.PROCESSED);
    });

    it('should update document with errorMessage on FAILED status', async () => {
      const dto: ProcessingResultDto = {
        documentId: 'doc-id',
        status: DocumentStatus.FAILED,
        errorMessage: 'Could not parse document',
      };

      const updatedDocument = {
        ...mockDocument,
        status: DocumentStatus.FAILED,
        errorMessage: 'Could not parse document',
      };

      mockDocumentRepository.findOne.mockResolvedValue({ ...mockDocument });
      mockDocumentRepository.save.mockResolvedValue(updatedDocument);

      const result = await service.handleProcessingResult(dto);

      expect(mockDocumentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: DocumentStatus.FAILED,
          errorMessage: 'Could not parse document',
        }),
      );
      expect(mockEventsGateway.emitDocumentStatus).toHaveBeenCalledWith(
        'case-id',
        'doc-id',
        DocumentStatus.FAILED,
        expect.objectContaining({ errorMessage: 'Could not parse document' }),
      );
      expect(result.status).toBe(DocumentStatus.FAILED);
    });

    it('should throw NotFoundException when document not found', async () => {
      const dto: ProcessingResultDto = {
        documentId: 'non-existent-id',
        status: DocumentStatus.PROCESSED,
      };

      mockDocumentRepository.findOne.mockResolvedValue(null);

      await expect(service.handleProcessingResult(dto)).rejects.toThrow(NotFoundException);
    });
  });
});
