/**
 * Reports Controller
 */

import { Controller, Get, UseGuards, Request } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { ReportsService, ReportSummary } from "./reports.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";

@ApiTags("Reports")
@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Get aggregated report summary
   */
  @Get("summary")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get aggregated report summary" })
  async getSummary(@Request() req: any): Promise<{
    success: boolean;
    data: ReportSummary;
  }> {
    const data = await this.reportsService.getSummary(
      req.user.sub,
      req.user.role,
    );
    return { success: true, data };
  }
}
