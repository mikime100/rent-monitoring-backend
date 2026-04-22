/**
 * Reminder Dispatch Log Entity
 */

import { Entity, Column, JoinColumn, ManyToOne, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { TenantAccount } from "./tenant-account.entity";
import { Payment } from "./payment.entity";

export enum ReminderChannel {
  PUSH = "push",
  EMAIL = "email",
}

@Entity("reminder_dispatch_logs")
@Index("UQ_reminder_dispatch_logs_dedupe", ["dedupeKey"], { unique: true })
export class ReminderDispatchLog extends BaseEntity {
  @Index()
  @Column({ name: "tenant_account_id" })
  tenantAccountId: string;

  @ManyToOne(() => TenantAccount)
  @JoinColumn({ name: "tenant_account_id" })
  tenantAccount: TenantAccount;

  @Column({ name: "payment_id", nullable: true })
  paymentId?: string;

  @ManyToOne(() => Payment, { nullable: true })
  @JoinColumn({ name: "payment_id" })
  payment?: Payment;

  @Column({
    type: "enum",
    enum: ReminderChannel,
  })
  channel: ReminderChannel;

  @Column({ name: "reminder_type", length: 50 })
  reminderType: string;

  @Column({ name: "due_date", type: "date" })
  dueDate: Date;

  @Column({ name: "dedupe_key", length: 200 })
  dedupeKey: string;

  @Column({ name: "dispatched_at", type: "timestamp" })
  dispatchedAt: Date;
}
