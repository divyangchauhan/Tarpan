import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Service } from './s3.service';

const mockS3Send = jest.fn();

// Mock the AWS SDK modules so tests don't need real credentials
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  ListObjectsV2Command: jest.fn().mockImplementation((input: unknown) => ({ input })),
  DeleteObjectsCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

const mockConfigService = {
  get: jest.fn(),
  getOrThrow: jest.fn(),
};

describe('S3Service', () => {
  let service: S3Service;

  beforeEach(async () => {
    mockConfigService.get.mockReturnValue(undefined); // no endpoint by default
    mockConfigService.getOrThrow.mockReturnValue('us-east-1');

    const module: TestingModule = await Test.createTestingModule({
      providers: [S3Service, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<S3Service>(S3Service);
    jest.clearAllMocks();
  });

  describe('generateUploadUrl', () => {
    it('should return a pre-signed upload URL', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/upload?signed');

      const url = await service.generateUploadUrl(
        'my-bucket',
        'cases/123/doc.pdf',
        'application/pdf',
        900,
      );

      expect(url).toBe('https://s3.example.com/upload?signed');
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'cases/123/doc.pdf',
        ContentType: 'application/pdf',
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        expiresIn: 900,
      });
    });

    it('should use the default TTL when expiresIn is not specified', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/upload?signed');

      await service.generateUploadUrl('bucket', 'key.pdf', 'application/pdf');

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 900 }, // DEFAULT_TTL_SECONDS
      );
    });
  });

  describe('generateDownloadUrl', () => {
    it('should return a pre-signed download URL', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/download?signed');

      const url = await service.generateDownloadUrl(
        'generated-docs-bucket',
        'generated/case-id/ssa-721/doc.pdf',
        900,
      );

      expect(url).toBe('https://s3.example.com/download?signed');
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'generated-docs-bucket',
        Key: 'generated/case-id/ssa-721/doc.pdf',
      });
    });

    it('should use the default TTL when expiresIn is not specified', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/download?signed');

      await service.generateDownloadUrl('bucket', 'key.pdf');

      expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        expiresIn: 900,
      });
    });
  });

  describe('deletePrefix', () => {
    it('deletes all objects across paginated S3 listings', async () => {
      mockS3Send
        .mockResolvedValueOnce({
          Contents: [{ Key: 'cases/case-id/one.pdf' }],
          IsTruncated: true,
          NextContinuationToken: 'next-page',
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          Contents: [{ Key: 'cases/case-id/two.pdf' }],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({});

      await service.deletePrefix('uploads', 'cases/case-id/');

      expect(mockS3Send).toHaveBeenCalledTimes(4);
      expect(ListObjectsV2Command).toHaveBeenNthCalledWith(1, {
        Bucket: 'uploads',
        Prefix: 'cases/case-id/',
        ContinuationToken: undefined,
      });
      expect(ListObjectsV2Command).toHaveBeenNthCalledWith(2, {
        Bucket: 'uploads',
        Prefix: 'cases/case-id/',
        ContinuationToken: 'next-page',
      });
      expect(DeleteObjectsCommand).toHaveBeenCalledWith({
        Bucket: 'uploads',
        Delete: {
          Objects: [{ Key: 'cases/case-id/one.pdf' }],
          Quiet: true,
        },
      });
    });
  });
});
