import { Type } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
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

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => ExtractedCertificateDataDto)
  extractedData?: ExtractedCertificateDataDto;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
