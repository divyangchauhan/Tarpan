import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { HealthCheckService, TypeOrmHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';

describe('AppController', () => {
  let appController: AppController;
  let healthCheckService: jest.Mocked<HealthCheckService>;

  beforeEach(async () => {
    const mockResult = {
      status: 'ok',
      info: { database: { status: 'up' }, memory_heap: { status: 'up' } },
      error: {},
      details: { database: { status: 'up' }, memory_heap: { status: 'up' } },
    };

    healthCheckService = {
      check: jest.fn().mockResolvedValue(mockResult),
    } as unknown as jest.Mocked<HealthCheckService>;

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: TypeOrmHealthIndicator, useValue: { pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }) } },
        { provide: MemoryHealthIndicator, useValue: { checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }) } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return status ok with db and memory checks', async () => {
      const result = await appController.getHealth();
      expect(result.status).toBe('ok');
      expect(healthCheckService.check).toHaveBeenCalledTimes(1);
    });
  });
});
