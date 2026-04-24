import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';
import type { Request } from 'express';
import { UserRole, type JwtPayload } from '@afterlight/shared';

// PassportStrategy calls super() which reads the config — mock before module init
const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('test-refresh-secret'),
};

describe('JwtRefreshStrategy', () => {
  let strategy: JwtRefreshStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtRefreshStrategy, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    strategy = module.get<JwtRefreshStrategy>(JwtRefreshStrategy);
  });

  describe('validate', () => {
    it('should return userId and refreshToken from the request', () => {
      const req = {
        get: jest.fn().mockReturnValue('Bearer my-refresh-token'),
      } as unknown as Request;

      const payload: JwtPayload = {
        sub: 'user-id',
        email: 'user@example.com',
        role: UserRole.USER,
      };

      const result = strategy.validate(req, payload);

      expect(result).toEqual({
        userId: 'user-id',
        refreshToken: 'my-refresh-token',
      });
    });

    it('should return an empty refreshToken when Authorization header is missing', () => {
      const req = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as Request;

      const payload: JwtPayload = {
        sub: 'user-id',
        email: 'user@example.com',
        role: UserRole.USER,
      };

      const result = strategy.validate(req, payload);

      expect(result.refreshToken).toBe('');
    });
  });
});
