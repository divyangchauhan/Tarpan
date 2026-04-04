#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/stacks/network-stack';
import { StorageStack } from '../lib/stacks/storage-stack';
import { MessagingStack } from '../lib/stacks/messaging-stack';
import { SecretsStack } from '../lib/stacks/secrets-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { LambdaStack } from '../lib/stacks/lambda-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';

const app = new cdk.App();

/**
 * Target environment — override via CDK_DEFAULT_ACCOUNT/REGION or
 * explicit --context flags at deploy time.
 *
 * Example:
 *   cdk deploy --all \
 *     --context account=123456789012 \
 *     --context region=us-east-1
 */
const env: cdk.Environment = {
  account: app.node.tryGetContext('account') ?? process.env['CDK_DEFAULT_ACCOUNT'],
  region: app.node.tryGetContext('region') ?? process.env['CDK_DEFAULT_REGION'] ?? 'us-east-1',
};

const stackProps: cdk.StackProps = { env };

// ── Foundation (no inter-stack dependencies) ──────────────────────────────

const network = new NetworkStack(app, 'AfterLightNetwork', stackProps);

const storage = new StorageStack(app, 'AfterLightStorage', stackProps);

const messaging = new MessagingStack(app, 'AfterLightMessaging', stackProps);

const secrets = new SecretsStack(app, 'AfterLightSecrets', stackProps);

// ── Data layer ────────────────────────────────────────────────────────────

const database = new DatabaseStack(app, 'AfterLightDatabase', {
  ...stackProps,
  network,
});

// ── Compute ───────────────────────────────────────────────────────────────

// API must be deployed before Lambda so we know the API callback URL
const api = new ApiStack(app, 'AfterLightApi', {
  ...stackProps,
  network,
  storage,
  messaging,
  secrets,
  database,
});

new LambdaStack(app, 'AfterLightLambda', {
  ...stackProps,
  network,
  storage,
  messaging,
  secrets,
  // Use the ALB URL as the API callback target
  apiCallbackUrl: api.loadBalancerDnsName,
});

// ── Frontend ──────────────────────────────────────────────────────────────

new FrontendStack(app, 'AfterLightFrontend', {
  ...stackProps,
  albDnsName: api.loadBalancerDnsName,
});

app.synth();
