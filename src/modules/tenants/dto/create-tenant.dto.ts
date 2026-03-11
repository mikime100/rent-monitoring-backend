/**
 * Create Tenant DTO
 */

import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsEmail,
  IsUUID,
  Min,
  Max,
  IsDateString,
  IsEnum,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TenantStatus } from "../../../entities";

export class CreateTenantDto {
  @ApiProperty({ example: "John" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: "Doe" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ example: "john.doe@example.com" })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: "+1234567890" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @ApiProperty({ example: "uuid-of-property" })
  @IsUUID()
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ example: "A101" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unitNumber: string;

  @ApiProperty({ example: 1500.0 })
  @IsNumber()
  @Min(0)
  monthlyRent: number;

  @ApiPropertyOptional({ example: "USD", default: "USD" })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({
    example: 1,
    description: "Day of month when rent is due (1-31)",
  })
  @IsNumber()
  @Min(1)
  @Max(31)
  rentDueDay: number;

  @ApiProperty({ example: "2024-01-01" })
  @IsDateString()
  @IsNotEmpty()
  contractStartDate: string;

  @ApiPropertyOptional({ example: "2025-01-01" })
  @IsOptional()
  @IsDateString()
  contractEndDate?: string;

  @ApiPropertyOptional({ example: 3000.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  securityDeposit?: number;

  @ApiPropertyOptional({ enum: TenantStatus })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ example: "uuid-of-staff" })
  @IsOptional()
  @IsUUID()
  assignedStaffId?: string;

  @ApiPropertyOptional({ example: "Jane Doe" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: "+0987654321" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ example: "Special instructions or notes" })
  @IsOptional()
  @IsString()
  notes?: string;
}
