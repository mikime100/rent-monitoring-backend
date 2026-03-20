/**
 * Root Application Module
 */

import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { PropertiesModule } from "./modules/properties/properties.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { SyncModule } from "./modules/sync/sync.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { HealthModule } from "./modules/health/health.module";
import { ComplaintsModule } from "./modules/complaints/complaints.module";
import { TaxSchedulesModule } from "./modules/tax-schedules/tax-schedules.module";
import configuration from "./config/configuration";

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const useSsl = configService.get<boolean>("database.ssl");
        const rejectUnauthorized =
          configService.get<boolean>("database.sslRejectUnauthorized") !==
          false;

        return {
          type: "postgres",
          host: configService.get<string>("database.host"),
          port: configService.get<number>("database.port"),
          username: configService.get<string>("database.username"),
          password: configService.get<string>("database.password"),
          database: configService.get<string>("database.name"),
          entities: [__dirname + "/entities/**/*.entity{.ts,.js}"],
          synchronize: configService.get<boolean>("database.synchronize"),
          logging: configService.get<boolean>("database.logging"),
          ssl: useSsl ? { rejectUnauthorized } : false,
        };
      },
    }),

    // Feature modules
    AuthModule,
    UsersModule,
    PropertiesModule,
    TenantsModule,
    PaymentsModule,
    SyncModule,
    NotificationsModule,
    HealthModule,
    ComplaintsModule,
    TaxSchedulesModule,
  ],
})
export class AppModule {}
