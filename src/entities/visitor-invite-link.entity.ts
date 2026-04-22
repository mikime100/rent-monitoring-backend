/**
 * Visitor Invite Link Entity
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
import { TenantAccount } from "./tenant-account.entity";
import { Property } from "./property.entity";
import { VisitorPass } from "./visitor-pass.entity";

export enum VisitorInviteStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
  EXPIRED = "expired",
}

@Entity("visitor_invite_links")
export class VisitorInviteLink extends BaseEntity {
  @Index()
  @Column({ name: "tenant_account_id" })
  tenantAccountId: string;

  @ManyToOne(() => TenantAccount)
  @JoinColumn({ name: "tenant_account_id" })
  tenantAccount: TenantAccount;

  @Index()
  @Column({ name: "property_id" })
  propertyId: string;

  @ManyToOne(() => Property)
  @JoinColumn({ name: "property_id" })
  property: Property;

  @Column({ name: "unit_number" })
  unitNumber: string;

  @Index()
  @Column({ name: "share_token_hash", type: "varchar", length: 255 })
  shareTokenHash: string;

  @Column({ name: "expires_at", type: "timestamp" })
  expiresAt: Date;

  @Column({
    type: "enum",
    enum: VisitorInviteStatus,
    default: VisitorInviteStatus.ACTIVE,
  })
  status: VisitorInviteStatus;

  @OneToMany(() => VisitorPass, (pass) => pass.inviteLink)
  passes: VisitorPass[];
}
