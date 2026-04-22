/**
 * Verify Visitor Code DTO
 */

import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VisitorVerificationChannel } from "../../../entities";

export class VerifyVisitorCodeDto {
  @ApiProperty({ example: "123456" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiPropertyOptional({ enum: VisitorVerificationChannel, example: "manual" })
  @IsOptional()
  @IsEnum(VisitorVerificationChannel)
  channel?: VisitorVerificationChannel;

  @ApiPropertyOptional({ example: "Code shown by visitor at gate" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
