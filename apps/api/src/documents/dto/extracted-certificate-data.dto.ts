import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

/** Runtime schema for the fields emitted by the processor extraction model. */
export class ExtractedCertificateDataDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() full_name?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() first_name?: string;
  @IsOptional() @IsString() middleName?: string;
  @IsOptional() @IsString() middle_name?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() last_name?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() date_of_birth?: string;
  @IsOptional() @IsString() dateOfDeath?: string;
  @IsOptional() @IsString() date_of_death?: string;
  @IsOptional() @IsString() placeOfDeath?: string;
  @IsOptional() @IsString() place_of_death?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() certificateNumber?: string;
  @IsOptional() @IsString() certificate_number?: string;
  @IsOptional() @IsString() certifierName?: string;
  @IsOptional() @IsString() certifier_name?: string;
  @IsOptional() @IsString() certifierTitle?: string;
  @IsOptional() @IsString() certifier_title?: string;
  @IsOptional() @IsString() socialSecurityNumber?: string;
  @IsOptional() @IsString() social_security_number?: string;
  @IsOptional() @IsNumber() extractionConfidence!: number;
  @IsOptional() @IsBoolean() needsReview!: boolean;
}
