/**
 * Tenant Reminder Preference Entity
 */

import { Entity, Column, JoinColumn, ManyToOne, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { TenantAccount } from "./tenant-account.entity";

@Entity("tenant_reminder_preferences")
@Index("UQ_tenant_reminder_preferences_tenant_account", ["tenantAccountId"], {
  unique: true,
})
export class TenantReminderPreference extends BaseEntity {
  @Column({ name: "tenant_account_id" })
  tenantAccountId: string;

  @ManyToOne(() => TenantAccount)
  @JoinColumn({ name: "tenant_account_id" })
  tenantAccount: TenantAccount;

  @Column({ name: "push_enabled", default: true })
  pushEnabled: boolean;

  @Column({ name: "email_enabled", default: true })
  emailEnabled: boolean;

  @Column({ name: "due_day_enabled", default: true })
  dueDayEnabled: boolean;

  @Column({
    name: "before_due_days",
    type: "int",
    array: true,
    default: () => "'{7,3,1}'",
  })
  beforeDueDays: number[];

  @Column({
    name: "after_due_days",
    type: "int",
    array: true,
    default: () => "'{3,7}'",
  })
  afterDueDays: number[];
}
