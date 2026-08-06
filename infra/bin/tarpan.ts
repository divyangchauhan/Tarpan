#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DeploymentEnv, getConfig } from '../lib/environment-config';
import { NetworkStack } from '../lib/stacks/network-stack';
import { StorageStack } from '../lib/stacks/storage-stack';
import { MessagingStack } from '../lib/stacks/messaging-stack';
import { SecretsStack } from '../lib/stacks/secrets-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { LambdaStack } from '../lib/stacks/lambda-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';
import { ObservabilityStack } from '../lib/stacks/observability-stack';
import { BackupStack } from '../lib/stacks/backup-stack';

const app = new cdk.App();

/**
 * Deployment environment — controls sizing, redundancy, and cost profile.
 *
 *   cdk deploy --all --context env=poc    # cheapest; disposable; no HA
 *   cdk deploy --all --context env=prod   # HA; Multi-AZ; deletion protection
 *
 * Defaults to 'poc' if not specified.
 */
const deploymentEnvValue = app.node.tryGetContext('env') as string | undefined;
if (
  deploymentEnvValue !== undefined &&
  deploymentEnvValue !== 'poc' &&
  deploymentEnvValue !== 'prod'
) {
  throw new Error(`Invalid --context env="${deploymentEnvValue}". Must be "poc" or "prod".`);
}
const deploymentEnv: DeploymentEnv = deploymentEnvValue === 'prod' ? 'prod' : 'poc';
const config = getConfig(deploymentEnv);

const apiDomainName = app.node.tryGetContext('apiDomainName') as string | undefined;
const apiOriginDomainName = app.node.tryGetContext('apiOriginDomainName') as string | undefined;
const apiCertificateArn = app.node.tryGetContext('apiCertificateArn') as string | undefined;
const cloudFrontOriginFacingPrefixListId = app.node.tryGetContext(
  'cloudFrontOriginFacingPrefixListId',
) as string | undefined;
if (
  !apiDomainName ||
  !apiOriginDomainName ||
  !apiCertificateArn ||
  !cloudFrontOriginFacingPrefixListId
) {
  throw new Error(
    'apiDomainName, apiOriginDomainName, apiCertificateArn, and ' +
      'cloudFrontOriginFacingPrefixListId are required. apiOriginDomainName must resolve to the ALB ' +
      'and be covered by the ACM certificate. The ALB is HTTPS-only and restricted to CloudFront origin traffic.',
  );
}

/**
 * Optional Sentry DSN — pass via context to enable error tracking in both the
 * NestJS API (ECS) and the Lambda processor. Omit or leave empty to disable.
 *
 *   cdk deploy --all --context env=prod --context sentryDsn=https://public@o0.ingest.sentry.io/0
 */
const sentryDsn = app.node.tryGetContext('sentryDsn') as string | undefined;

/**
 * Target AWS account/region — override via CDK_DEFAULT_ACCOUNT/REGION or
 * explicit --context flags at deploy time.
 *
 *   cdk deploy --all --context env=prod --context account=123456789012 --context region=us-east-1
 */
const env: cdk.Environment = {
  account:
    (app.node.tryGetContext('account') as string | undefined) ?? process.env['CDK_DEFAULT_ACCOUNT'],
  region:
    (app.node.tryGetContext('region') as string | undefined) ??
    process.env['CDK_DEFAULT_REGION'] ??
    'us-east-1',
};

const stackProps: cdk.StackProps = { env };

// ── Foundation (no inter-stack dependencies) ──────────────────────────────

const network = new NetworkStack(app, 'TarpanNetwork', { ...stackProps, config });

const storage = new StorageStack(app, 'TarpanStorage', { ...stackProps, config });

const messaging = new MessagingStack(app, 'TarpanMessaging', stackProps);

const secrets = new SecretsStack(app, 'TarpanSecrets', { ...stackProps, config });

// ── Data layer ────────────────────────────────────────────────────────────

const database = new DatabaseStack(app, 'TarpanDatabase', {
  ...stackProps,
  config,
  network,
});

// AWS Backup vault + plan for the RDS instance (prod only — POC is disposable)
if (config.backupEnabled) {
  new BackupStack(app, 'TarpanBackup', { ...stackProps, config, database });
}

// ── Compute ───────────────────────────────────────────────────────────────

// API must be deployed before Lambda so we know the API callback URL
const api = new ApiStack(app, 'TarpanApi', {
  ...stackProps,
  config,
  network,
  storage,
  messaging,
  secrets,
  database,
  sentryDsn,
  apiDomainName,
  apiOriginDomainName,
  apiCertificateArn,
  cloudFrontOriginFacingPrefixListId,
});

const lambdaStack = new LambdaStack(app, 'TarpanLambda', {
  ...stackProps,
  config,
  network,
  storage,
  messaging,
  secrets,
  // Use the ALB URL as the API callback target
  apiCallbackUrl: api.loadBalancerDnsName,
  sentryDsn,
});

// ── Frontend ──────────────────────────────────────────────────────────────

new FrontendStack(app, 'TarpanFrontend', {
  ...stackProps,
  config,
  apiOriginDomainName,
});

// ── Observability ─────────────────────────────────────────────────────────
//
// Optional alert email:
//   cdk deploy --all --context env=prod --context alertEmail=ops@example.com

new ObservabilityStack(app, 'TarpanObservability', {
  ...stackProps,
  processorFn: lambdaStack.processorFn,
  processingQueue: messaging.processingQueue,
  generationQueue: messaging.generationQueue,
  processingDlq: messaging.processingDlq,
  generationDlq: messaging.generationDlq,
  loadBalancer: api.loadBalancer,
  alertEmail: app.node.tryGetContext('alertEmail') as string | undefined,
});

app.synth();
