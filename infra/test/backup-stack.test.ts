import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PROD_CONFIG } from '../lib/environment-config';
import { BackupStack } from '../lib/stacks/backup-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { NetworkStack } from '../lib/stacks/network-stack';

describe('BackupStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const env = { account: '123456789012', region: 'us-east-1' };
    const network = new NetworkStack(app, 'Network', { env, config: PROD_CONFIG });
    const database = new DatabaseStack(app, 'Database', { env, config: PROD_CONFIG, network });
    const stack = new BackupStack(app, 'Backup', { env, config: PROD_CONFIG, database });
    template = Template.fromStack(stack);
  });

  it('creates a backup vault', () => {
    template.hasResourceProperties('AWS::Backup::BackupVault', {
      BackupVaultName: 'tarpan-backup-vault',
    });
  });

  it('creates a backup plan with a daily 35-day-retention rule', () => {
    template.hasResourceProperties('AWS::Backup::BackupPlan', {
      BackupPlan: {
        BackupPlanName: 'tarpan-backup-plan',
        BackupPlanRule: [
          {
            RuleName: 'DailySnapshots',
            ScheduleExpression: 'cron(0 5 * * ? *)',
            Lifecycle: { DeleteAfterDays: 35 },
          },
        ],
      },
    });
  });

  it('selects the RDS instance for backup', () => {
    template.resourceCountIs('AWS::Backup::BackupSelection', 1);
  });
});
