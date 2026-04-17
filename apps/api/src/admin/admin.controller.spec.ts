import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@afterlight/shared';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';

const mockAdminService = {
  createUser: jest.fn(),
};

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: mockAdminService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
    jest.clearAllMocks();
  });

  it('should create a user and return id and email', async () => {
    const dto: CreateUserDto = {
      email: 'new@example.com',
      password: 'password123',
      firstName: 'Jane',
      lastName: 'Smith',
      role: UserRole.USER,
    };
    mockAdminService.createUser.mockResolvedValue({ id: 'new-id', email: dto.email });

    const result = await controller.createUser(dto);

    expect(mockAdminService.createUser).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'new-id', email: dto.email });
  });
});
