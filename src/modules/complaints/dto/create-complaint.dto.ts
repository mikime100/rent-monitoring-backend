/**
 * Create Complaint DTO
 */

import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsUUID,
} from "class-validator";

export class CreateComplaintDto {
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}
