/**
 * Tenant Accounts Controller
 */

import { Controller, Post, Body, UseGuards, Request } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TenantAccountsService } from "./tenant-accounts.service";
import { CreateTenantAccountDto } from "./dto/create-tenant-account.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";

interface AuthUser {
  sub: string;
  role: UserRole;
}

@ApiTags("Tenant Accounts")
@ApiBearerAuth()
@Controller("tenant-accounts")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantAccountsController {
  constructor(private readonly tenantAccountsService: TenantAccountsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Create a tenant account" })
  async create(
    @Body() dto: CreateTenantAccountDto,
    @Request() req: { user: AuthUser },
  ) {
    const result = await this.tenantAccountsService.createTenantAccount(
      dto,
      req.user.sub,
      req.user.role,
    );
    return { success: true, data: result };
  }
}
