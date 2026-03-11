/**
 * Respond to Complaint DTO
 */

import {
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
} from "class-validator";
import { ComplaintStatus } from "../../../entities";

export class RespondComplaintDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  response: string;

  @IsEnum(ComplaintStatus)
  @IsOptional()
  status?: ComplaintStatus;
}
