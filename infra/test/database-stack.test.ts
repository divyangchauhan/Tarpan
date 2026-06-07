import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { POC_CONFIG, PROD_CONFIG, EnvironmentConfig } from '../lib/environment-config';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { NetworkStack } from '../lib/stacks/network-stack';

function databaseTemplate(config: EnvironmentConfig): Template {
  const app = new cdk.App();
  const env = { account: '123456789012', region: 'us-east-1' };
  const network = new NetworkStack(app, 'Network', { env, config });
  const database = new DatabaseStack(app, 'Database', { env, config, network });
  // Synthing without a DependencyCycle error is itself the assertion that the
  // rotation construct does not introduce a Network <-> Database cycle.
  return Template.fromStack(database);
}

describe('DatabaseStack', () => {
  it('creates a single Postgres instance', () => {
    databaseTemplate(POC_CONFIG).resourceCountIs('AWS::RDS::DBInstance', 1);
  });

  it('does not configure credential rotation in poc', () => {
    databaseTemplate(POC_CONFIG).resourceCountIs('AWS::SecretsManager::RotationSchedule', 0);
  });

  describe('rotation enabled (prod)', () => {
    let template: Template;
    beforeAll(() => {
      template = databaseTemplate(PROD_CONFIG);
    });

    it('configures single-user credential rotation every 30 days', () => {
      template.resourceCountIs('AWS::SecretsManager::RotationSchedule', 1);
      template.hasResourceProperties('AWS::SecretsManager::RotationSchedule', {
        RotationRules: { ScheduleExpression: 'rate(30 days)' },
      });
    });

    it('opens the DB security group via an ingress rule in this stack', () => {
      // Standalone ingress resource (not inline on rdsSg) confirms the rule
      // lives in DatabaseStack, which is what avoids the cross-stack cycle.
      template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
        FromPort: 5432,
        ToPort: 5432,
      });
    });
  });
});
