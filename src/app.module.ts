/**
 * Root Application Module
 */

import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { lookup } from "node:dns/promises";
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

const RENDER_DB_REGIONS = [
  "oregon",
  "ohio",
  "virginia",
  "frankfurt",
  "singapore",
];

interface BootstrapCheckConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl: false | { rejectUnauthorized: boolean };
}

async function resolveRenderDbHost(host: string): Promise<string> {
  if (!host || host.includes(".")) {
    return host;
  }

  try {
    await lookup(host);
    return host;
  } catch {
    // Try region-qualified Render hostnames when short private DNS names fail.
  }

  const configuredRegion = process.env.RENDER_REGION;
  const regions = configuredRegion
    ? [configuredRegion, ...RENDER_DB_REGIONS.filter((r) => r !== configuredRegion)]
    : RENDER_DB_REGIONS;

  for (const region of regions) {
    const candidate = `${host}.${region}-postgres.render.com`;
    try {
      await lookup(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return host;
}

async function shouldBootstrapEmptyDatabase(
  config: BootstrapCheckConfig,
): Promise<boolean> {
  let client: any = null;

  try {
    const { Client } = require("pg") as { Client: new (cfg: any) => any };
    client = new Client(config);
    await client.connect();

    const result = await client.query(`
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'users'
        ) AS has_users,
        EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'migrations'
        ) AS has_migrations;
    `);

    const row = result.rows?.[0];
    return row ? !row.has_users && !row.has_migrations : false;
  } catch {
    return false;
  } finally {
    if (client) {
      await client.end().catch(() => undefined);
    }
  }
}

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
      useFactory: async (configService: ConfigService) => {
        const dbUrl = configService.get<string>("database.url");
        const useSsl = configService.get<boolean>("database.ssl");
        const rejectUnauthorized =
          configService.get<boolean>("database.sslRejectUnauthorized") !==
          false;
        const rawHost = configService.get<string>("database.host") ?? "";
        const resolvedHost = dbUrl
          ? undefined
          : await resolveRenderDbHost(rawHost);
        const port = dbUrl
          ? undefined
          : configService.get<number>("database.port");
        const username = dbUrl
          ? undefined
          : configService.get<string>("database.username");
        const password = dbUrl
          ? undefined
          : configService.get<string>("database.password");
        const database = dbUrl
          ? undefined
          : configService.get<string>("database.name");
        const ssl = useSsl ? { rejectUnauthorized } : false;

        let synchronize = configService.get<boolean>("database.synchronize");
        let migrationsRun = synchronize ? false : true;

        if (!synchronize) {
          const bootstrapRequired = await shouldBootstrapEmptyDatabase({
            connectionString: dbUrl || undefined,
            host: resolvedHost,
            port,
            user: username,
            password,
            database,
            ssl,
          });

          if (bootstrapRequired) {
            synchronize = true;
            migrationsRun = false;
            console.log(
              "[bootstrap] Empty database detected. Using synchronize for initial schema creation.",
            );
          }
        }

        return {
          type: "postgres",
          url: dbUrl || undefined,
          host: resolvedHost,
          port,
          username,
          password,
          database,
          entities: [__dirname + "/entities/**/*.entity{.ts,.js}"],
          migrations: [__dirname + "/migrations/*{.ts,.js}"],
          synchronize,
          migrationsRun,
          logging: configService.get<boolean>("database.logging"),
          ssl,
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
