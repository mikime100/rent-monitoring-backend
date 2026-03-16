/**
 * Tax Schedules Controller
 * CRUD endpoints + notification check trigger
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
import { TaxSchedulesService } from "./tax-schedules.service";
import {
  CreateTaxScheduleDto,
  UpdateTaxScheduleDto,
} from "./dto/create-tax-schedule.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../../entities";

@Controller("tax-schedules")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.GENERAL_MANAGER)
export class TaxSchedulesController {
  constructor(private readonly taxSchedulesService: TaxSchedulesService) {}

  @Post()
  create(@Body() dto: CreateTaxScheduleDto, @Request() req: any) {
    return this.taxSchedulesService.create(dto, req.user.sub, req.user.role);
  }

  @Get()
  findAll(@Query("propertyId") propertyId: string | undefined, @Request() req: any) {
    return this.taxSchedulesService.findAll(
      req.user.sub,
      req.user.role,
      propertyId,
    );
  }

  @Get(":id")
  findById(@Param("id") id: string, @Request() req: any) {
    return this.taxSchedulesService.findById(id, req.user.sub, req.user.role);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTaxScheduleDto,
    @Request() req: any,
  ) {
    return this.taxSchedulesService.update(id, dto, req.user.sub, req.user.role);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Request() req: any) {
    return this.taxSchedulesService.remove(id, req.user.sub, req.user.role);
  }

  /**
   * Manually trigger notification check for all active schedules
   */
  @Post("check-notifications")
  checkNotifications(@Request() req: any) {
    return this.taxSchedulesService.checkAndSendNotifications(
      req.user.sub,
      req.user.role,
    );
  }
}
