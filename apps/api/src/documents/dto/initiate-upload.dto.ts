import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class InitiateUploadDto {
  @IsUUID()
  caseId!: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;
}
