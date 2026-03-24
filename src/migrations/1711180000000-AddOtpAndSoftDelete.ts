/**
 * Migration: Add OTP reset columns to users table and soft-delete to payments
 *
 * Run with: npx ts-node -r tsconfig-paths/register src/migrations/1711180000000-AddOtpAndSoftDelete.ts
 *
 * This migration is SAFE to run multiple times (IF EXISTS / DO NOTHING).
 * It adds:
 *   - users.reset_otp          (varchar, nullable)
 *   - users.reset_otp_expires_at (timestamp, nullable)
 *   - payments.deleted_at      (timestamp, nullable) for soft-delete support
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOtpAndSoftDelete1711180000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add OTP columns to users table
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='reset_otp'
        ) THEN
          ALTER TABLE users ADD COLUMN reset_otp VARCHAR(255);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='reset_otp_expires_at'
        ) THEN
          ALTER TABLE users ADD COLUMN reset_otp_expires_at TIMESTAMP;
        END IF;
      END $$;
    `);

    // Add soft-delete column to payments table
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='payments' AND column_name='deleted_at'
        ) THEN
          ALTER TABLE payments ADD COLUMN deleted_at TIMESTAMP;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS reset_otp;
    `);
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS reset_otp_expires_at;
    `);
    await queryRunner.query(`
      ALTER TABLE payments DROP COLUMN IF EXISTS deleted_at;
    `);
  }
}
