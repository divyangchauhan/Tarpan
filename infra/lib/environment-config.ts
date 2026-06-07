import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as logs from 'aws-cdk-lib/aws-logs';

export type DeploymentEnv = 'poc' | 'prod';

/**
 * All environment-specific tunables in one place.
 * Stacks read from this interface — no hardcoded values in stack files.
 */
export interface EnvironmentConfig {
  readonly deploymentEnv: DeploymentEnv;

  // ── Network ────────────────────────────────────────────────────────────────
  /** 1 for POC (cost savings). 2 for prod (one per AZ, no single point of failure). */
  readonly natGateways: number;
  /**
   * Whether the Lambda processor runs inside the VPC.
   * POC: false — Lambda uses public AWS endpoints, no NAT cost.
   * Prod: true — VPC isolation required for PII compliance (death certificate data).
   */
  readonly lambdaInVpc: boolean;

  // ── Database ───────────────────────────────────────────────────────────────
  readonly dbInstanceType: ec2.InstanceType;
  /** Multi-AZ adds ~2x RDS cost but gives automatic failover (~2 min RTO). */
  readonly dbMultiAz: boolean;
  readonly dbBackupRetentionDays: number;
  readonly dbEnablePerformanceInsights: boolean;
  /** Prevent accidental deletion. Set false for POC so `cdk destroy` works cleanly. */
  readonly dbDeletionProtection: boolean;
  /** DESTROY for POC (easy teardown). SNAPSHOT for prod (safety net on stack delete). */
  readonly dbRemovalPolicy: cdk.RemovalPolicy;

  // ── ECS Fargate ────────────────────────────────────────────────────────────
  /**
   * POC: true — tasks in public subnets with assignPublicIp, no NAT needed (~$33/mo savings).
   * Prod: false — tasks in private subnets behind NAT for network isolation.
   */
  readonly fargatePublicSubnet: boolean;
  readonly fargateDesiredCount: number;
  readonly fargateMinCapacity: number;
  readonly fargateMaxCapacity: number;
  readonly fargateCpu: number;
  readonly fargateMemoryMiB: number;
  readonly ecsContainerInsights: ecs.ContainerInsights;

  // ── CloudFront ─────────────────────────────────────────────────────────────
  readonly cloudfrontPriceClass: cloudfront.PriceClass;

  // ── S3 ─────────────────────────────────────────────────────────────────────
  /** RETAIN for prod (legal docs). DESTROY for POC so `cdk destroy` cleans up fully. */
  readonly s3RemovalPolicy: cdk.RemovalPolicy;
  /** Must be true when s3RemovalPolicy is DESTROY — empties bucket before deletion. */
  readonly s3AutoDeleteObjects: boolean;

  // ── Observability ──────────────────────────────────────────────────────────
  readonly logRetentionDays: logs.RetentionDays;

  // ── Resilience: secret rotation (P6-04) ──────────────────────────────────────
  /**
   * Enable automatic rotation for DB credentials and generated app secrets.
   * POC: false — disposable stack, rotation Lambdas add cost/complexity.
   * Prod: true.
   *
   * Caveat: the API/Lambda read secrets into env vars at startup, so a rotation
   * only takes effect after the next task/function restart, and rotating a JWT
   * secret invalidates issued tokens. See infra/RESTORE_RUNBOOK.md.
   */
  readonly secretRotationEnabled: boolean;
  /** Rotation interval (days) for both DB credentials and app secrets. */
  readonly secretRotationDays: number;

  // ── Resilience: AWS Backup (P6-05) ───────────────────────────────────────────
  /**
   * Create an AWS Backup vault + plan covering the RDS instance, on top of the
   * instance's built-in automated backups (dbBackupRetentionDays).
   * POC: false. Prod: true.
   */
  readonly backupEnabled: boolean;
  /** Retention (days) for recovery points in the AWS Backup vault. */
  readonly backupRetentionDays: number;
  /** RETAIN for prod (recovery points are a safety net). DESTROY for poc. */
  readonly backupVaultRemovalPolicy: cdk.RemovalPolicy;
}

// ── Presets ────────────────────────────────────────────────────────────────────

export const POC_CONFIG: EnvironmentConfig = {
  deploymentEnv: 'poc',

  // Cheapest viable network: no NAT, Lambda outside VPC, Fargate in public subnets
  natGateways: 0,
  lambdaInVpc: false,

  // Free-tier eligible DB; disposable on teardown
  dbInstanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
  dbMultiAz: false,
  dbBackupRetentionDays: 3,
  dbEnablePerformanceInsights: false,
  dbDeletionProtection: false,
  dbRemovalPolicy: cdk.RemovalPolicy.DESTROY,

  // Public subnets + assignPublicIp — avoids NAT Gateway cost (~$33/mo)
  fargatePublicSubnet: true,
  // Single task — no redundancy needed for demos
  fargateDesiredCount: 1,
  fargateMinCapacity: 1,
  fargateMaxCapacity: 4,
  fargateCpu: 512,
  fargateMemoryMiB: 1024,
  ecsContainerInsights: ecs.ContainerInsights.DISABLED,

  // PRICE_CLASS_100 is the cheapest PriceClass available in CDK.
  // After deploy, switch the distribution to the Free flat-rate plan ($0/month)
  // via Console or CLI — CDK does not support flat-rate plans yet.
  cloudfrontPriceClass: cloudfront.PriceClass.PRICE_CLASS_100,

  s3RemovalPolicy: cdk.RemovalPolicy.DESTROY,
  s3AutoDeleteObjects: true,

  logRetentionDays: logs.RetentionDays.ONE_MONTH,

  // Disposable stack — skip rotation Lambdas and AWS Backup
  secretRotationEnabled: false,
  secretRotationDays: 30,
  backupEnabled: false,
  backupRetentionDays: 7,
  backupVaultRemovalPolicy: cdk.RemovalPolicy.DESTROY,
};

export const PROD_CONFIG: EnvironmentConfig = {
  deploymentEnv: 'prod',

  // One NAT per AZ — outbound traffic survives an AZ failure
  natGateways: 2,
  lambdaInVpc: true,

  // Adequate for production load; Multi-AZ for HA
  dbInstanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
  dbMultiAz: true,
  dbBackupRetentionDays: 7,
  dbEnablePerformanceInsights: true,
  dbDeletionProtection: true,
  dbRemovalPolicy: cdk.RemovalPolicy.SNAPSHOT,

  // Private subnets behind NAT — network isolation for PII compliance
  fargatePublicSubnet: false,
  // Two tasks spread across AZs; scale to 10 under load
  fargateDesiredCount: 2,
  fargateMinCapacity: 2,
  fargateMaxCapacity: 10,
  fargateCpu: 1024,
  fargateMemoryMiB: 2048,
  ecsContainerInsights: ecs.ContainerInsights.ENHANCED,

  // Global edge — serve all regions with low latency
  cloudfrontPriceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,

  s3RemovalPolicy: cdk.RemovalPolicy.RETAIN,
  s3AutoDeleteObjects: false,

  logRetentionDays: logs.RetentionDays.THREE_MONTHS,

  // Rotate secrets every 30 days; long-retention recovery points via AWS Backup
  secretRotationEnabled: true,
  secretRotationDays: 30,
  backupEnabled: true,
  backupRetentionDays: 35,
  backupVaultRemovalPolicy: cdk.RemovalPolicy.RETAIN,
};

export function getConfig(env: DeploymentEnv): EnvironmentConfig {
  return env === 'prod' ? PROD_CONFIG : POC_CONFIG;
}
