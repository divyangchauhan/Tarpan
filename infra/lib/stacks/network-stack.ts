import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { resourceName } from '../config';

/**
 * NetworkStack — VPC with public + private subnets across 2 AZs.
 *
 * Security groups for cross-stack resources use VPC CIDR peers to avoid
 * CDK circular dependency errors (SG-to-SG rules across stacks require
 * bidirectional CloudFormation exports which CDK rejects).
 *
 * - Public subnets: ALB, NAT Gateway
 * - Private subnets: RDS, ECS tasks, Lambda
 * - Single NAT Gateway for POC cost savings; use per-AZ in production
 */
export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  /** Lambda processor — outbound to internet (Claude API, S3) via NAT */
  public readonly lambdaSg: ec2.SecurityGroup;

  /** RDS PostgreSQL — inbound from VPC CIDR only */
  public readonly rdsSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: resourceName('vpc'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // ── Lambda security group ──────────────────────────────────────────────

    this.lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc: this.vpc,
      securityGroupName: resourceName('lambda-sg'),
      description: 'Lambda processor — outbound to internet via NAT',
      allowAllOutbound: true,
    });

    // ── RDS security group ─────────────────────────────────────────────────
    // Use VPC CIDR peer instead of SG peer to avoid cross-stack CDK cycles.
    // All resources in this VPC are trusted — ECS, Lambda, and bastion hosts.

    this.rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc: this.vpc,
      securityGroupName: resourceName('rds-sg'),
      description: 'RDS PostgreSQL — inbound from VPC CIDR only',
      allowAllOutbound: false,
    });
    this.rdsSg.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'PostgreSQL from VPC',
    );

    // ── Outputs ───────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      exportName: `${this.stackName}-VpcId`,
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      value: this.vpc.vpcCidrBlock,
      exportName: `${this.stackName}-VpcCidr`,
    });
  }
}
