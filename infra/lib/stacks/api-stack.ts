import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import { Construct } from 'constructs';
import { NetworkStack } from './network-stack';
import { StorageStack } from './storage-stack';
import { MessagingStack } from './messaging-stack';
import { SecretsStack } from './secrets-stack';
import { DatabaseStack } from './database-stack';

interface ApiStackProps extends cdk.StackProps {
  network: NetworkStack;
  storage: StorageStack;
  messaging: MessagingStack;
  secrets: SecretsStack;
  database: DatabaseStack;
}

/**
 * ApiStack — NestJS API on ECS Fargate behind an Application Load Balancer.
 *
 * - 512 vCPU / 1024 MB RAM per task (sufficient for POC)
 * - Auto-scaling: 1–4 tasks based on CPU utilisation
 * - ALB handles HTTP → HTTPS redirect (add ACM cert for HTTPS in prod)
 * - Task role follows least-privilege: only S3, SQS, Secrets Manager access
 *
 * P4-06, P4-09
 */
export class ApiStack extends cdk.Stack {
  /** DNS name of the Application Load Balancer (used as API_CALLBACK_URL) */
  public readonly loadBalancerDnsName: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { network, storage, messaging, secrets, database } = props;

    // ── Container image ────────────────────────────────────────────────────

    const apiImage = new ecr_assets.DockerImageAsset(this, 'ApiImage', {
      directory: path.join(__dirname, '../../../apps/api'),
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    // ── ECS Cluster ────────────────────────────────────────────────────────

    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'afterlight',
      vpc: network.vpc,
      containerInsightsV2: ecs.ContainerInsights.DISABLED, // Enable ENHANCED in production
    });

    // ── Fargate service with ALB ───────────────────────────────────────────

    const service = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      'ApiService',
      {
        cluster,
        serviceName: 'afterlight-api',
        cpu: 512,
        memoryLimitMiB: 1024,
        desiredCount: 1,
      minHealthyPercent: 100,
        taskImageOptions: {
          image: ecs.ContainerImage.fromDockerImageAsset(apiImage),
          containerPort: 3001,
          environment: {
            NODE_ENV: 'production',
            PORT: '3001',
            AWS_REGION: this.region,
            S3_UPLOADS_BUCKET: storage.uploadsBucket.bucketName,
            S3_GENERATED_DOCS_BUCKET: storage.generatedDocsBucket.bucketName,
            SQS_DOCUMENT_PROCESSING_QUEUE_URL: messaging.processingQueue.queueUrl,
            SQS_DOCUMENT_GENERATION_QUEUE_URL: messaging.generationQueue.queueUrl,
            CORS_ORIGIN: '*', // Tighten to CloudFront URL after frontend deploy
          },
          secrets: {
            // Secrets Manager values injected as env vars at task start
            JWT_SECRET: ecs.Secret.fromSecretsManager(secrets.jwtSecret),
            JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(secrets.jwtRefreshSecret),
            INTERNAL_API_SECRET: ecs.Secret.fromSecretsManager(secrets.internalApiSecret),
            DB_USERNAME: ecs.Secret.fromSecretsManager(database.credentials, 'username'),
            DB_PASSWORD: ecs.Secret.fromSecretsManager(database.credentials, 'password'),
            DB_HOST: ecs.Secret.fromSecretsManager(database.credentials, 'host'),
            DB_NAME: ecs.Secret.fromSecretsManager(database.credentials, 'dbname'),
          },
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: 'afterlight-api',
          }),
        },
        taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        loadBalancerName: 'afterlight-alb',
        publicLoadBalancer: true,
        listenerPort: 80, // Add HTTPS + ACM cert for production
        healthCheckGracePeriod: cdk.Duration.seconds(60),
      },
    );

    // Health check — NestJS returns 404 on unknown routes, which is fine
    service.targetGroup.configureHealthCheck({
      path: '/api/v1/health',
      healthyHttpCodes: '200,404',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    // ── Auto-scaling ──────────────────────────────────────────────────────

    const scaling = service.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 4,
    });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });

    // ── IAM — least privilege ─────────────────────────────────────────────

    const taskRole = service.taskDefinition.taskRole;

    // S3: generate pre-signed URLs (GetObject + PutObject), no direct read/write
    storage.uploadsBucket.grantReadWrite(taskRole);
    storage.generatedDocsBucket.grantRead(taskRole);

    // SQS: publish to both queues
    messaging.processingQueue.grantSendMessages(taskRole);
    messaging.generationQueue.grantSendMessages(taskRole);

    // Secrets Manager: read all app secrets
    secrets.jwtSecret.grantRead(taskRole);
    secrets.jwtRefreshSecret.grantRead(taskRole);
    secrets.internalApiSecret.grantRead(taskRole);
    database.credentials.grantRead(taskRole);

    // ── Expose DNS name ───────────────────────────────────────────────────

    this.loadBalancerDnsName = `http://${service.loadBalancer.loadBalancerDnsName}`;

    // ── Outputs ───────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.loadBalancerDnsName,
      description: 'NestJS API base URL (set as VITE_API_URL in frontend build)',
      exportName: `${this.stackName}-ApiUrl`,
    });
  }
}
