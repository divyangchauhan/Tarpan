import { Type } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DocumentStatus, ExtractedCertificateData } from '@afterlight/shared';

// Allowed statuses for processing callback
const ALLOWED_STATUSES = [DocumentStatus.PROCESSED, DocumentStatus.FAILED] as const;
type ProcessingStatus = (typeof ALLOWED_STATUSES)[number];

export class ExtractedDataDto implements Partial<ExtractedCertificateData> {
  // Allow any shape from Lambda — validated loosely at this boundary
  [key: string]: unknown;
}

export class ProcessingResultDto {
  @IsUUID()
  documentId!: string;

  @IsEnum(ALLOWED_STATUSES)
  status!: ProcessingStatus;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExtractedDataDto)
  extractedData?: ExtractedCertificateData;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
