/**
 * Migration: Add email verification fields and tenant accounts table
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantAccountsAndEmailVerification1711182000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='email_verified_at'
        ) THEN
          ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='email_verification_otp'
        ) THEN
          ALTER TABLE users ADD COLUMN email_verification_otp VARCHAR(255);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='email_verification_otp_expires_at'
        ) THEN
          ALTER TABLE users ADD COLUMN email_verification_otp_expires_at TIMESTAMP;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='email_verification_sent_at'
        ) THEN
          ALTER TABLE users ADD COLUMN email_verification_sent_at TIMESTAMP;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'tenant_accounts_sync_status_enum'
        ) THEN
          CREATE TYPE tenant_accounts_sync_status_enum AS ENUM ('pending', 'synced', 'failed');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_accounts (
        id uuid PRIMARY KEY,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now(),
        sync_status tenant_accounts_sync_status_enum DEFAULT 'synced',
        version int DEFAULT 1,
        user_id uuid NOT NULL,
        tenant_id uuid NOT NULL,
        property_id uuid NOT NULL,
        unit_number varchar(100) NOT NULL,
        unit_number_normalized varchar(100) NOT NULL,
        is_active boolean DEFAULT true
      );
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='tenant_accounts_user_id_fkey'
        ) THEN
          ALTER TABLE tenant_accounts
            ADD CONSTRAINT tenant_accounts_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='tenant_accounts_tenant_id_fkey'
        ) THEN
          ALTER TABLE tenant_accounts
            ADD CONSTRAINT tenant_accounts_tenant_id_fkey
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='tenant_accounts_property_id_fkey'
        ) THEN
          ALTER TABLE tenant_accounts
            ADD CONSTRAINT tenant_accounts_property_id_fkey
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS tenant_accounts_user_id_unique
        ON tenant_accounts (user_id);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS tenant_accounts_tenant_id_unique
        ON tenant_accounts (tenant_id);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS tenant_accounts_unit_active_unique
        ON tenant_accounts (property_id, unit_number_normalized)
        WHERE is_active = true;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS tenant_accounts_property_id_idx
        ON tenant_accounts (property_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS tenant_accounts_property_id_idx;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS tenant_accounts_unit_active_unique;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS tenant_accounts_tenant_id_unique;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS tenant_accounts_user_id_unique;
    `);

    await queryRunner.query(`
      ALTER TABLE tenant_accounts
        DROP CONSTRAINT IF EXISTS tenant_accounts_property_id_fkey;
    `);
    await queryRunner.query(`
      ALTER TABLE tenant_accounts
        DROP CONSTRAINT IF EXISTS tenant_accounts_tenant_id_fkey;
    `);
    await queryRunner.query(`
      ALTER TABLE tenant_accounts
        DROP CONSTRAINT IF EXISTS tenant_accounts_user_id_fkey;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS tenant_accounts;
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS tenant_accounts_sync_status_enum;
    `);

    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS email_verification_sent_at;
    `);
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS email_verification_otp_expires_at;
    `);
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS email_verification_otp;
    `);
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
    `);
  }
}
