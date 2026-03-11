/**
 * Update FCM Token DTO
 */

import { IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateFcmTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fcmToken: string;
}
