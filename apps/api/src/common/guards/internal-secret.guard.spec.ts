import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { InternalSecretGuard } from './internal-secret.guard';

function makeContext(secretHeader?: string): ExecutionContext {
  const request = {
    headers: secretHeader !== undefined ? { 'x-internal-secret': secretHeader } : {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('correct-secret'),
};

describe('InternalSecretGuard', () => {
  let guard: InternalSecretGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InternalSecretGuard, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    guard = module.get<InternalSecretGuard>(InternalSecretGuard);
    jest.clearAllMocks();
    mockConfigService.getOrThrow.mockReturnValue('correct-secret');
  });

  it('should allow the request when the secret matches', () => {
    const ctx = makeContext('correct-secret');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw UnauthorizedException when the secret is wrong', () => {
    const ctx = makeContext('wrong-secret');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when the header is missing', () => {
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
