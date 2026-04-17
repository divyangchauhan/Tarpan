import { Test, TestingModule } from '@nestjs/testing';
import { DocumentStatus, DocumentType, UserRole } from '@afterlight/shared';
import { DocumentsController } from './documents.controller';
import { DocumentsService, InitiateUploadResult } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InternalSecretGuard } from './guards/internal-secret.guard';
import type { InitiateUploadDto } from './dto/initiate-upload.dto';
import type { ProcessingResultDto } from './dto/processing-result.dto';
import type { JwtValidatedUser } from '../auth/strategies/jwt.strategy';
import type { Request as ExpressRequest } from 'express';

const userId = 'user-uuid';
const caseId = 'case-uuid';
const docId = 'doc-uuid';

const mockUser: JwtValidatedUser = { userId, email: 'u@example.com', role: UserRole.USER };
const makeReq = (): ExpressRequest & { user: JwtValidatedUser } =>
  ({ user: mockUser }) as unknown as ExpressRequest & { user: JwtValidatedUser };

const mockDoc = {
  id: docId,
  caseId,
  type: DocumentType.DEATH_CERTIFICATE,
  status: DocumentStatus.PENDING,
  s3Key: 'some/key',
  extractedData: null,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDocumentsService = {
  findAll: jest.fn(),
  initiateUpload: jest.fn(),
  findOne: jest.fn(),
  enqueueProcessing: jest.fn(),
  handleProcessingResult: jest.fn(),
};

describe('DocumentsController', () => {
  let controller: DocumentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [{ provide: DocumentsService, useValue: mockDocumentsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(InternalSecretGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DocumentsController>(DocumentsController);
    jest.clearAllMocks();
  });

  it('should return all documents for a case', async () => {
    mockDocumentsService.findAll.mockResolvedValue([mockDoc]);

    const result = await controller.findAll(makeReq(), caseId);

    expect(mockDocumentsService.findAll).toHaveBeenCalledWith(userId, caseId);
    expect(result).toEqual([mockDoc]);
  });

  it('should initiate an upload and return presigned URL info', async () => {
    const dto: InitiateUploadDto = { fileName: 'cert.pdf', contentType: 'application/pdf' };
    const uploadResult: InitiateUploadResult = {
      document: mockDoc as never,
      uploadUrl: 'https://s3.example.com/presigned',
    };
    mockDocumentsService.initiateUpload.mockResolvedValue(uploadResult);

    const result = await controller.initiateUpload(makeReq(), caseId, dto);

    expect(mockDocumentsService.initiateUpload).toHaveBeenCalledWith(userId, caseId, dto);
    expect(result).toEqual(uploadResult);
  });

  it('should return a single document', async () => {
    mockDocumentsService.findOne.mockResolvedValue(mockDoc);

    const result = await controller.findOne(makeReq(), caseId, docId);

    expect(mockDocumentsService.findOne).toHaveBeenCalledWith(userId, caseId, docId);
    expect(result).toEqual(mockDoc);
  });

  it('should enqueue processing and return the document', async () => {
    mockDocumentsService.enqueueProcessing.mockResolvedValue({
      ...mockDoc,
      status: DocumentStatus.PROCESSING,
    });

    const result = await controller.enqueueProcessing(makeReq(), caseId, docId);

    expect(mockDocumentsService.enqueueProcessing).toHaveBeenCalledWith(userId, caseId, docId);
    expect(result.status).toBe(DocumentStatus.PROCESSING);
  });

  it('should handle a processing result callback', async () => {
    const dto: ProcessingResultDto = {
      documentId: docId,
      status: DocumentStatus.PROCESSED,
    };
    mockDocumentsService.handleProcessingResult.mockResolvedValue({
      ...mockDoc,
      status: DocumentStatus.PROCESSED,
    });

    const result = await controller.handleProcessingResult(dto);

    expect(mockDocumentsService.handleProcessingResult).toHaveBeenCalledWith(dto);
    expect(result.status).toBe(DocumentStatus.PROCESSED);
  });
});
