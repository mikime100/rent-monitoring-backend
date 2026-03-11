/**
 * Users Controller
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Create new staff member (General Manager only)
   */
  @Post("staff")
  @Roles(UserRole.GENERAL_MANAGER)
  createStaff(@Body() dto: CreateUserDto, @Request() req: any) {
    return this.usersService.createStaff(dto, req.user.sub);
  }

  /**
   * Get all staff members (General Manager sees own, Owner sees all)
   */
  @Get("staff")
  @Roles(UserRole.GENERAL_MANAGER, UserRole.OWNER)
  async findStaff(@Request() req: any) {
    if (req.user.role === UserRole.OWNER) {
      return this.usersService.findAllStaff();
    }
    return this.usersService.findStaffByManager(req.user.sub);
  }

  /**
   * Get staff by ID (General Manager only)
   */
  @Get("staff/:id")
  @Roles(UserRole.GENERAL_MANAGER)
  findStaffById(@Param("id", ParseUUIDPipe) id: string, @Request() req: any) {
    return this.usersService.findById(id, req.user.sub);
  }

  /**
   * Get staff statistics (General Manager only)
   */
  @Get("staff/:id/stats")
  @Roles(UserRole.GENERAL_MANAGER)
  getStaffStats(@Param("id", ParseUUIDPipe) id: string, @Request() req: any) {
    return this.usersService.getStaffStats(id, req.user.sub);
  }

  /**
   * Update staff member (General Manager only)
   */
  @Patch("staff/:id")
  @Roles(UserRole.GENERAL_MANAGER)
  updateStaff(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: any,
  ) {
    return this.usersService.updateStaff(id, dto, req.user.sub);
  }

  /**
   * Deactivate staff member (General Manager only)
   */
  @Patch("staff/:id/deactivate")
  @Roles(UserRole.GENERAL_MANAGER)
  deactivateStaff(@Param("id", ParseUUIDPipe) id: string, @Request() req: any) {
    return this.usersService.deactivateStaff(id, req.user.sub);
  }

  /**
   * Activate staff member (General Manager only)
   */
  @Patch("staff/:id/activate")
  @Roles(UserRole.GENERAL_MANAGER)
  activateStaff(@Param("id", ParseUUIDPipe) id: string, @Request() req: any) {
    return this.usersService.activateStaff(id, req.user.sub);
  }

  /**
   * Get current user profile
   */
  @Get("profile")
  getProfile(@Request() req: any) {
    return this.usersService.findById(req.user.sub);
  }
}
