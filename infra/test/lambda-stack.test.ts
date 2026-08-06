import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Template } from 'aws-cdk-lib/assertions';
import { addGenerationDlqEventSource } from '../lib/stacks/lambda-stack';

describe('generation DLQ remediation wiring', () => {
  it('connects the generation DLQ to the processor with partial-batch retries', () => {
    const stack = new cdk.Stack();
    const processor = new lambda.Function(stack, 'Processor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({})'),
    });
    const generationDlq = new sqs.Queue(stack, 'GenerationDlq');

    addGenerationDlqEventSource(processor, generationDlq);

    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 1,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
  });
});
