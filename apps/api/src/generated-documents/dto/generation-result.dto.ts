import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { GeneratedDocumentStatus } from '@afterlight/shared';

const ALLOWED_STATUSES = [GeneratedDocumentStatus.READY, GeneratedDocumentStatus.FAILED] as const;
type GenerationResultStatus = (typeof ALLOWED_STATUSES)[number];

export class GenerationResultDto {
  @IsUUID()
  generatedDocumentId!: string;

  @IsEnum(ALLOWED_STATUSES)
  status!: GenerationResultStatus;

  @IsOptional()
  @IsString()
  s3Key?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
