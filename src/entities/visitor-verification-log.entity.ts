/**
 * Visitor Verification Log Entity
 */

import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { VisitorPass } from "./visitor-pass.entity";
import { User } from "./user.entity";

export enum VisitorVerificationAction {
  VERIFIED = "verified",
  DENIED = "denied",
}

export enum VisitorVerificationChannel {
  QR = "qr",
  MANUAL = "manual",
}

@Entity("visitor_verification_logs")
export class VisitorVerificationLog extends BaseEntity {
  @Index()
  @Column({ name: "visitor_pass_id" })
  visitorPassId: string;

  @ManyToOne(() => VisitorPass, (pass) => pass.verificationLogs)
  @JoinColumn({ name: "visitor_pass_id" })
  visitorPass: VisitorPass;

  @Column({ name: "guard_user_id", nullable: true })
  guardUserId?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "guard_user_id" })
  guardUser?: User | null;

  @Column({
    type: "enum",
    enum: VisitorVerificationAction,
  })
  action: VisitorVerificationAction;

  @Column({
    type: "enum",
    enum: VisitorVerificationChannel,
  })
  channel: VisitorVerificationChannel;

  @Column({ name: "notes", type: "text", nullable: true })
  notes?: string;

  @Column({ name: "metadata", type: "jsonb", nullable: true })
  metadata?: Record<string, unknown>;
}
