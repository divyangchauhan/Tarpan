import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SqsService } from './sqs.service';

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  SendMessageCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const mockSend = jest.fn();
(SQSClient as jest.Mock).mockImplementation(() => ({ send: mockSend }));

const mockConfigService = {
  get: jest.fn(),
  getOrThrow: jest.fn(),
};

describe('SqsService', () => {
  let service: SqsService;

  beforeEach(async () => {
    mockConfigService.get.mockReturnValue(undefined);
    mockConfigService.getOrThrow.mockReturnValue('us-east-1');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SqsService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SqsService>(SqsService);
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  describe('sendMessage', () => {
    it('should serialize the body to JSON and send to the queue', async () => {
      const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123/my-queue';
      const body = { documentId: 'doc-123', s3Key: 'uploads/doc-123.pdf' };

      await service.sendMessage(queueUrl, body);

      expect(SendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(body),
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from the SQS client', async () => {
      mockSend.mockRejectedValue(new Error('SQS unavailable'));

      await expect(
        service.sendMessage('https://queue-url', { key: 'value' }),
      ).rejects.toThrow('SQS unavailable');
    });
  });
});
