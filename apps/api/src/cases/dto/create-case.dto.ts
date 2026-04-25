import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class DeceasedInfoDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsDateString()
  dateOfDeath!: string;

  @IsString()
  @IsNotEmpty()
  placeOfDeath!: string;

  @IsOptional()
  @IsString()
  socialSecurityNumber?: string;
}

export class ExecutorInfoDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsNotEmpty()
  relationship!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CreateCaseDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DeceasedInfoDto)
  deceasedInfo?: DeceasedInfoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutorInfoDto)
  executorInfo?: ExecutorInfoDto;
}
