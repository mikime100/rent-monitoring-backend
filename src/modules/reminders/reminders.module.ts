/**
 * Rent Reminders Module
 */

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  TenantAccount,
  TenantReminderPreference,
  ReminderDispatchLog,
  Payment,
} from "../../entities";
import { NotificationsModule } from "../notifications/notifications.module";
import { RemindersController } from "./reminders.controller";
import { RemindersService } from "./reminders.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantAccount,
      TenantReminderPreference,
      ReminderDispatchLog,
      Payment,
    ]),
    NotificationsModule,
  ],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
