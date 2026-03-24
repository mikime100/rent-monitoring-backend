/**
 * Reports Module
 */

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import {
  Property,
  Tenant,
  Payment,
  Complaint,
  User,
} from "../../entities";

@Module({
  imports: [
    TypeOrmModule.forFeature([Property, Tenant, Payment, Complaint, User]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
