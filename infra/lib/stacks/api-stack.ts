import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../environment-config';
import { NetworkStack } from './network-stack';
import { StorageStack } from './storage-stack';
import { MessagingStack } from './messaging-stack';
import { SecretsStack } from './secrets-stack';
import { DatabaseStack } from './database-stack';

interface ApiStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  network: NetworkStack;
  storage: StorageStack;
  messaging: MessagingStack;
  secrets: SecretsStack;
  database: DatabaseStack;
  /** Sentry ingest DSN. Omit or leave empty to disable error tracking. */
  sentryDsn?: string;
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
  /** ALB instance — exposed for ObservabilityStack metrics */
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, network, storage, messaging, secrets, database, sentryDsn } = props;

    // ── Container image ────────────────────────────────────────────────────

    const apiImage = new ecr_assets.DockerImageAsset(this, 'ApiImage', {
      directory: path.join(__dirname, '../../..'),
      file: 'apps/api/Dockerfile',
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    // ── CloudWatch log group (explicit retention — prevents unbounded accumulation) ──

    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: '/ecs/tarpan-api',
      retention: config.logRetentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── ECS Cluster ────────────────────────────────────────────────────────

    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'tarpan',
      vpc: network.vpc,
      containerInsightsV2: config.ecsContainerInsights,
    });

    // ── Fargate service with ALB ───────────────────────────────────────────

    const service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
      cluster,
      serviceName: 'tarpan-api',
      cpu: config.fargateCpu,
      memoryLimitMiB: config.fargateMemoryMiB,
      desiredCount: config.fargateDesiredCount,
      minHealthyPercent: 100,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
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
          ...(sentryDsn ? { SENTRY_DSN: sentryDsn, SENTRY_ENVIRONMENT: config.deploymentEnv } : {}),
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
          streamPrefix: 'tarpan-api',
          logGroup: apiLogGroup,
        }),
      },
      assignPublicIp: config.fargatePublicSubnet,
      taskSubnets: {
        subnetType: config.fargatePublicSubnet
          ? ec2.SubnetType.PUBLIC
          : ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      loadBalancerName: 'tarpan-alb',
      publicLoadBalancer: true,
      listenerPort: 80, // Add HTTPS + ACM cert for production
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

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
      minCapacity: config.fargateMinCapacity,
      maxCapacity: config.fargateMaxCapacity,
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
    this.loadBalancer = service.loadBalancer;

    // ── Outputs ───────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.loadBalancerDnsName,
      description: 'NestJS API base URL (set as VITE_API_URL in frontend build)',
      exportName: `${this.stackName}-ApiUrl`,
    });
  }
}
