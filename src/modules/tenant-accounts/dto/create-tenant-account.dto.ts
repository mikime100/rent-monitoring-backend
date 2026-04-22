/**
 * Create Tenant Account DTO
 */

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTenantAccountDto {
  @ApiProperty({ example: "tenant-id" })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ example: "tenant@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "StrongPass123" })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: "+254700000000" })
  @IsOptional()
  @IsString()
  @Matches(/^(\+?[1-9]\d{9,14}|0\d{9,14})$/, {
    message: "Invalid phone number format",
  })
  phone?: string;
}
