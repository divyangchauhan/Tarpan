import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CaseStatus } from '@afterlight/shared';

export class UpdateDeceasedInfoDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsDateString()
  dateOfDeath?: string;

  @IsOptional()
  @IsString()
  placeOfDeath?: string;

  @IsOptional()
  @IsString()
  socialSecurityNumber?: string;
}

export class UpdateExecutorInfoDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateCaseDto {
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateDeceasedInfoDto)
  deceasedInfo?: UpdateDeceasedInfoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateExecutorInfoDto)
  executorInfo?: UpdateExecutorInfoDto;
}
