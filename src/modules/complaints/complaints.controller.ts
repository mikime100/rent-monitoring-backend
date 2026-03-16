/**
 * Complaints Controller
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";
import { ComplaintsService } from "./complaints.service";
import { CreateComplaintDto } from "./dto/create-complaint.dto";
import { RespondComplaintDto } from "./dto/respond-complaint.dto";

interface AuthUser {
  sub: string;
  email: string;
  role: UserRole;
  managerId?: string;
}

@Controller("complaints")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  /**
   * POST /complaints - Staff or GM submits a complaint
   */
  @Post()
  @Roles(UserRole.STAFF, UserRole.GENERAL_MANAGER)
  async create(
    @Body() dto: CreateComplaintDto,
    @Request() req: { user: AuthUser },
  ) {
    return this.complaintsService.create(dto, req.user.sub);
  }

  /**
   * GET /complaints - Get all complaints (filtered by role)
   */
  @Get()
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER, UserRole.STAFF)
  async findAll(@Request() req: { user: AuthUser }) {
    return this.complaintsService.findAll(req.user.sub, req.user.role);
  }

  /**
   * GET /complaints/stats - Get complaint statistics
   */
  @Get("stats")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  async getStats() {
    return this.complaintsService.getStats();
  }

  /**
   * GET /complaints/property/:propertyId - Get complaints for a property
   */
  @Get("property/:propertyId")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
  async findByProperty(
    @Param("propertyId") propertyId: string,
    @Request() req: { user: AuthUser },
  ) {
    return this.complaintsService.findByProperty(
      propertyId,
      req.user.sub,
      req.user.role,
    );
  }

  /**
   * GET /complaints/:id - Get complaint by ID
   */
  @Get(":id")
  @Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER, UserRole.STAFF)
  async findById(@Param("id") id: string, @Request() req: { user: AuthUser }) {
    return this.complaintsService.findById(id, req.user.sub, req.user.role);
  }

  /**
   * PATCH /complaints/:id/respond - GM or Owner responds to a complaint
   */
  @Patch(":id/respond")
  @Roles(UserRole.GENERAL_MANAGER, UserRole.OWNER)
  async respond(
    @Param("id") id: string,
    @Body() dto: RespondComplaintDto,
    @Request() req: { user: AuthUser },
  ) {
    return this.complaintsService.respond(id, dto, req.user.sub, req.user.role);
  }
}
