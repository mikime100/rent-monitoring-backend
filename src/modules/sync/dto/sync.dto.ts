/**
 * Sync DTOs
 */

import { IsString, IsArray, IsOptional, ValidateNested, IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SyncRecordDto {
  @IsString()
  id: string;

  @IsString()
  tableName: string;

  @IsEnum(['create', 'update', 'delete'])
  operation: 'create' | 'update' | 'delete';

  data: Record<string, any>;

  @IsString()
  localTimestamp: string;

  @IsNumber()
  version: number;
}

export class SyncRequestDto {
  @IsString()
  lastSyncTimestamp: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncRecordDto)
  changes: SyncRecordDto[];
}

export class DownloadChangesDto {
  @IsString()
  @IsOptional()
  lastSyncTimestamp?: string;
}
