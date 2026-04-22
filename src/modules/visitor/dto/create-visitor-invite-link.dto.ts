/**
 * Create Visitor Invite Link DTO
 */

import { IsDateString, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class CreateVisitorInviteLinkDto {
  @ApiPropertyOptional({ example: "2025-05-01T12:00:00Z" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
