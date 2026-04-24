import { IsEnum, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { DocumentStatus, ExtractedCertificateData } from '@afterlight/shared';

// Allowed statuses for processing callback
const ALLOWED_STATUSES = [DocumentStatus.PROCESSED, DocumentStatus.FAILED] as const;
type ProcessingStatus = (typeof ALLOWED_STATUSES)[number];

export class ProcessingResultDto {
  @IsUUID()
  documentId!: string;

  @IsEnum(ALLOWED_STATUSES)
  status!: ProcessingStatus;

  @IsOptional()
  @IsObject()
  // Free-form shape from Lambda — not validated beyond being an object
  extractedData?: ExtractedCertificateData;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
