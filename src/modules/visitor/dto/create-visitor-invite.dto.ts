/**
 * Create Visitor Invite DTO
 */

import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateVisitorInviteDto {
  @ApiProperty({ example: "John Doe" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  visitorName: string;

  @ApiProperty({ example: "+254700000000" })
  @IsString()
  @Matches(/^(\+?[1-9]\d{9,14}|0\d{9,14})$/, {
    message: "Invalid phone number format",
  })
  visitorPhone: string;

  @ApiPropertyOptional({ example: "guest@example.com" })
  @IsOptional()
  @IsEmail()
  visitorEmail?: string;

  @ApiPropertyOptional({ example: "2026-04-23T12:00:00Z" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
