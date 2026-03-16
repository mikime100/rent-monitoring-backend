/**
 * Tenants Controller
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { TenantsService } from "./tenants.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { UpdateTenantDto } from "./dto/update-tenant.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";

interface AuthUser {
  sub: string;
  email: string;
  role: UserRole;
  managerId?: string;
}

@ApiTags("Tenants")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Create a new tenant" })
  async create(
    @Body() dto: CreateTenantDto,
    @Request() req: { user: AuthUser },
  ) {
    const tenant = await this.tenantsService.create(
      dto,
      req.user.sub,
      req.user.role,
    );
    return { success: true, data: tenant };
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Get all tenants" })
  async findAll(@Request() req: { user: AuthUser }) {
    const tenants = await this.tenantsService.findAll(
      req.user.sub,
      req.user.role,
      req.user.managerId,
    );
    return { success: true, data: tenants };
  }

  @Get("stats")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Get tenant statistics" })
  async getStats(@Request() req: { user: AuthUser }) {
    // Owner sees stats for ALL tenants
    const stats = await this.tenantsService.getStats(
      req.user.role === UserRole.OWNER ? undefined : req.user.sub,
    );
    return { success: true, data: stats };
  }

  @Get("due-today")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Get tenants with rent due today" })
  async findWithRentDueToday(@Request() req: { user: AuthUser }) {
    const tenants = await this.tenantsService.findWithRentDueToday(
      req.user.sub,
      req.user.role,
    );
    return { success: true, data: tenants };
  }

  @Get("expired-contracts")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Get tenants with expired contracts" })
  async findWithExpiredContracts(@Request() req: { user: AuthUser }) {
    const tenants = await this.tenantsService.findWithExpiredContracts(
      req.user.sub,
      req.user.role,
    );
    return { success: true, data: tenants };
  }

  @Get("property/:propertyId")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Get tenants by property" })
  async findByProperty(
    @Param("propertyId") propertyId: string,
    @Request() req: { user: AuthUser },
  ) {
    const tenants = await this.tenantsService.findByProperty(
      propertyId,
      req.user.sub,
      req.user.role,
    );
    return { success: true, data: tenants };
  }

  @Get(":id")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Get tenant by ID" })
  async findById(@Param("id") id: string, @Request() req: { user: AuthUser }) {
    const tenant = await this.tenantsService.findById(
      id,
      req.user.sub,
      req.user.role,
    );
    return { success: true, data: tenant };
  }

  @Patch(":id")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Update tenant" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateTenantDto,
    @Request() req: { user: AuthUser },
  ) {
    const tenant = await this.tenantsService.update(
      id,
      dto,
      req.user.sub,
      req.user.role,
    );
    return { success: true, data: tenant };
  }

  @Delete(":id")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Delete tenant" })
  async delete(@Param("id") id: string, @Request() req: { user: AuthUser }) {
    await this.tenantsService.delete(id, req.user.sub, req.user.role);
    return { success: true, message: "Tenant deleted" };
  }
}
