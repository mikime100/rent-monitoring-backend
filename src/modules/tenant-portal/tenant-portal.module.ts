/**
 * Tenant Portal Module
 */

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TenantAccount, Tenant, Property, Payment } from "../../entities";
import { TenantPortalController } from "./tenant-portal.controller";
import { TenantPortalService } from "./tenant-portal.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantAccount, Tenant, Property, Payment]),
  ],
  controllers: [TenantPortalController],
  providers: [TenantPortalService],
})
export class TenantPortalModule {}
