/**
 * Update User DTO
 */

import { PartialType, OmitType } from "@nestjs/mapped-types";
import { CreateUserDto } from "./create-user.dto";
import {
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from "class-validator";

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ["email", "role"] as const),
) {
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @IsOptional()
  password?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
