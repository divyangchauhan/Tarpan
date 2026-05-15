import { Test, TestingModule } from '@nestjs/testing';
import { CaseStatus, UserRole } from '@tarpan/shared';
import { CaseEntity } from '../entities/case.entity';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import type { JwtValidatedUser } from '../auth/strategies/jwt.strategy';
import type { Request as ExpressRequest } from 'express';

interface AuthenticatedRequest extends ExpressRequest {
  user: JwtValidatedUser;
}

const mockUser: JwtValidatedUser = {
  userId: 'user-id',
  email: 'user@example.com',
  role: UserRole.USER,
};

const mockReq = { user: mockUser } as AuthenticatedRequest;

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
  executorInfo: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: null as unknown as import('../entities/user.entity').UserEntity,
  documents: [],
  generatedDocuments: [],
};

const mockCasesService = {
  findAll: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('CasesController', () => {
  let controller: CasesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CasesController],
      providers: [{ provide: CasesService, useValue: mockCasesService }],
    }).compile();

    controller = module.get<CasesController>(CasesController);
    jest.clearAllMocks();
  });

  it('should return all cases for the authenticated user', async () => {
    mockCasesService.findAll.mockResolvedValue([mockCase]);

    const result = await controller.findAll(mockReq);

    expect(mockCasesService.findAll).toHaveBeenCalledWith('user-id');
    expect(result).toEqual([mockCase]);
  });

  it('should create a case', async () => {
    mockCasesService.create.mockResolvedValue(mockCase);
    const dto = {
      executorInfo: { name: 'Jane Doe', address: '123 Main St', relationship: 'Daughter' },
    };

    const result = await controller.create(mockReq, dto);

    expect(mockCasesService.create).toHaveBeenCalledWith('user-id', dto);
    expect(result).toEqual(mockCase);
  });

  it('should return a single case by id', async () => {
    mockCasesService.findOne.mockResolvedValue(mockCase);

    const result = await controller.findOne(mockReq, 'case-id');

    expect(mockCasesService.findOne).toHaveBeenCalledWith('user-id', 'case-id');
    expect(result).toEqual(mockCase);
  });

  it('should update a case', async () => {
    const updated = { ...mockCase, status: CaseStatus.COMPLETED };
    mockCasesService.update.mockResolvedValue(updated);

    const result = await controller.update(mockReq, 'case-id', { status: CaseStatus.COMPLETED });

    expect(mockCasesService.update).toHaveBeenCalledWith('user-id', 'case-id', {
      status: CaseStatus.COMPLETED,
    });
    expect(result.status).toBe(CaseStatus.COMPLETED);
  });

  it('should remove a case', async () => {
    mockCasesService.remove.mockResolvedValue(undefined);

    await controller.remove(mockReq, 'case-id');

    expect(mockCasesService.remove).toHaveBeenCalledWith('user-id', 'case-id');
  });
});
