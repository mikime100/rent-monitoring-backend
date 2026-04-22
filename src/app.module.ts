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
import { ReportsModule } from "./modules/reports/reports.module";
import { TenantAccountsModule } from "./modules/tenant-accounts/tenant-accounts.module";
import { TenantPortalModule } from "./modules/tenant-portal/tenant-portal.module";
import { VisitorModule } from "./modules/visitor/visitor.module";
import { RemindersModule } from "./modules/reminders/reminders.module";
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
        const dbUrl = configService.get<string>("database.url");
        const useSsl = configService.get<boolean>("database.ssl");
        const rejectUnauthorized =
          configService.get<boolean>("database.sslRejectUnauthorized") !==
          false;

        return {
          type: "postgres",
          url: dbUrl || undefined,
          host: dbUrl
            ? undefined
            : configService.get<string>("database.host"),
          port: dbUrl
            ? undefined
            : configService.get<number>("database.port"),
          username: dbUrl
            ? undefined
            : configService.get<string>("database.username"),
          password: dbUrl
            ? undefined
            : configService.get<string>("database.password"),
          database: dbUrl
            ? undefined
            : configService.get<string>("database.name"),
          entities: [__dirname + "/entities/**/*.entity{.ts,.js}"],
          migrations: [__dirname + "/migrations/*{.ts,.js}"],
          synchronize: configService.get<boolean>("database.synchronize"),
          migrationsRun: configService.get<boolean>("database.synchronize")
            ? false
            : true, // Auto-run migrations when synchronize is off (production)
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
    ReportsModule,
    TenantAccountsModule,
    TenantPortalModule,
    VisitorModule,
    RemindersModule,
  ],
})
export class AppModule {}
