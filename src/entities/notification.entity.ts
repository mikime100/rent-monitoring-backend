/**
 * Notification Entity
 */

import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

export enum NotificationType {
  PAYMENT_REMINDER = "payment_reminder",
  PAYMENT_OVERDUE = "payment_overdue",
  PAYMENT_RECEIVED = "payment_received",
  TENANT_REGISTERED = "tenant_registered",
  ADMIN_UPDATE = "admin_update",
  SYNC_COMPLETED = "sync_completed",
  SYNC_FAILED = "sync_failed",
  CONTRACT_EXPIRY = "contract_expiry",
  TAX_DUE = "tax_due",
  COMPLAINT_RESPONSE = "complaint_response",
  COMPLAINT_SUBMITTED = "complaint_submitted",
  COMPLAINT_GM_REPORT = "complaint_gm_report",
}

@Entity("notifications")
export class Notification extends BaseEntity {
  @Index()
  @Column({ name: "user_id" })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  title: string;

  @Column()
  message: string;

  @Column({ name: "body", nullable: true })
  body?: string;

  @Column({
    type: "enum",
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({ name: "is_read", default: false })
  isRead: boolean;

  @Column({ type: "jsonb", nullable: true })
  data?: Record<string, unknown>;

  @Column({ name: "related_entity_id", nullable: true })
  relatedEntityId?: string;

  @Column({ name: "related_entity_type", nullable: true })
  relatedEntityType?: string;

  @Column({ name: "scheduled_at", type: "timestamp", nullable: true })
  scheduledAt?: Date;

  @Column({ name: "sent_at", type: "timestamp", nullable: true })
  sentAt?: Date;

  @Column({ name: "read_at", type: "timestamp", nullable: true })
  readAt?: Date;
}
