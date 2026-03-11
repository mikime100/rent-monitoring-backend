/**
 * Update Payment DTO
 */

import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentDto } from './create-payment.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { PaymentStatus } from '../../../entities';

export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;
}
