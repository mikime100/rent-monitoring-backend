/**
 * Properties Controller
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
import { PropertiesService } from "./properties.service";
import { CreatePropertyDto } from "./dto/create-property.dto";
import { UpdatePropertyDto } from "./dto/update-property.dto";
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

@ApiTags("Properties")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("properties")
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @Roles(UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Create a new property" })
  async create(
    @Body() dto: CreatePropertyDto,
    @Request() req: { user: AuthUser },
  ) {
    const property = await this.propertiesService.create(dto, req.user.sub);
    return { success: true, data: property };
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER, UserRole.STAFF)
  @ApiOperation({ summary: "Get all properties" })
  async findAll(
    @Request() req: { user: AuthUser },
    @Query("scope") scope?: string,
  ) {
    // scope=all should never bypass role boundaries
    if (scope === "all") {
      const properties =
        req.user.role === UserRole.OWNER
          ? await this.propertiesService.findAll()
          : req.user.role === UserRole.GENERAL_MANAGER
            ? await this.propertiesService.findAllByManager(req.user.sub)
            : await this.propertiesService.findAllByStaff(req.user.sub);
      return { success: true, data: properties };
    }
    // Owner sees ALL properties; GM sees only their own; Staff sees assigned
    const properties =
      req.user.role === UserRole.OWNER
        ? await this.propertiesService.findAll()
        : req.user.role === UserRole.GENERAL_MANAGER
          ? await this.propertiesService.findAllByManager(req.user.sub)
          : await this.propertiesService.findAllByStaff(req.user.sub);
    return { success: true, data: properties };
  }

  @Get("stats")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Get property statistics" })
  async getStats(@Request() req: { user: AuthUser }) {
    // Owner sees stats for ALL properties
    const stats =
      req.user.role === UserRole.OWNER
        ? await this.propertiesService.getAllStats()
        : await this.propertiesService.getStats(req.user.sub);
    return { success: true, data: stats };
  }

  @Get(":id")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Get property by ID" })
  async findById(@Param("id") id: string, @Request() req: { user: AuthUser }) {
    const property = await this.propertiesService.findById(
      id,
      req.user.sub,
      req.user.role,
    );
    return { success: true, data: property };
  }

  @Patch(":id")
  @Roles(UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Update property" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdatePropertyDto,
    @Request() req: { user: AuthUser },
  ) {
    const property = await this.propertiesService.update(id, dto, req.user.sub);
    return { success: true, data: property };
  }

  @Delete(":id")
  @Roles(UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Delete property" })
  async delete(@Param("id") id: string, @Request() req: { user: AuthUser }) {
    await this.propertiesService.delete(id, req.user.sub);
    return { success: true, message: "Property deleted" };
  }

  @Post(":id/staff/:staffId")
  @Roles(UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Assign staff to property" })
  async assignStaff(
    @Param("id") id: string,
    @Param("staffId") staffId: string,
    @Request() req: { user: AuthUser },
  ) {
    const property = await this.propertiesService.assignStaff(
      id,
      staffId,
      req.user.sub,
    );
    return { success: true, data: property };
  }

  @Delete(":id/staff/:staffId")
  @Roles(UserRole.GENERAL_MANAGER)
  @ApiOperation({ summary: "Remove staff from property" })
  async removeStaff(
    @Param("id") id: string,
    @Param("staffId") staffId: string,
    @Request() req: { user: AuthUser },
  ) {
    const property = await this.propertiesService.removeStaff(
      id,
      staffId,
      req.user.sub,
    );
    return { success: true, data: property };
  }
}
