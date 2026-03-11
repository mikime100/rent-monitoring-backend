/**
 * Create Tax Schedule DTO
 */

import { TaxFrequency } from "../../../entities";

export class CreateTaxScheduleDto {
  propertyId: string;
  taxLabel: string;
  frequency: TaxFrequency;
  dueDay: number;
  amount?: number;
  notes?: string;
}

export class UpdateTaxScheduleDto {
  taxLabel?: string;
  frequency?: TaxFrequency;
  dueDay?: number;
  amount?: number;
  notes?: string;
  isActive?: boolean;
}
