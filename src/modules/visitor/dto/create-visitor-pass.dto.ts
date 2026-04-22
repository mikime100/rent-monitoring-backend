/**
 * Create Visitor Pass DTO
 */

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateVisitorPassDto {
  @ApiProperty({ example: "John Doe" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  visitorName: string;

  @ApiPropertyOptional({ example: "+254700000000" })
  @IsOptional()
  @IsString()
  @Matches(/^(\+?[1-9]\d{9,14}|0\d{9,14})$/, {
    message: "Invalid phone number format",
  })
  visitorPhone?: string;

  @ApiPropertyOptional({ example: "guest@example.com" })
  @IsOptional()
  @IsEmail()
  visitorEmail?: string;

  @ApiPropertyOptional({ example: "ID123456" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idNumber?: string;

  @ApiPropertyOptional({ example: "KAA 123B" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehiclePlate?: string;

  @ApiPropertyOptional({ example: "https://example.com/photo.jpg" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;
}
