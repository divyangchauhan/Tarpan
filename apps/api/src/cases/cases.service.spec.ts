import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CaseStatus } from '@afterlight/shared';
import { CaseEntity } from '../entities/case.entity';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';

const mockDeceasedInfo = {
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1940-01-01',
  dateOfDeath: '2024-01-01',
  placeOfDeath: 'New York, NY',
};

const mockCase: CaseEntity = {
  id: 'case-id',
  userId: 'user-id',
  status: CaseStatus.ACTIVE,
  deceasedInfo: mockDeceasedInfo,
  executorInfo: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: null as unknown as import('../entities/user.entity').UserEntity,
  documents: [],
  generatedDocuments: [],
};

const mockCaseRepository = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
};

describe('CasesService', () => {
  let service: CasesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CasesService,
        {
          provide: getRepositoryToken(CaseEntity),
          useValue: mockCaseRepository,
        },
      ],
    }).compile();

    service = module.get<CasesService>(CasesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should save a case with executorInfo and return it', async () => {
      const mockExecutorInfo = {
        name: 'Jane Doe',
        address: '123 Main St',
        relationship: 'Daughter',
      };
      const dto: CreateCaseDto = { executorInfo: mockExecutorInfo };

      mockCaseRepository.create.mockReturnValue(mockCase);
      mockCaseRepository.save.mockResolvedValue(mockCase);

      const result = await service.create('user-id', dto);

      expect(mockCaseRepository.create).toHaveBeenCalledWith({
        userId: 'user-id',
        deceasedInfo: null,
        executorInfo: mockExecutorInfo,
      });
      expect(mockCaseRepository.save).toHaveBeenCalledWith(mockCase);
      expect(result).toEqual(mockCase);
    });
  });

  describe('findAll', () => {
    it('should return all cases for the given user', async () => {
      mockCaseRepository.find.mockResolvedValue([mockCase]);

      const result = await service.findAll('user-id');

      expect(mockCaseRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
        order: { createdAt: 'DESC' },
        relations: { generatedDocuments: true },
      });
      expect(result).toEqual([mockCase]);
    });
  });

  describe('findOne', () => {
    it('should return a case when found for the correct user', async () => {
      mockCaseRepository.findOne.mockResolvedValue(mockCase);

      const result = await service.findOne('user-id', 'case-id');

      expect(mockCaseRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'case-id', userId: 'user-id' },
      });
      expect(result).toEqual(mockCase);
    });

    it('should throw NotFoundException when case does not belong to user', async () => {
      mockCaseRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('different-user-id', 'case-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockCaseRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('user-id', 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update status when provided', async () => {
      const dto: UpdateCaseDto = { status: CaseStatus.COMPLETED };
      const updated = { ...mockCase, status: CaseStatus.COMPLETED };

      mockCaseRepository.findOne.mockResolvedValue({ ...mockCase });
      mockCaseRepository.save.mockResolvedValue(updated);

      const result = await service.update('user-id', 'case-id', dto);

      expect(mockCaseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: CaseStatus.COMPLETED }),
      );
      expect(result.status).toBe(CaseStatus.COMPLETED);
    });

    it('should merge deceasedInfo patch without overwriting unchanged fields', async () => {
      const dto: UpdateCaseDto = {
        deceasedInfo: { firstName: 'Updated' } as NonNullable<UpdateCaseDto['deceasedInfo']>,
      };
      const updated = {
        ...mockCase,
        deceasedInfo: { ...mockDeceasedInfo, firstName: 'Updated' },
      };

      mockCaseRepository.findOne.mockResolvedValue({ ...mockCase });
      mockCaseRepository.save.mockResolvedValue(updated);

      const result = await service.update('user-id', 'case-id', dto);

      expect(mockCaseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deceasedInfo: expect.objectContaining({
            firstName: 'Updated',
            lastName: mockDeceasedInfo.lastName,
          }),
        }),
      );
      expect(result.deceasedInfo?.firstName).toBe('Updated');
    });

    it('should set executorInfo when provided', async () => {
      const executorInfo = {
        name: 'Jane Doe',
        address: '123 Main St',
        relationship: 'Daughter',
      };
      const dto: UpdateCaseDto = { executorInfo };

      mockCaseRepository.findOne.mockResolvedValue({ ...mockCase, executorInfo: null });
      mockCaseRepository.save.mockResolvedValue({ ...mockCase, executorInfo });

      const result = await service.update('user-id', 'case-id', dto);

      expect(mockCaseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          executorInfo: expect.objectContaining({ name: 'Jane Doe' }),
        }),
      );
      expect(result.executorInfo?.name).toBe('Jane Doe');
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockCaseRepository.findOne.mockResolvedValue(null);

      await expect(service.update('user-id', 'non-existent-id', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should remove the case', async () => {
      mockCaseRepository.findOne.mockResolvedValue(mockCase);
      mockCaseRepository.remove.mockResolvedValue(undefined);

      await service.remove('user-id', 'case-id');

      expect(mockCaseRepository.remove).toHaveBeenCalledWith(mockCase);
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockCaseRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('user-id', 'non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });
});
