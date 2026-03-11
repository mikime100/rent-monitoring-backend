/**
 * Complaint Entity
 * Staff can submit complaints, GM can respond, Owner can view
 */

import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Property } from "./property.entity";

export enum ComplaintStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  RESOLVED = "resolved",
}

@Entity("complaints")
export class Complaint extends BaseEntity {
  @Index()
  @Column({ name: "staff_id" })
  staffId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "staff_id" })
  staff: User;

  @Column({ name: "property_id", nullable: true })
  propertyId?: string;

  @ManyToOne(() => Property, { nullable: true })
  @JoinColumn({ name: "property_id" })
  property?: Property;

  @Column()
  title: string;

  @Column({ type: "text" })
  description: string;

  @Column({ nullable: true })
  category?: string;

  @Column({
    type: "enum",
    enum: ComplaintStatus,
    default: ComplaintStatus.OPEN,
  })
  status: ComplaintStatus;

  @Column({ type: "text", nullable: true })
  response?: string;

  @Column({ name: "responded_by_id", nullable: true })
  respondedById?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "responded_by_id" })
  respondedBy?: User;

  @Column({ name: "responded_at", nullable: true })
  respondedAt?: Date;
}
