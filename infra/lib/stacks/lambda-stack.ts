import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_event_sources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { NetworkStack } from './network-stack';
import { StorageStack } from './storage-stack';
import { MessagingStack } from './messaging-stack';
import { SecretsStack } from './secrets-stack';

interface LambdaStackProps extends cdk.StackProps {
  network: NetworkStack;
  storage: StorageStack;
  messaging: MessagingStack;
  secrets: SecretsStack;
  /** ALB DNS or CloudFront domain for the API callback URL */
  apiCallbackUrl: string;
}

/**
 * LambdaStack — Python 3.11 processor Lambda with dual SQS triggers.
 *
 * Handles both event types based on message shape:
 *   - generatedDocumentId present → PDF generation (Jinja2 + WeasyPrint)
 *   - otherwise → death certificate parsing (Claude API + PDFPlumber)
 *
 * Bundling packages the Poetry dependencies using Docker so the Lambda
 * ZIP contains all native libraries (WeasyPrint, Pillow, etc.).
 *
 * P4-04, P4-09
 */
export class LambdaStack extends cdk.Stack {
  public readonly processorFn: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { network, storage, messaging, secrets, apiCallbackUrl } = props;

    // ── Lambda function ────────────────────────────────────────────────────

    this.processorFn = new lambda.Function(this, 'ProcessorFn', {
      functionName: 'afterlight-processor',
      description: 'Parses death certificates and generates legal document PDFs',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'src.handler.handler',
      // Bundle the Poetry project: export requirements, pip-install, copy source
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../apps/processor'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          command: [
            'bash',
            '-c',
            [
              // requirements.txt is pre-generated via: poetry export -f requirements.txt --without-hashes --without dev -o requirements.txt
              'pip install -r requirements.txt -t /asset-output --quiet',
              'cp -r src /asset-output/',
            ].join(' && '),
          ],
        },
      }),
      memorySize: 1024, // WeasyPrint + Pillow need headroom
      timeout: cdk.Duration.seconds(300), // 5 min — generous for Claude API + PDF render
      // reservedConcurrentExecutions omitted — SQS maxConcurrency:5 limits blast radius
      // and avoids requiring extra account-level unreserved concurrency headroom
      vpc: network.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [network.lambdaSg], // lambdaSg is in NetworkStack — no cycle (Lambda doesn't own SGs from ApiStack)
      environment: {
        AWS_ENDPOINT_URL: '', // Empty = use real AWS (not LocalStack)
        S3_UPLOADS_BUCKET: storage.uploadsBucket.bucketName,
        S3_GENERATED_DOCS_BUCKET: storage.generatedDocsBucket.bucketName,
        SQS_DOCUMENT_PROCESSING_QUEUE_URL: messaging.processingQueue.queueUrl,
        SQS_DOCUMENT_GENERATION_QUEUE_URL: messaging.generationQueue.queueUrl,
        API_CALLBACK_URL: apiCallbackUrl,
      },
    });

    // ── Secrets ────────────────────────────────────────────────────────────

    // Inject secrets as environment variables via Secrets Manager
    const { anthropicApiKey, internalApiSecret } = secrets;

    // Grant read access and inject at runtime
    anthropicApiKey.grantRead(this.processorFn);
    internalApiSecret.grantRead(this.processorFn);

    // Use addEnvironment with SecretValue reference so values are fetched at deploy time
    // For Lambda, we use the Secrets Manager extension or fetch in code.
    // Here we pass the secret ARNs and fetch in a Lambda layer or startup code.
    // Simpler for POC: grant read and let the Python code use boto3 to fetch.
    this.processorFn.addEnvironment(
      'ANTHROPIC_API_KEY_SECRET_ARN',
      anthropicApiKey.secretArn,
    );
    this.processorFn.addEnvironment(
      'INTERNAL_API_SECRET_ARN',
      internalApiSecret.secretArn,
    );

    // ── IAM — least privilege ─────────────────────────────────────────────

    // S3: read raw uploads, write generated docs
    storage.uploadsBucket.grantRead(this.processorFn);
    storage.generatedDocsBucket.grantWrite(this.processorFn);

    // SQS: consume from both queues (Lambda event source does this but explicit is clearer)
    messaging.processingQueue.grantConsumeMessages(this.processorFn);
    messaging.generationQueue.grantConsumeMessages(this.processorFn);

    // ── SQS Event Source Mappings ─────────────────────────────────────────

    this.processorFn.addEventSource(
      new lambda_event_sources.SqsEventSource(messaging.processingQueue, {
        batchSize: 1, // Process one document at a time (Claude calls are expensive)
        maxConcurrency: 5,
        reportBatchItemFailures: true,
      }),
    );

    this.processorFn.addEventSource(
      new lambda_event_sources.SqsEventSource(messaging.generationQueue, {
        batchSize: 5, // PDF generation is parallelisable; batch up to 5
        maxConcurrency: 5,
        reportBatchItemFailures: true,
      }),
    );

    // ── CloudWatch Logs ────────────────────────────────────────────────────

    this.processorFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    // ── Outputs ───────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'ProcessorFunctionArn', {
      value: this.processorFn.functionArn,
      exportName: `${this.stackName}-ProcessorFunctionArn`,
    });
  }
}
