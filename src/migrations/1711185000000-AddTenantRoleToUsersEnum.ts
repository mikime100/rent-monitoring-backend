import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantRoleToUsersEnum1711185000000 implements MigrationInterface {
  name = "AddTenantRoleToUsersEnum1711185000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'users_role_enum'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'users_role_enum' AND e.enumlabel = 'tenant'
        ) THEN
          ALTER TYPE users_role_enum ADD VALUE 'tenant';
        END IF;
      END
      $$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values safely in down migrations.
  }
}
