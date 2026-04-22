/**
 * Visitor Module
 */

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  TenantAccount,
  VisitorInviteLink,
  VisitorPass,
  VisitorVerificationLog,
} from "../../entities";
import { VisitorController } from "./visitor.controller";
import { VisitorService } from "./visitor.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantAccount,
      VisitorInviteLink,
      VisitorPass,
      VisitorVerificationLog,
    ]),
  ],
  controllers: [VisitorController],
  providers: [VisitorService],
})
export class VisitorModule {}
