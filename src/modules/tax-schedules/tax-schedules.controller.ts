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
} from "@nestjs/common";
import { TaxSchedulesService } from "./tax-schedules.service";
import {
  CreateTaxScheduleDto,
  UpdateTaxScheduleDto,
} from "./dto/create-tax-schedule.dto";

@Controller("tax-schedules")
export class TaxSchedulesController {
  constructor(private readonly taxSchedulesService: TaxSchedulesService) {}

  @Post()
  create(@Body() dto: CreateTaxScheduleDto) {
    return this.taxSchedulesService.create(dto);
  }

  @Get()
  findAll(@Query("propertyId") propertyId?: string) {
    return this.taxSchedulesService.findAll(propertyId);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.taxSchedulesService.findById(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTaxScheduleDto) {
    return this.taxSchedulesService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.taxSchedulesService.remove(id);
  }

  /**
   * Manually trigger notification check for all active schedules
   */
  @Post("check-notifications")
  checkNotifications() {
    return this.taxSchedulesService.checkAndSendNotifications();
  }
}
