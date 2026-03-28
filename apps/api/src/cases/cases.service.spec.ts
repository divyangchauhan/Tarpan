import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CaseStatus } from '@afterlight/shared';
import { CaseEntity } from '../entities/case.entity';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';

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
    it('should save a case and return it', async () => {
      const dto: CreateCaseDto = { deceasedInfo: mockDeceasedInfo };

      mockCaseRepository.create.mockReturnValue(mockCase);
      mockCaseRepository.save.mockResolvedValue(mockCase);

      const result = await service.create('user-id', dto);

      expect(mockCaseRepository.create).toHaveBeenCalledWith({
        userId: 'user-id',
        deceasedInfo: mockDeceasedInfo,
        executorInfo: null,
      });
      expect(mockCaseRepository.save).toHaveBeenCalledWith(mockCase);
      expect(result).toEqual(mockCase);
    });
  });

  describe('findAll', () => {
    it("should return all cases for the given user", async () => {
      mockCaseRepository.find.mockResolvedValue([mockCase]);

      const result = await service.findAll('user-id');

      expect(mockCaseRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
        order: { createdAt: 'DESC' },
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
});
