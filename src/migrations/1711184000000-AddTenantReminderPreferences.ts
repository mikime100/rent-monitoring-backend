/**
 * Migration: Add tenant reminder preferences and dispatch logs
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantReminderPreferences1711184000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'reminder_channel_enum'
        ) THEN
          CREATE TYPE reminder_channel_enum AS ENUM ('push', 'email');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_reminder_preferences (
        id uuid PRIMARY KEY,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now(),
        sync_status tenant_accounts_sync_status_enum DEFAULT 'synced',
        version int DEFAULT 1,
        tenant_account_id uuid NOT NULL,
        push_enabled boolean DEFAULT true,
        email_enabled boolean DEFAULT true,
        due_day_enabled boolean DEFAULT true,
        before_due_days int[] DEFAULT '{7,3,1}',
        after_due_days int[] DEFAULT '{3,7}'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reminder_dispatch_logs (
        id uuid PRIMARY KEY,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now(),
        sync_status tenant_accounts_sync_status_enum DEFAULT 'synced',
        version int DEFAULT 1,
        tenant_account_id uuid NOT NULL,
        payment_id uuid,
        channel reminder_channel_enum NOT NULL,
        reminder_type varchar(50) NOT NULL,
        due_date date NOT NULL,
        dedupe_key varchar(200) NOT NULL,
        dispatched_at TIMESTAMP NOT NULL
      );
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='tenant_reminder_preferences_tenant_account_fkey'
        ) THEN
          ALTER TABLE tenant_reminder_preferences
            ADD CONSTRAINT tenant_reminder_preferences_tenant_account_fkey
            FOREIGN KEY (tenant_account_id) REFERENCES tenant_accounts(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='reminder_dispatch_logs_tenant_account_fkey'
        ) THEN
          ALTER TABLE reminder_dispatch_logs
            ADD CONSTRAINT reminder_dispatch_logs_tenant_account_fkey
            FOREIGN KEY (tenant_account_id) REFERENCES tenant_accounts(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='reminder_dispatch_logs_payment_fkey'
        ) THEN
          ALTER TABLE reminder_dispatch_logs
            ADD CONSTRAINT reminder_dispatch_logs_payment_fkey
            FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS tenant_reminder_preferences_account_unique
        ON tenant_reminder_preferences (tenant_account_id);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS reminder_dispatch_logs_dedupe_unique
        ON reminder_dispatch_logs (dedupe_key);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS reminder_dispatch_logs_tenant_account_idx
        ON reminder_dispatch_logs (tenant_account_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS reminder_dispatch_logs_due_date_idx
        ON reminder_dispatch_logs (due_date);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS reminder_dispatch_logs_due_date_idx;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS reminder_dispatch_logs_tenant_account_idx;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS reminder_dispatch_logs_dedupe_unique;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS tenant_reminder_preferences_account_unique;
    `);

    await queryRunner.query(`
      ALTER TABLE reminder_dispatch_logs
        DROP CONSTRAINT IF EXISTS reminder_dispatch_logs_payment_fkey;
    `);
    await queryRunner.query(`
      ALTER TABLE reminder_dispatch_logs
        DROP CONSTRAINT IF EXISTS reminder_dispatch_logs_tenant_account_fkey;
    `);
    await queryRunner.query(`
      ALTER TABLE tenant_reminder_preferences
        DROP CONSTRAINT IF EXISTS tenant_reminder_preferences_tenant_account_fkey;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS reminder_dispatch_logs;
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS tenant_reminder_preferences;
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS reminder_channel_enum;
    `);
  }
}
