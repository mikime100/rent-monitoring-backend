/**
 * Request Email Verification OTP DTO
 */

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RequestEmailVerificationDto {
  @ApiProperty({ example: "tenant@example.com" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: "password123" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
