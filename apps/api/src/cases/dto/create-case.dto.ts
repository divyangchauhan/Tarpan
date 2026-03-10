import { Type } from 'class-transformer';
import {
  IsDateString,
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

export class CreateCaseDto {
  @ValidateNested()
  @Type(() => DeceasedInfoDto)
  deceasedInfo!: DeceasedInfoDto;
}
