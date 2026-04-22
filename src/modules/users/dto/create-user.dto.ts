/**
 * Create User DTO
 */

import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
  IsArray,
  ArrayUnique,
  IsUUID,
  IsEnum,
} from "class-validator";
import { UserRole } from "../../../entities";

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @IsString()
  @Matches(/^(\+?[1-9]\d{9,14}|0\d{9,14})$/, {
    message: "Invalid phone number format",
  })
  phone: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  assignedPropertyIds?: string[];

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
