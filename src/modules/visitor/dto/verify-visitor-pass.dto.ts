/**
 * Verify Visitor Pass DTO
 */

import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  IsOptional,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VisitorVerificationChannel } from "../../../entities";

export class VerifyVisitorPassDto {
  @ApiProperty({ example: "pass-id" })
  @IsUUID()
  passId: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiPropertyOptional({ enum: VisitorVerificationChannel, example: "manual" })
  @IsOptional()
  @IsEnum(VisitorVerificationChannel)
  channel?: VisitorVerificationChannel;

  @ApiPropertyOptional({ example: "ID matched with national card" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
