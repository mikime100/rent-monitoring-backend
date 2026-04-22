/**
 * Tenant Portal Controller
 */

import { Controller, Get, Query, UseGuards, Request } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TenantPortalService } from "./tenant-portal.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";

interface AuthUser {
  sub: string;
  role: UserRole;
}

@ApiTags("Tenant Portal")
@ApiBearerAuth()
@Controller("tenant")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantPortalController {
  constructor(private readonly tenantPortalService: TenantPortalService) {}

  @Get("me")
  @ApiOperation({ summary: "Get tenant profile" })
  async getProfile(@Request() req: { user: AuthUser }) {
    const data = await this.tenantPortalService.getProfile(req.user.sub);
    return { success: true, data };
  }

  @Get("rent-summary")
  @ApiOperation({ summary: "Get tenant rent summary" })
  async getRentSummary(@Request() req: { user: AuthUser }) {
    const data = await this.tenantPortalService.getRentSummary(req.user.sub);
    return { success: true, data };
  }

  @Get("payments")
  @ApiOperation({ summary: "Get tenant payments" })
  async getPayments(
    @Request() req: { user: AuthUser },
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 12;
    const safeLimit =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 12;
    const data = await this.tenantPortalService.getPayments(
      req.user.sub,
      safeLimit,
    );
    return { success: true, data };
  }
}
