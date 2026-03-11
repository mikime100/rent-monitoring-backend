/**
 * Create Property DTO
 */

import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PropertyStatus } from "../../../entities";

export class CreatePropertyDto {
  @ApiProperty({ example: "Sunset Apartments" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: "123 Main Street" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiProperty({ example: "Los Angeles" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiPropertyOptional({ example: "California" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: "90001" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiProperty({ example: "USA" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @ApiPropertyOptional({ example: "A beautiful apartment complex" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(1)
  numberOfUnits: number;

  @ApiPropertyOptional({ enum: PropertyStatus, default: PropertyStatus.ACTIVE })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiPropertyOptional({ example: "https://example.com/image.jpg" })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
