/**
 * Tax Schedules Module
 */

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TaxSchedule, Property } from "../../entities";
import { TaxSchedulesController } from "./tax-schedules.controller";
import { TaxSchedulesService } from "./tax-schedules.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([TaxSchedule, Property]),
    NotificationsModule,
  ],
  controllers: [TaxSchedulesController],
  providers: [TaxSchedulesService],
  exports: [TaxSchedulesService],
})
export class TaxSchedulesModule {}
