import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { resourceName } from '../config';

/**
 * MessagingStack — two SQS queues (processing + generation) each with a DLQ.
 *
 * - Processing queue: death certificate parse jobs
 * - Generation queue: PDF rendering jobs
 * - DLQs retain failed messages for 14 days for manual replay
 *
 * P4-03
 */
export class MessagingStack extends cdk.Stack {
  public readonly processingQueue: sqs.Queue;
  public readonly generationQueue: sqs.Queue;
  public readonly processingDlq: sqs.Queue;
  public readonly generationDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Processing DLQ ────────────────────────────────────────────────────

    this.processingDlq = new sqs.Queue(this, 'ProcessingDlq', {
      queueName: resourceName('document-processing-dlq'),
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // ── Processing queue ──────────────────────────────────────────────────

    this.processingQueue = new sqs.Queue(this, 'ProcessingQueue', {
      queueName: resourceName('document-processing'),
      // Claude API calls can take up to 30s; give Lambda plenty of headroom
      visibilityTimeout: cdk.Duration.seconds(120),
      retentionPeriod: cdk.Duration.days(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: this.processingDlq,
        maxReceiveCount: 3, // 3 attempts before DLQ
      },
    });

    // ── Generation DLQ ────────────────────────────────────────────────────

    this.generationDlq = new sqs.Queue(this, 'GenerationDlq', {
      queueName: resourceName('document-generation-dlq'),
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // ── Generation queue ──────────────────────────────────────────────────

    this.generationQueue = new sqs.Queue(this, 'GenerationQueue', {
      queueName: resourceName('document-generation'),
      // WeasyPrint PDF rendering can take 10-30s per document
      visibilityTimeout: cdk.Duration.seconds(120),
      retentionPeriod: cdk.Duration.days(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: this.generationDlq,
        maxReceiveCount: 3,
      },
    });

    // ── Outputs ───────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'ProcessingQueueUrl', {
      value: this.processingQueue.queueUrl,
      exportName: `${this.stackName}-ProcessingQueueUrl`,
    });

    new cdk.CfnOutput(this, 'GenerationQueueUrl', {
      value: this.generationQueue.queueUrl,
      exportName: `${this.stackName}-GenerationQueueUrl`,
    });
  }
}
