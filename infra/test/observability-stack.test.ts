import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { ObservabilityStack } from '../lib/stacks/observability-stack';

function buildStack(alertEmail?: string): Template {
  const app = new cdk.App();

  // Fixtures in a helper stack (cross-stack refs not needed for assertions)
  const fixtureStack = new cdk.Stack(app, 'Fixtures');
  const vpc = new ec2.Vpc(fixtureStack, 'Vpc', { maxAzs: 1 });
  const fn = new lambda.Function(fixtureStack, 'Fn', {
    runtime: lambda.Runtime.PYTHON_3_11,
    handler: 'index.handler',
    code: lambda.Code.fromInline('def handler(e, c): pass'),
  });
  const processingQueue = new sqs.Queue(fixtureStack, 'ProcQ');
  const generationQueue = new sqs.Queue(fixtureStack, 'GenQ');
  const processingDlq = new sqs.Queue(fixtureStack, 'ProcDlq');
  const generationDlq = new sqs.Queue(fixtureStack, 'GenDlq');
  const loadBalancer = new elbv2.ApplicationLoadBalancer(fixtureStack, 'Alb', {
    vpc,
    internetFacing: true,
  });

  const stack = new ObservabilityStack(app, 'ObservabilityStack', {
    processorFn: fn,
    processingQueue,
    generationQueue,
    processingDlq,
    generationDlq,
    loadBalancer,
    alertEmail,
  });

  return Template.fromStack(stack);
}

describe('ObservabilityStack', () => {
  let template: Template;

  beforeAll(() => {
    template = buildStack();
  });

  it('creates an SNS alerts topic', () => {
    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: 'tarpan-alerts',
      DisplayName: 'Tarpan Platform Alerts',
    });
  });

  it('does not create an email subscription when alertEmail is omitted', () => {
    template.resourceCountIs('AWS::SNS::Subscription', 0);
  });

  it('creates an email subscription when alertEmail is provided', () => {
    const withEmail = buildStack('ops@example.com');
    withEmail.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'ops@example.com',
    });
  });

  it('creates exactly 5 CloudWatch alarms', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 5);
  });

  it('creates the Lambda errors alarm', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'tarpan-lambda-errors',
      Threshold: 1,
      EvaluationPeriods: 1,
    });
  });

  it('creates the Lambda duration p99 alarm', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'tarpan-lambda-duration-p99',
      Threshold: 240_000,
      EvaluationPeriods: 2,
      DatapointsToAlarm: 2,
    });
  });

  it('creates the processing DLQ depth alarm', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'tarpan-processing-dlq-depth',
      Threshold: 1,
    });
  });

  it('creates the generation DLQ depth alarm', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'tarpan-generation-dlq-depth',
      Threshold: 1,
    });
  });

  it('creates the ALB 5xx alarm', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'tarpan-alb-5xx',
      Threshold: 5,
    });
  });

  it('creates a CloudWatch dashboard', () => {
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'TarpanObservability',
    });
  });

  it('outputs the SNS topic ARN', () => {
    template.hasOutput('AlertsTopicArn', {});
  });
});
