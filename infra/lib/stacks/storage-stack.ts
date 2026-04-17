import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { resourceName } from '../config';
import { EnvironmentConfig } from '../environment-config';

interface StorageStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

/**
 * StorageStack — S3 buckets for raw uploads and generated PDFs.
 *
 * Both buckets are private (no public access). Documents are accessed
 * exclusively via pre-signed URLs with a 15-minute TTL.
 *
 * P4-02
 */
export class StorageStack extends cdk.Stack {
  public readonly uploadsBucket: s3.Bucket;
  public readonly generatedDocsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { config } = props;

    // ── Uploads bucket (death certificates) ───────────────────────────────

    this.uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      bucketName: resourceName('uploads'),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      enforceSSL: true,
      // Auto-delete raw uploads after 1 year (legal minimum retention)
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(365),
          id: 'expire-raw-uploads',
        },
      ],
      cors: [
        {
          // Allow browser-to-S3 direct upload via pre-signed PUT URL
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['*'], // Tighten to CloudFront domain in prod
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: config.s3RemovalPolicy,
      autoDeleteObjects: config.s3AutoDeleteObjects,
    });

    // ── Generated documents bucket (PDFs) ─────────────────────────────────

    this.generatedDocsBucket = new s3.Bucket(this, 'GeneratedDocsBucket', {
      bucketName: resourceName('generated-docs'),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      enforceSSL: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(730), // 2-year retention for generated letters
          id: 'expire-generated-docs',
        },
      ],
      removalPolicy: config.s3RemovalPolicy,
      autoDeleteObjects: config.s3AutoDeleteObjects,
    });

    // ── Outputs ───────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'UploadsBucketName', {
      value: this.uploadsBucket.bucketName,
      exportName: `${this.stackName}-UploadsBucket`,
    });

    new cdk.CfnOutput(this, 'GeneratedDocsBucketName', {
      value: this.generatedDocsBucket.bucketName,
      exportName: `${this.stackName}-GeneratedDocsBucket`,
    });
  }
}
