/**
 * Tenant Entity
 */

import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Property } from "./property.entity";
import { User } from "./user.entity";
import { Payment } from "./payment.entity";

export enum TenantStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  EVICTED = "evicted",
}

@Entity("tenants")
export class Tenant extends BaseEntity {
  @Column({ name: "first_name" })
  firstName: string;

  @Column({ name: "last_name" })
  lastName: string;

  @Column({ nullable: true })
  email?: string;

  @Column()
  phone: string;

  @Index()
  @Column({ name: "property_id" })
  propertyId: string;

  @ManyToOne(() => Property, (property) => property.tenants)
  @JoinColumn({ name: "property_id" })
  property: Property;

  @Column({ name: "unit_number" })
  unitNumber: string;

  @Column({ name: "monthly_rent", type: "decimal", precision: 10, scale: 2 })
  monthlyRent: number;

  @Column({ default: "USD" })
  currency: string;

  @Column({ name: "rent_due_day" })
  rentDueDay: number;

  @Column({ name: "contract_start_date", type: "date" })
  contractStartDate: Date;

  @Column({ name: "contract_end_date", type: "date", nullable: true })
  contractEndDate?: Date;

  @Column({
    name: "security_deposit",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  securityDeposit: number;

  @Column({
    type: "enum",
    enum: TenantStatus,
    default: TenantStatus.ACTIVE,
  })
  status: TenantStatus;

  @Column({ name: "assigned_staff_id", nullable: true })
  assignedStaffId?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "assigned_staff_id" })
  assignedStaff?: User;

  @Column({ name: "emergency_contact_name", nullable: true })
  emergencyContactName?: string;

  @Column({ name: "emergency_contact_phone", nullable: true })
  emergencyContactPhone?: string;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @OneToMany(() => Payment, (payment) => payment.tenant)
  payments: Payment[];

  // Virtual property
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
