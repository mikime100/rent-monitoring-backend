/**
 * Create Payment DTO
 */

import {
  IsUUID,
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { PaymentStatus } from '../../../entities';

export class CreatePaymentDto {
  @IsUUID()
  tenantId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsDateString()
  paymentDate: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  transactionReference?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}
