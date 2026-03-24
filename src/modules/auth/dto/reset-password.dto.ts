/**
 * Reset Password DTO
 */

import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ResetPasswordDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @IsNotEmpty()
  otp: string;

  @ApiProperty({ example: "newSecurePassword123" })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
