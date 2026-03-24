/**
 * Payment Entity
 */

import { Entity, Column, ManyToOne, JoinColumn, Index, DeleteDateColumn } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";
import { Property } from "./property.entity";
import { User } from "./user.entity";

export enum PaymentStatus {
  PENDING = "pending",
  PARTIAL = "partial",
  PAID = "paid",
  OVERDUE = "overdue",
}

@Entity("payments")
export class Payment extends BaseEntity {
  @Index()
  @Column({ name: "tenant_id" })
  tenantId: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.payments)
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @Index()
  @Column({ name: "property_id" })
  propertyId: string;

  @ManyToOne(() => Property)
  @JoinColumn({ name: "property_id" })
  property: Property;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: number;

  @Column({ default: "USD" })
  currency: string;

  @Column({ name: "payment_date", type: "timestamp" })
  paymentDate: Date;

  @Column({ name: "due_date", type: "date" })
  dueDate: Date;

  @Column({
    type: "enum",
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ name: "payment_method", nullable: true })
  paymentMethod?: string;

  @Column({ name: "transaction_reference", nullable: true })
  transactionReference?: string;

  @Column({ name: "receipt_number", nullable: true })
  receiptNumber?: string;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @Column({ name: "recorded_by_id" })
  recordedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "recorded_by_id" })
  recordedBy: User;

  @Index()
  @Column()
  month: number;

  @Index()
  @Column()
  year: number;

  @Column({ name: "is_partial_payment", default: false })
  isPartialPayment: boolean;

  @Column({
    name: "remaining_balance",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  remainingBalance: number;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deletedAt?: Date | null;
}
