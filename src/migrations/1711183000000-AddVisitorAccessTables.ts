/**
 * Migration: Add visitor access tables
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorAccessTables1711183000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'visitor_invite_status_enum'
        ) THEN
          CREATE TYPE visitor_invite_status_enum AS ENUM ('active', 'revoked', 'expired');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'visitor_pass_status_enum'
        ) THEN
          CREATE TYPE visitor_pass_status_enum AS ENUM ('pending', 'verified', 'expired', 'revoked');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'visitor_verification_action_enum'
        ) THEN
          CREATE TYPE visitor_verification_action_enum AS ENUM ('verified', 'denied');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'visitor_verification_channel_enum'
        ) THEN
          CREATE TYPE visitor_verification_channel_enum AS ENUM ('qr', 'manual');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS visitor_invite_links (
        id uuid PRIMARY KEY,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now(),
        sync_status tenant_accounts_sync_status_enum DEFAULT 'synced',
        version int DEFAULT 1,
        tenant_account_id uuid NOT NULL,
        property_id uuid NOT NULL,
        unit_number varchar(100) NOT NULL,
        share_token_hash varchar(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        status visitor_invite_status_enum DEFAULT 'active'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS visitor_passes (
        id uuid PRIMARY KEY,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now(),
        sync_status tenant_accounts_sync_status_enum DEFAULT 'synced',
        version int DEFAULT 1,
        invite_link_id uuid NOT NULL,
        visitor_name varchar(255) NOT NULL,
        visitor_phone varchar(50),
        visitor_email varchar(255),
        id_number varchar(120),
        vehicle_plate varchar(120),
        photo_url text,
        verification_code_hash varchar(255) NOT NULL,
        verification_code_expires_at TIMESTAMP NOT NULL,
        status visitor_pass_status_enum DEFAULT 'pending',
        used_at TIMESTAMP,
        verified_by_id uuid
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS visitor_verification_logs (
        id uuid PRIMARY KEY,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now(),
        sync_status tenant_accounts_sync_status_enum DEFAULT 'synced',
        version int DEFAULT 1,
        visitor_pass_id uuid NOT NULL,
        guard_user_id uuid,
        action visitor_verification_action_enum NOT NULL,
        channel visitor_verification_channel_enum NOT NULL,
        notes text,
        metadata jsonb
      );
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='visitor_invite_links_tenant_account_id_fkey'
        ) THEN
          ALTER TABLE visitor_invite_links
            ADD CONSTRAINT visitor_invite_links_tenant_account_id_fkey
            FOREIGN KEY (tenant_account_id) REFERENCES tenant_accounts(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='visitor_invite_links_property_id_fkey'
        ) THEN
          ALTER TABLE visitor_invite_links
            ADD CONSTRAINT visitor_invite_links_property_id_fkey
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='visitor_passes_invite_link_id_fkey'
        ) THEN
          ALTER TABLE visitor_passes
            ADD CONSTRAINT visitor_passes_invite_link_id_fkey
            FOREIGN KEY (invite_link_id) REFERENCES visitor_invite_links(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='visitor_passes_verified_by_id_fkey'
        ) THEN
          ALTER TABLE visitor_passes
            ADD CONSTRAINT visitor_passes_verified_by_id_fkey
            FOREIGN KEY (verified_by_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='visitor_verification_logs_pass_id_fkey'
        ) THEN
          ALTER TABLE visitor_verification_logs
            ADD CONSTRAINT visitor_verification_logs_pass_id_fkey
            FOREIGN KEY (visitor_pass_id) REFERENCES visitor_passes(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name='visitor_verification_logs_guard_id_fkey'
        ) THEN
          ALTER TABLE visitor_verification_logs
            ADD CONSTRAINT visitor_verification_logs_guard_id_fkey
            FOREIGN KEY (guard_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS visitor_invite_links_property_idx
        ON visitor_invite_links (property_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS visitor_invite_links_tenant_account_idx
        ON visitor_invite_links (tenant_account_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS visitor_passes_invite_link_idx
        ON visitor_passes (invite_link_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS visitor_passes_status_idx
        ON visitor_passes (status);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS visitor_verification_logs_pass_idx
        ON visitor_verification_logs (visitor_pass_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS visitor_verification_logs_pass_idx;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS visitor_passes_status_idx;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS visitor_passes_invite_link_idx;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS visitor_invite_links_tenant_account_idx;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS visitor_invite_links_property_idx;
    `);

    await queryRunner.query(`
      ALTER TABLE visitor_verification_logs
        DROP CONSTRAINT IF EXISTS visitor_verification_logs_guard_id_fkey;
    `);
    await queryRunner.query(`
      ALTER TABLE visitor_verification_logs
        DROP CONSTRAINT IF EXISTS visitor_verification_logs_pass_id_fkey;
    `);
    await queryRunner.query(`
      ALTER TABLE visitor_passes
        DROP CONSTRAINT IF EXISTS visitor_passes_verified_by_id_fkey;
    `);
    await queryRunner.query(`
      ALTER TABLE visitor_passes
        DROP CONSTRAINT IF EXISTS visitor_passes_invite_link_id_fkey;
    `);
    await queryRunner.query(`
      ALTER TABLE visitor_invite_links
        DROP CONSTRAINT IF EXISTS visitor_invite_links_property_id_fkey;
    `);
    await queryRunner.query(`
      ALTER TABLE visitor_invite_links
        DROP CONSTRAINT IF EXISTS visitor_invite_links_tenant_account_id_fkey;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS visitor_verification_logs;
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS visitor_passes;
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS visitor_invite_links;
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS visitor_verification_channel_enum;
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS visitor_verification_action_enum;
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS visitor_pass_status_enum;
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS visitor_invite_status_enum;
    `);
  }
}
