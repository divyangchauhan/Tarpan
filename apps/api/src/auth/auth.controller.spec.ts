import { Test, TestingModule } from '@nestjs/testing';
import { UserRole, type AuthTokens } from '@tarpan/shared';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { JwtRefreshValidatedUser } from './strategies/jwt-refresh.strategy';
import type { JwtValidatedUser } from './strategies/jwt.strategy';

const mockTokens: AuthTokens = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
};

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should register and return tokens', async () => {
    mockAuthService.register.mockResolvedValue(mockTokens);
    const dto: RegisterDto = {
      email: 'user@example.com',
      password: 'password',
      firstName: 'John',
      lastName: 'Doe',
    };

    const result = await controller.register(dto);

    expect(mockAuthService.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockTokens);
  });

  it('should login and return tokens', async () => {
    mockAuthService.login.mockResolvedValue(mockTokens);
    const dto: LoginDto = { email: 'user@example.com', password: 'password' };

    const result = await controller.login(dto);

    expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockTokens);
  });

  it('should refresh tokens using user from request', async () => {
    mockAuthService.refresh.mockResolvedValue(mockTokens);
    const req = {
      user: { userId: 'user-id', refreshToken: 'old-token' } as JwtRefreshValidatedUser,
    } as Parameters<typeof controller.refresh>[0];

    const result = await controller.refresh(req);

    expect(mockAuthService.refresh).toHaveBeenCalledWith('user-id', 'old-token');
    expect(result).toEqual(mockTokens);
  });

  it('should call logout with userId from request', () => {
    const req = {
      user: { userId: 'user-id', email: 'u@example.com', role: UserRole.USER } as JwtValidatedUser,
    } as Parameters<typeof controller.logout>[0];

    controller.logout(req);

    expect(mockAuthService.logout).toHaveBeenCalledWith('user-id');
  });
});
