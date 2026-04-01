import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * SecretsStack — Secrets Manager entries for all application secrets.
 *
 * Secrets are created as placeholders. Actual values must be set after
 * the first deployment via AWS Console or CLI:
 *
 *   aws secretsmanager put-secret-value \
 *     --secret-id afterlight/anthropic-api-key \
 *     --secret-string '{"value":"sk-ant-..."}'
 *
 * P4-08
 */
export class SecretsStack extends cdk.Stack {
  public readonly jwtSecret: secretsmanager.Secret;
  public readonly jwtRefreshSecret: secretsmanager.Secret;
  public readonly anthropicApiKey: secretsmanager.Secret;
  public readonly internalApiSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: 'afterlight/jwt-secret',
      description: 'JWT signing secret for access tokens',
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    this.jwtRefreshSecret = new secretsmanager.Secret(this, 'JwtRefreshSecret', {
      secretName: 'afterlight/jwt-refresh-secret',
      description: 'JWT signing secret for refresh tokens',
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    // Anthropic API key — must be updated manually post-deploy
    this.anthropicApiKey = new secretsmanager.Secret(this, 'AnthropicApiKey', {
      secretName: 'afterlight/anthropic-api-key',
      description: 'Anthropic API key for Claude document processing',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
    });

    this.internalApiSecret = new secretsmanager.Secret(this, 'InternalApiSecret', {
      secretName: 'afterlight/internal-api-secret',
      description: 'Shared secret for Lambda → API callback authentication',
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    // ── Outputs ───────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'AnthropicApiKeyArn', {
      value: this.anthropicApiKey.secretArn,
      description: 'Update this secret with your Anthropic API key after deploy',
    });
  }
}
