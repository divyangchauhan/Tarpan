import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
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
    this.client = new S3Client({
      region: config.getOrThrow<string>('AWS_REGION'),
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
}
