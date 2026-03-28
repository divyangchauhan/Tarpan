import { IsNotEmpty, IsString } from 'class-validator';

export class InitiateUploadDto {
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;
}
