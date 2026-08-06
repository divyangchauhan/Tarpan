import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_TTL_SECONDS = 900; // 15 minutes

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('AWS_ENDPOINT_URL');
    this.client = new S3Client({
      region: config.getOrThrow<string>('AWS_REGION'),
      requestChecksumCalculation: 'WHEN_REQUIRED',
      ...(endpoint && {
        endpoint,
        forcePathStyle: true, // required for LocalStack — virtual-hosted style doesn't work locally
      }),
    });
  }

  async generateUploadUrl(
    bucket: string,
    key: string,
    contentType: string,
    expiresIn: number = DEFAULT_TTL_SECONDS,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    this.logger.log(`Generated upload URL for key: ${key}`);
    return url;
  }

  async generateDownloadUrl(
    bucket: string,
    key: string,
    expiresIn: number = DEFAULT_TTL_SECONDS,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    this.logger.log(`Generated download URL for key: ${key}`);
    return url;
  }

  async deletePrefix(bucket: string, prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objects = (page.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => key !== undefined);

      if (objects.length > 0) {
        const deletion = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        if (deletion.Errors && deletion.Errors.length > 0) {
          throw new Error(`Failed to delete ${deletion.Errors.length} S3 object(s)`);
        }
      }

      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    this.logger.log(`Deleted S3 objects for prefix ${prefix}`);
  }
}
