import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@afterlight/shared';
import { UserEntity } from '../entities/user.entity';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';

const mockUserRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(UserEntity), useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    const dto: CreateUserDto = {
      email: 'new@example.com',
      password: 'password123',
      firstName: 'Jane',
      lastName: 'Smith',
    };

    it('should create a user with isApproved=true and a hashed password', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({ id: 'new-id', email: dto.email });
      mockUserRepository.save.mockResolvedValue({ id: 'new-id', email: dto.email });

      const result = await service.createUser(dto);

      expect(result).toEqual({ id: 'new-id', email: dto.email });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const createCall = mockUserRepository.create.mock.calls[0]?.[0] as {
        passwordHash: string;
        isApproved: boolean;
        role: UserRole;
      };
      expect(createCall.isApproved).toBe(true);
      expect(createCall.role).toBe(UserRole.USER);
      const passwordMatches = await bcrypt.compare(dto.password, createCall.passwordHash);
      expect(passwordMatches).toBe(true);
    });

    it('should set ADMIN role when specified', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({ id: 'admin-id', email: dto.email });
      mockUserRepository.save.mockResolvedValue({ id: 'admin-id', email: dto.email });

      await service.createUser({ ...dto, role: UserRole.ADMIN });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const createCall = mockUserRepository.create.mock.calls[0]?.[0] as { role: UserRole };
      expect(createCall.role).toBe(UserRole.ADMIN);
    });

    it('should throw ConflictException if email is already taken', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: 'existing-id' });

      await expect(service.createUser(dto)).rejects.toThrow(ConflictException);
      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });
  });
});
