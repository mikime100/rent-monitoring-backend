/**
 * Payments Module
 */

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Notification,
  Payment,
  Property,
  Tenant,
  User,
} from "../../entities";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Tenant, Property, User, Notification]),
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
