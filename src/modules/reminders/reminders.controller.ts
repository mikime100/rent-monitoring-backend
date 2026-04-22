/**
 * Rent Reminders Controller
 */

import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RemindersService } from "./reminders.service";
import { UpdateTenantReminderPreferencesDto } from "./dto/update-tenant-reminder-preferences.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";

interface AuthUser {
  sub: string;
  role: UserRole;
}

@ApiTags("Rent Reminders")
@ApiBearerAuth()
@Controller("reminders")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get("preferences")
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: "Get tenant reminder preferences" })
  async getPreferences(@Request() req: { user: AuthUser }) {
    const data = await this.remindersService.getTenantPreferences(req.user.sub);
    return { success: true, data };
  }

  @Patch("preferences")
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: "Update tenant reminder preferences" })
  async updatePreferences(
    @Request() req: { user: AuthUser },
    @Body() dto: UpdateTenantReminderPreferencesDto,
  ) {
    const data = await this.remindersService.updateTenantPreferences(
      req.user.sub,
      dto,
    );
    return { success: true, data };
  }

  @Post("process-due")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Manually process due rent reminders" })
  async processDueReminders() {
    const data = await this.remindersService.processDueReminders();
    return { success: true, data };
  }
}
