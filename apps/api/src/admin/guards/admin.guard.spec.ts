import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { UserRole } from '@afterlight/shared';
import { AdminGuard } from './admin.guard';

function makeContext(role: UserRole | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role !== undefined ? { role } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it('should allow ADMIN users', () => {
    expect(guard.canActivate(makeContext(UserRole.ADMIN))).toBe(true);
  });

  it('should throw ForbiddenException for USER role', () => {
    expect(() => guard.canActivate(makeContext(UserRole.USER))).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user is undefined', () => {
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
