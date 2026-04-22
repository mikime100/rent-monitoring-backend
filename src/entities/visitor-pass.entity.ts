/**
 * Visitor Pass Entity
 */

import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { VisitorInviteLink } from "./visitor-invite-link.entity";
import { User } from "./user.entity";
import { VisitorVerificationLog } from "./visitor-verification-log.entity";

export enum VisitorPassStatus {
  PENDING = "pending",
  VERIFIED = "verified",
  EXPIRED = "expired",
  REVOKED = "revoked",
}

@Entity("visitor_passes")
export class VisitorPass extends BaseEntity {
  @Index()
  @Column({ name: "invite_link_id" })
  inviteLinkId: string;

  @ManyToOne(() => VisitorInviteLink, (link) => link.passes)
  @JoinColumn({ name: "invite_link_id" })
  inviteLink: VisitorInviteLink;

  @Column({ name: "visitor_name" })
  visitorName: string;

  @Column({ name: "visitor_phone", nullable: true })
  visitorPhone?: string;

  @Column({ name: "visitor_email", nullable: true })
  visitorEmail?: string;

  @Column({ name: "id_number", nullable: true })
  idNumber?: string;

  @Column({ name: "vehicle_plate", nullable: true })
  vehiclePlate?: string;

  @Column({ name: "photo_url", nullable: true })
  photoUrl?: string;

  @Column({ name: "verification_code_hash", type: "varchar", length: 255 })
  verificationCodeHash: string;

  @Column({ name: "verification_code_expires_at", type: "timestamp" })
  verificationCodeExpiresAt: Date;

  @Column({
    type: "enum",
    enum: VisitorPassStatus,
    default: VisitorPassStatus.PENDING,
  })
  status: VisitorPassStatus;

  @Column({ name: "used_at", type: "timestamp", nullable: true })
  usedAt?: Date | null;

  @Column({ name: "verified_by_id", nullable: true })
  verifiedById?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "verified_by_id" })
  verifiedBy?: User | null;

  @OneToMany(() => VisitorVerificationLog, (log) => log.visitorPass)
  verificationLogs: VisitorVerificationLog[];
}
