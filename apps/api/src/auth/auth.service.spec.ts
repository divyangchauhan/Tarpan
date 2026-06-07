import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@tarpan/shared';
import { UserEntity } from '../entities/user.entity';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const mockUser: UserEntity = {
  id: 'test-user-id',
  email: 'test@example.com',
  passwordHash: 'hashedpassword',
  firstName: 'John',
  lastName: 'Doe',
  role: UserRole.USER,
  createdAt: new Date(),
  updatedAt: new Date(),
  cases: [],
};

const mockUserRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-token'),
};

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('mock-secret'),
  get: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'new@example.com',
      password: 'password123',
      firstName: 'Jane',
      lastName: 'Smith',
    };

    it('should create a user with a hashed password and return tokens', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({ ...mockUser, email: registerDto.email });
      mockUserRepository.save.mockResolvedValue({ ...mockUser, email: registerDto.email });
      mockJwtService.sign.mockReturnValue('mock-token');

      const result = await service.register(registerDto);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
        }),
      );
      // Password should be hashed, not stored as plain text
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const createArg = mockUserRepository.create.mock.calls[0]?.[0] as {
        passwordHash: string;
      };
      expect(createArg.passwordHash).not.toBe(registerDto.password);

      expect(result).toEqual({ accessToken: 'mock-token', refreshToken: 'mock-token' });
    });

    it('should throw ConflictException if email is already registered', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'plainpassword',
    };

    it('should return tokens for valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('plainpassword', 10);
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
      });
      mockJwtService.sign.mockReturnValue('mock-token');

      const result = await service.login(loginDto);

      expect(result).toEqual({ accessToken: 'mock-token', refreshToken: 'mock-token' });
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const hashedPassword = await bcrypt.hash('differentpassword', 10);
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
      });

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('generateTokens', () => {
    it('should return an object with accessToken and refreshToken', () => {
      mockJwtService.sign.mockReturnValue('mock-token');

      const result = service.generateTokens('user-id', 'user@example.com', UserRole.USER);

      expect(result).toEqual({ accessToken: 'mock-token', refreshToken: 'mock-token' });
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('refresh', () => {
    it('should return two distinct new tokens for a valid user', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockJwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      const result = await service.refresh('test-user-id', 'old-refresh-token');

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-user-id' },
      });
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.refresh('unknown-id', 'some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should not throw (stateless JWT)', () => {
      expect(() => service.logout('user-id')).not.toThrow();
    });
  });
});
