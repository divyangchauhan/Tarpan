import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';
import { resourceName } from '../config';

/**
 * FrontendStack — S3 bucket + CloudFront distribution for the React app.
 *
 * - React build artifacts are uploaded to S3 (private, no website hosting)
 * - CloudFront uses Origin Access Control (OAC) to serve from S3 privately
 * - SPA routing: 403/404 → /index.html with 200 response (React Router)
 * - HTTPS enforced; HTTP redirects to HTTPS
 *
 * Deployment: `cdk deploy AfterLightFrontend` — BucketDeployment automatically
 *   builds the React app (reads VITE_API_URL from SSM), uploads to S3, and
 *   invalidates the CloudFront distribution. No manual steps required.
 *
 * P4-07
 */
export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly websiteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── S3 bucket (private — CloudFront OAC only) ─────────────────────────

    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: resourceName('web'),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Website assets are reproducible
      autoDeleteObjects: true,
    });

    // ── CloudFront distribution ────────────────────────────────────────────

    // OAC — recommended over legacy OAI; works with SSE-S3
    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'Afterlight web OAC',
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'AfterLight React SPA',
      defaultBehavior: {
        origin: cloudfront_origins.S3BucketOrigin.withOriginAccessControl(
          this.websiteBucket,
          { originAccessControl: oac },
        ),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        compress: true,
      },
      defaultRootObject: 'index.html',
      // SPA routing: unknown paths → index.html (React Router handles the rest)
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US + EU only for POC
      httpVersion: cloudfront.HttpVersion.HTTP2,
    });

    // ── Bucket policy: explicitly grant CloudFront OAC access ────────────
    // S3BucketOrigin.withOriginAccessControl() does not reliably auto-add
    // this policy in all CDK versions; adding it explicitly is required.
    this.websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipal',
        actions: ['s3:GetObject'],
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        resources: [this.websiteBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
          },
        },
      }),
    );

    // ── Deploy React build to S3 + invalidate CloudFront ─────────────────
    // BucketDeployment bundles the app at deploy time via a local bundler
    // (fast, uses existing node_modules) with a Docker fallback.
    // VITE_API_URL is fetched from SSM — written there by ApiStack.

    const repoRoot = path.join(__dirname, '../../..');

    new s3deploy.BucketDeployment(this, 'WebsiteDeploy', {
      sources: [
        s3deploy.Source.asset(repoRoot, {
          bundling: {
            // Local bundler — runs on the host; no Docker required
            local: {
              tryBundle(outputDir: string): boolean {
                try {
                  // Resolve API URL: env var override → SSM → empty fallback
                  let apiUrl = process.env['VITE_API_URL'] ?? '';
                  if (!apiUrl) {
                    try {
                      apiUrl = execSync(
                        'aws ssm get-parameter --name /afterlight/api-url --query Parameter.Value --output text',
                        { encoding: 'utf-8' },
                      ).trim();
                    } catch {
                      // SSM not reachable — proceed without URL (dev/offline mode)
                    }
                  }
                  execSync('pnpm --filter web build', {
                    cwd: repoRoot,
                    stdio: 'inherit',
                    env: { ...process.env, VITE_API_URL: apiUrl, VITE_WS_URL: apiUrl },
                  });
                  fs.cpSync(path.join(repoRoot, 'apps/web/dist'), outputDir, {
                    recursive: true,
                  });
                  return true;
                } catch {
                  return false; // Fall through to Docker bundler
                }
              },
            },
            // Docker fallback — used in CI or when local bundler fails.
            // Set VITE_API_URL in your environment before deploying.
            image: cdk.DockerImage.fromRegistry('node:20-alpine'),
            environment: {
              VITE_API_URL: process.env['VITE_API_URL'] ?? '',
              VITE_WS_URL: process.env['VITE_API_URL'] ?? '',
            },
            command: [
              'sh',
              '-c',
              [
                'corepack enable',
                'corepack prepare pnpm@9.12.0 --activate',
                'pnpm install --frozen-lockfile',
                'pnpm --filter web build',
                'cp -r apps/web/dist/. /asset-output/',
              ].join(' && '),
            ],
          },
        }),
      ],
      destinationBucket: this.websiteBucket,
      // Invalidate all CloudFront paths after each deploy
      distribution: this.distribution,
      distributionPaths: ['/*'],
      prune: true,
      memoryLimit: 512,
    });

    // ── Outputs ───────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront URL for the React app',
      exportName: `${this.stackName}-DistributionUrl`,
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'Use to invalidate cache after deploying new frontend build',
      exportName: `${this.stackName}-DistributionId`,
    });

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: this.websiteBucket.bucketName,
      description: 'Upload React build output here: aws s3 sync dist/ s3://<bucket> --delete',
      exportName: `${this.stackName}-WebsiteBucket`,
    });
  }
}
