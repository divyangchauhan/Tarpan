import * as cdk from 'aws-cdk-lib';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { resourceName } from '../config';
import { EnvironmentConfig } from '../environment-config';
import { DatabaseStack } from './database-stack';

interface BackupStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  database: DatabaseStack;
}

/**
 * BackupStack — AWS Backup vault + plan covering the RDS instance.
 *
 * Layers long-retention recovery points on top of the instance's built-in
 * automated backups (DatabaseStack.dbBackupRetentionDays, max 35 days). A daily
 * scheduled snapshot is retained for config.backupRetentionDays, giving a
 * point-in-time safety net independent of the RDS instance lifecycle.
 *
 * Only instantiated when config.backupEnabled is true (prod). See
 * infra/RESTORE_RUNBOOK.md for the restore procedure.
 *
 * P6-05
 */
export class BackupStack extends cdk.Stack {
  public readonly vault: backup.BackupVault;
  public readonly plan: backup.BackupPlan;

  constructor(scope: Construct, id: string, props: BackupStackProps) {
    super(scope, id, props);

    const { config, database } = props;

    this.vault = new backup.BackupVault(this, 'Vault', {
      backupVaultName: resourceName('backup-vault'),
      removalPolicy: config.backupVaultRemovalPolicy,
    });

    this.plan = new backup.BackupPlan(this, 'Plan', {
      backupPlanName: resourceName('backup-plan'),
      backupVault: this.vault,
    });

    this.plan.addRule(
      new backup.BackupPlanRule({
        ruleName: 'DailySnapshots',
        // 05:00 UTC daily — outside typical traffic, after the RDS backup window
        scheduleExpression: events.Schedule.cron({ hour: '5', minute: '0' }),
        deleteAfter: cdk.Duration.days(config.backupRetentionDays),
      }),
    );

    this.plan.addSelection('RdsSelection', {
      backupSelectionName: resourceName('rds-selection'),
      resources: [backup.BackupResource.fromRdsDatabaseInstance(database.instance)],
    });

    new cdk.CfnOutput(this, 'BackupVaultName', {
      value: this.vault.backupVaultName,
      exportName: `${this.stackName}-BackupVaultName`,
    });
  }
}
