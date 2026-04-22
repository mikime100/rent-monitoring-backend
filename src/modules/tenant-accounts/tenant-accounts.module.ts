/**
 * Tenant Accounts Module
 */

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TenantAccount, Tenant, User } from "../../entities";
import { TenantAccountsController } from "./tenant-accounts.controller";
import { TenantAccountsService } from "./tenant-accounts.service";

@Module({
  imports: [TypeOrmModule.forFeature([TenantAccount, Tenant, User])],
  controllers: [TenantAccountsController],
  providers: [TenantAccountsService],
  exports: [TenantAccountsService],
})
export class TenantAccountsModule {}
