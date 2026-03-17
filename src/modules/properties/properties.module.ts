/**
 * Properties Module
 */

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Property, Tenant, User } from "../../entities";
import { PropertiesController } from "./properties.controller";
import { PropertiesService } from "./properties.service";

@Module({
  imports: [TypeOrmModule.forFeature([Property, Tenant, User])],
  controllers: [PropertiesController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
