import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

interface ObservabilityStackProps extends cdk.StackProps {
  processorFn: lambda.IFunction;
  processingQueue: sqs.IQueue;
  generationQueue: sqs.IQueue;
  processingDlq: sqs.IQueue;
  generationDlq: sqs.IQueue;
  loadBalancer: elbv2.ApplicationLoadBalancer;
  /** If provided, subscribe this email address to the alerts SNS topic. */
  alertEmail?: string;
}

/**
 * ObservabilityStack — CloudWatch dashboard + SNS alarms for the Tarpan platform.
 *
 * Alarms:
 *   - Lambda errors >= 1 in any 5-min window
 *   - Lambda duration p99 >= 240 s (80 % of 300 s timeout)
 *   - Processing DLQ depth >= 1
 *   - Generation DLQ depth >= 1
 *   - ALB 5xx count >= 5 in any 5-min window
 *
 * Dashboard rows:
 *   - Lambda  : Invocations & Errors | Duration (p50/p99/max) | Throttles
 *   - SQS     : Queue depths | DLQ depths
 *   - ALB     : Request count | 5xx count
 *
 * P6-01, P6-02
 */
export class ObservabilityStack extends cdk.Stack {
  public readonly alertsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const {
      processorFn,
      processingQueue,
      generationQueue,
      processingDlq,
      generationDlq,
      loadBalancer,
      alertEmail,
    } = props;

    // ── SNS alerts topic ──────────────────────────────────────────────────────

    this.alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      topicName: 'tarpan-alerts',
      displayName: 'Tarpan Platform Alerts',
    });

    if (alertEmail) {
      this.alertsTopic.addSubscription(new sns_subscriptions.EmailSubscription(alertEmail));
    }

    const snsAction = new cloudwatch_actions.SnsAction(this.alertsTopic);

    // ── Metrics ───────────────────────────────────────────────────────────────

    const fiveMin = cdk.Duration.minutes(5);

    const lambdaErrors = processorFn.metricErrors({ period: fiveMin, statistic: 'Sum' });
    const lambdaDurationP99 = processorFn.metricDuration({ period: fiveMin, statistic: 'p99' });
    const lambdaDurationP50 = processorFn.metricDuration({ period: fiveMin, statistic: 'p50' });
    const lambdaDurationMax = processorFn.metricDuration({ period: fiveMin, statistic: 'Maximum' });
    const lambdaInvocations = processorFn.metricInvocations({ period: fiveMin, statistic: 'Sum' });
    const lambdaThrottles = processorFn.metricThrottles({ period: fiveMin, statistic: 'Sum' });

    const processingDepth = processingQueue.metricApproximateNumberOfMessagesVisible({
      period: fiveMin,
      statistic: 'Maximum',
    });
    const generationDepth = generationQueue.metricApproximateNumberOfMessagesVisible({
      period: fiveMin,
      statistic: 'Maximum',
    });
    const processingDlqDepth = processingDlq.metricApproximateNumberOfMessagesVisible({
      period: fiveMin,
      statistic: 'Maximum',
    });
    const generationDlqDepth = generationDlq.metricApproximateNumberOfMessagesVisible({
      period: fiveMin,
      statistic: 'Maximum',
    });

    const alb5xx = loadBalancer.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
      period: fiveMin,
      statistic: 'Sum',
    });
    const albRequestCount = loadBalancer.metrics.requestCount({
      period: fiveMin,
      statistic: 'Sum',
    });

    // ── Alarms ────────────────────────────────────────────────────────────────

    const lambdaErrorsAlarm = new cloudwatch.Alarm(this, 'LambdaErrorsAlarm', {
      alarmName: 'tarpan-lambda-errors',
      alarmDescription: 'Processor Lambda threw an unhandled error',
      metric: lambdaErrors,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaErrorsAlarm.addAlarmAction(snsAction);

    const lambdaDurationAlarm = new cloudwatch.Alarm(this, 'LambdaDurationAlarm', {
      alarmName: 'tarpan-lambda-duration-p99',
      alarmDescription: 'Processor Lambda p99 duration exceeded 240 s (80 % of 300 s timeout)',
      metric: lambdaDurationP99,
      // Duration metric is in milliseconds
      threshold: 240_000,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaDurationAlarm.addAlarmAction(snsAction);

    const processingDlqAlarm = new cloudwatch.Alarm(this, 'ProcessingDlqAlarm', {
      alarmName: 'tarpan-processing-dlq-depth',
      alarmDescription: 'Messages landed in the document-processing DLQ',
      metric: processingDlqDepth,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    processingDlqAlarm.addAlarmAction(snsAction);

    const generationDlqAlarm = new cloudwatch.Alarm(this, 'GenerationDlqAlarm', {
      alarmName: 'tarpan-generation-dlq-depth',
      alarmDescription: 'Messages landed in the document-generation DLQ',
      metric: generationDlqDepth,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    generationDlqAlarm.addAlarmAction(snsAction);

    const alb5xxAlarm = new cloudwatch.Alarm(this, 'Alb5xxAlarm', {
      alarmName: 'tarpan-alb-5xx',
      alarmDescription: 'API returned >= 5 HTTP 5xx responses in a 5-min window',
      metric: alb5xx,
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alb5xxAlarm.addAlarmAction(snsAction);

    // ── Dashboard ─────────────────────────────────────────────────────────────

    new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'TarpanObservability',
      widgets: [
        // Row 1 — Lambda
        [
          new cloudwatch.GraphWidget({
            title: 'Lambda — Invocations & Errors',
            width: 8,
            left: [lambdaInvocations],
            right: [lambdaErrors],
          }),
          new cloudwatch.GraphWidget({
            title: 'Lambda — Duration (p50 / p99 / max)',
            width: 8,
            left: [lambdaDurationP50, lambdaDurationP99, lambdaDurationMax],
          }),
          new cloudwatch.GraphWidget({
            title: 'Lambda — Throttles',
            width: 8,
            left: [lambdaThrottles],
          }),
        ],
        // Row 2 — SQS
        [
          new cloudwatch.GraphWidget({
            title: 'SQS — Queue Depths',
            width: 12,
            left: [processingDepth, generationDepth],
          }),
          new cloudwatch.GraphWidget({
            title: 'SQS — DLQ Depths',
            width: 12,
            left: [processingDlqDepth, generationDlqDepth],
          }),
        ],
        // Row 3 — ALB
        [
          new cloudwatch.GraphWidget({
            title: 'ALB — Request Count',
            width: 12,
            left: [albRequestCount],
          }),
          new cloudwatch.GraphWidget({
            title: 'ALB — 5xx Count',
            width: 12,
            left: [alb5xx],
          }),
        ],
      ],
    });

    // ── Outputs ───────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'AlertsTopicArn', {
      value: this.alertsTopic.topicArn,
      exportName: `${this.stackName}-AlertsTopicArn`,
    });
  }
}
