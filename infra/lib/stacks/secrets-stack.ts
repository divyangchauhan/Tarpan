import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../environment-config';

interface SecretsStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

/**
 * SecretsStack — Secrets Manager entries for all application secrets.
 *
 * Secrets are created as placeholders. Actual values must be set after
 * the first deployment via AWS Console or CLI:
 *
 *   aws secretsmanager put-secret-value \
 *     --secret-id tarpan/anthropic-api-key \
 *     --secret-string '{"value":"sk-ant-..."}'
 *
 * When config.secretRotationEnabled is true, the three generated secrets
 * (JWT, JWT refresh, internal API) rotate on a fixed schedule via a custom
 * regeneration Lambda. The Anthropic key is excluded — its value is owned by
 * Anthropic and cannot be auto-rotated. DB credential rotation lives in
 * DatabaseStack. See infra/RESTORE_RUNBOOK.md for the operational caveat.
 *
 * P4-08, P6-04
 */
export class SecretsStack extends cdk.Stack {
  public readonly jwtSecret: secretsmanager.Secret;
  public readonly jwtRefreshSecret: secretsmanager.Secret;
  public readonly anthropicApiKey: secretsmanager.Secret;
  public readonly internalApiSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: 'tarpan/jwt-secret',
      description: 'JWT signing secret for access tokens',
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    this.jwtRefreshSecret = new secretsmanager.Secret(this, 'JwtRefreshSecret', {
      secretName: 'tarpan/jwt-refresh-secret',
      description: 'JWT signing secret for refresh tokens',
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    // Anthropic API key — must be updated manually post-deploy
    this.anthropicApiKey = new secretsmanager.Secret(this, 'AnthropicApiKey', {
      secretName: 'tarpan/anthropic-api-key',
      description: 'Anthropic API key for Claude document processing',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
    });

    this.internalApiSecret = new secretsmanager.Secret(this, 'InternalApiSecret', {
      secretName: 'tarpan/internal-api-secret',
      description: 'Shared secret for Lambda to API callback authentication',
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    // ── Rotation (P6-04) ────────────────────────────────────────────────────
    //
    // The Anthropic key is intentionally not rotated — its value is issued by
    // Anthropic, so there is nothing for a rotation Lambda to regenerate.

    if (config.secretRotationEnabled) {
      const rotationFn = new lambda.Function(this, 'AppSecretRotationFn', {
        runtime: lambda.Runtime.PYTHON_3_11,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'secret-rotation')),
        timeout: cdk.Duration.seconds(30),
        description: 'Regenerates opaque app secrets (JWT, internal API) on rotation',
      });

      const rotatedSecrets = [this.jwtSecret, this.jwtRefreshSecret, this.internalApiSecret];
      for (const secret of rotatedSecrets) {
        // grantRead covers GetSecretValue + DescribeSecret; PutSecretValue and
        // UpdateSecretVersionStage are required by the rotation protocol but not
        // included in any built-in grant, so add them explicitly.
        secret.grantRead(rotationFn);
        rotationFn.addToRolePolicy(
          new cdk.aws_iam.PolicyStatement({
            actions: [
              'secretsmanager:PutSecretValue',
              'secretsmanager:UpdateSecretVersionStage',
            ],
            resources: [secret.secretArn],
          }),
        );
        secret.addRotationSchedule('RotationSchedule', {
          rotationLambda: rotationFn,
          automaticallyAfter: cdk.Duration.days(config.secretRotationDays),
        });
      }
    }

    // ── Outputs ───────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'AnthropicApiKeyArn', {
      value: this.anthropicApiKey.secretArn,
      description: 'Update this secret with your Anthropic API key after deploy',
    });
  }
}
