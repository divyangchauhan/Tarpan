import { Test, TestingModule } from '@nestjs/testing';
import { GeneratedDocumentStatus, InstitutionType, UserRole } from '@afterlight/shared';
import { GeneratedDocumentsController } from './generated-documents.controller';
import { GeneratedDocumentsService } from './generated-documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import type { CreateGeneratedDocumentDto } from './dto/create-generated-document.dto';
import type { GenerationResultDto } from './dto/generation-result.dto';
import type { JwtValidatedUser } from '../auth/strategies/jwt.strategy';
import type { Request as ExpressRequest } from 'express';

const userId = 'user-uuid';
const caseId = 'case-uuid';
const genDocId = 'gen-doc-uuid';

const mockUser: JwtValidatedUser = { userId, email: 'u@example.com', role: UserRole.USER };
const makeReq = (): ExpressRequest & { user: JwtValidatedUser } =>
  ({ user: mockUser }) as unknown as ExpressRequest & { user: JwtValidatedUser };

const mockGenDoc = {
  id: genDocId,
  caseId,
  documentId: 'doc-uuid',
  institutionType: InstitutionType.BANK,
  institutionName: null,
  status: GeneratedDocumentStatus.PENDING,
  s3Key: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockGeneratedDocumentsService = {
  create: jest.fn(),
  findAll: jest.fn(),
  handleGenerationResult: jest.fn(),
};

describe('GeneratedDocumentsController', () => {
  let controller: GeneratedDocumentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeneratedDocumentsController],
      providers: [{ provide: GeneratedDocumentsService, useValue: mockGeneratedDocumentsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(InternalSecretGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GeneratedDocumentsController>(GeneratedDocumentsController);
    jest.clearAllMocks();
  });

  it('should create a generated document', async () => {
    const dto: CreateGeneratedDocumentDto = {
      documentId: 'doc-uuid',
      institutionType: InstitutionType.BANK,
    };
    mockGeneratedDocumentsService.create.mockResolvedValue(mockGenDoc);

    const result = await controller.create(makeReq(), caseId, dto);

    expect(mockGeneratedDocumentsService.create).toHaveBeenCalledWith(userId, caseId, dto);
    expect(result).toEqual(mockGenDoc);
  });

  it('should return all generated documents for a case', async () => {
    mockGeneratedDocumentsService.findAll.mockResolvedValue([mockGenDoc]);

    const result = await controller.findAll(makeReq(), caseId);

    expect(mockGeneratedDocumentsService.findAll).toHaveBeenCalledWith(userId, caseId);
    expect(result).toEqual([mockGenDoc]);
  });

  it('should handle a generation result callback', async () => {
    const dto: GenerationResultDto = {
      generatedDocumentId: genDocId,
      status: GeneratedDocumentStatus.READY,
      s3Key: 'generated/doc.pdf',
    };
    mockGeneratedDocumentsService.handleGenerationResult.mockResolvedValue({
      ...mockGenDoc,
      status: GeneratedDocumentStatus.READY,
      s3Key: 'generated/doc.pdf',
    });

    const result = await controller.handleGenerationResult(dto);

    expect(mockGeneratedDocumentsService.handleGenerationResult).toHaveBeenCalledWith(dto);
    expect(result.status).toBe(GeneratedDocumentStatus.READY);
  });
});
