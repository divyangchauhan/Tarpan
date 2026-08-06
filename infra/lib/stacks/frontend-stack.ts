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
import { EnvironmentConfig } from '../environment-config';

interface FrontendStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  /** API hostname covered by the ALB ACM certificate, used as the CloudFront origin. */
  albDnsName: string;
}

/**
 * FrontendStack — S3 + CloudFront for the React SPA, with API proxy.
 *
 * - Default behavior: S3 (OAC) → serves static React assets
 * - /api/* behavior: ALB → proxies API calls (avoids mixed-content; no CORS needed)
 * - SPA routing: 403/404 → /index.html (React Router)
 * - HTTPS enforced everywhere; frontend uses relative /api/v1 URLs
 *
 * BucketDeployment builds the React app at deploy time and uploads to S3.
 * No VITE_API_URL needed — the frontend calls /api/v1/... relative to origin.
 *
 * P4-07
 */
export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly websiteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { config } = props;
    const albHostname = props.albDnsName.replace(/^https?:\/\//, '');

    // ── S3 bucket (private — CloudFront OAC only) ─────────────────────────

    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: resourceName('web'),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ── ALB origin (HTTPS — CloudFront-to-ALB traffic is encrypted) ───────

    const albOrigin = new cloudfront_origins.HttpOrigin(albHostname, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      httpsPort: 443,
    });

    // ── CloudFront distribution ────────────────────────────────────────────

    const oac = new cloudfront.S3OriginAccessControl(this, 'WebOAC', {
      description: 'Tarpan web OAC',
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Tarpan React SPA',
      defaultBehavior: {
        origin: cloudfront_origins.S3BucketOrigin.withOriginAccessControl(this.websiteBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        compress: true,
      },
      additionalBehaviors: {
        // All API traffic goes through CloudFront → ALB over HTTPS internally.
        '/api/*': {
          origin: albOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        // socket.io long-polling and WebSocket upgrade traffic
        '/socket.io/*': {
          origin: albOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
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
      // NOTE (POC): CloudFront flat-rate Free plan ($0/month, 1M req + limited transfer)
      // is cheaper than any PriceClass but is not yet supported in CDK.
      // After deploying, enable it manually:
      //   AWS Console → CloudFront → distribution → General → Edit → Pricing → Free plan
      // or via CLI: aws cloudfront update-distribution --id <ID> --pricing-plan Free
      priceClass: config.cloudfrontPriceClass,
      httpVersion: cloudfront.HttpVersion.HTTP2,
    });

    // ── Bucket policy: explicitly grant CloudFront OAC access ────────────

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
    // No VITE_API_URL needed — the app uses relative /api/v1 URLs which
    // CloudFront proxies to the ALB via the /api/* behavior above.

    const repoRoot = path.join(__dirname, '../../..');

    new s3deploy.BucketDeployment(this, 'WebsiteDeploy', {
      sources: [
        s3deploy.Source.asset(repoRoot, {
          bundling: {
            local: {
              tryBundle(outputDir: string): boolean {
                try {
                  // Explicitly empty VITE_API_URL / VITE_WS_URL so .env.local
                  // (which has localhost values for dev) doesn't pollute the build.
                  // The app uses relative /api and /socket.io URLs via CloudFront proxy.
                  execSync('pnpm --filter web build', {
                    cwd: repoRoot,
                    stdio: 'inherit',
                    env: { ...process.env, VITE_API_URL: '', VITE_WS_URL: '' },
                  });
                  fs.cpSync(path.join(repoRoot, 'apps/web/dist'), outputDir, {
                    recursive: true,
                  });
                  return true;
                } catch {
                  return false;
                }
              },
            },
            image: cdk.DockerImage.fromRegistry('node:20-alpine'),
            // Empty VITE_* vars so Docker build also ignores any .env.local
            environment: { VITE_API_URL: '', VITE_WS_URL: '' },
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
      exportName: `${this.stackName}-DistributionId`,
    });

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: this.websiteBucket.bucketName,
      exportName: `${this.stackName}-WebsiteBucket`,
    });
  }
}
