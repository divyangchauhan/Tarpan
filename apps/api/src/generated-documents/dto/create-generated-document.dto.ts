import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { InstitutionType } from '@afterlight/shared';

export class CreateGeneratedDocumentDto {
  @IsUUID()
  documentId!: string;

  @IsEnum(InstitutionType)
  institutionType!: InstitutionType;

  @IsOptional()
  @IsString()
  institutionName?: string;
}
