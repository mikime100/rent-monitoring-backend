/**
 * Sync Controller
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { SyncService, SyncResponse } from "./sync.service";
import { SyncRequestDto, DownloadChangesDto } from "./dto/sync.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("sync")
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * Download changes from server since last sync
   */
  @Get("download")
  async downloadChanges(
    @Query() query: DownloadChangesDto,
    @Request() req: any,
  ): Promise<SyncResponse> {
    const lastSyncTimestamp =
      query.lastSyncTimestamp || new Date(0).toISOString();
    return this.syncService.downloadChanges(
      lastSyncTimestamp,
      req.user.id,
      req.user.role,
    );
  }

  /**
   * Upload changes and sync
   */
  @Post("upload")
  async uploadChanges(
    @Body() dto: SyncRequestDto,
    @Request() req: any,
  ): Promise<SyncResponse> {
    return this.syncService.uploadChanges(dto, req.user.id, req.user.role);
  }

  /**
   * Full bidirectional sync
   */
  @Post("full")
  async fullSync(
    @Body() dto: SyncRequestDto,
    @Request() req: any,
  ): Promise<SyncResponse> {
    return this.syncService.uploadChanges(dto, req.user.id, req.user.role);
  }

  /**
   * Get sync status
   */
  @Get("status")
  async getSyncStatus(@Request() req: any) {
    return this.syncService.getSyncStatus(req.user.id);
  }
}
