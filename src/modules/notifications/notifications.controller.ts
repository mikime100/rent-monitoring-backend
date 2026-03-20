/**
 * Notifications Controller
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Request,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";

@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Get notifications for current user
   */
  @Get()
  getNotifications(@Request() req: any, @Query("limit") limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.notificationsService.getNotifications(
      req.user.sub,
      parsedLimit,
    );
  }

  /**
   * Get unread notifications count
   */
  @Get("unread-count")
  getUnreadCount(@Request() req: any) {
    return this.notificationsService.getUnreadCount(req.user.sub);
  }

  /**
   * Mark notification as read
   */
  @Patch(":id/read")
  markAsRead(@Param("id", ParseUUIDPipe) id: string, @Request() req: any) {
    return this.notificationsService.markAsRead(id, req.user.sub);
  }

  /**
   * Mark all notifications as read
   */
  @Post("mark-all-read")
  markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.sub);
  }

  /**
   * Delete notification
   */
  @Delete(":id")
  delete(@Param("id", ParseUUIDPipe) id: string, @Request() req: any) {
    return this.notificationsService.delete(id, req.user.sub);
  }
}
