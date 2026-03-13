import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

@Injectable()
export class SqsService {
  private readonly logger = new Logger(SqsService.name);
  private readonly client: SQSClient;

  constructor(private readonly config: ConfigService) {
    this.client = new SQSClient({
      region: config.getOrThrow<string>('AWS_REGION'),
    });
  }

  async sendMessage(queueUrl: string, body: Record<string, unknown>): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
    });

    await this.client.send(command);
    this.logger.log(`Sent SQS message to queue: ${queueUrl}`);
  }
}
