import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { DocumentStatus } from '@tarpan/shared';
import { ExtractedCertificateDataDto } from './extracted-certificate-data.dto';

// Allowed statuses for processing callback
const ALLOWED_STATUSES = [DocumentStatus.PROCESSED, DocumentStatus.FAILED] as const;
type ProcessingStatus = (typeof ALLOWED_STATUSES)[number];

export class ProcessingResultDto {
  @IsUUID()
  documentId!: string;

  @IsEnum(ALLOWED_STATUSES)
  status!: ProcessingStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExtractedCertificateDataDto)
  extractedData?: ExtractedCertificateDataDto;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
