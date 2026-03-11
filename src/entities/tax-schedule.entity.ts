/**
 * Tax Schedule Entity
 * Per-property tax payment schedule with notification tracking
 */

import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Property } from "./property.entity";

export enum TaxFrequency {
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
  ANNUALLY = "annually",
}

@Entity("tax_schedules")
export class TaxSchedule extends BaseEntity {
  @Index()
  @Column({ name: "property_id" })
  propertyId: string;

  @ManyToOne(() => Property)
  @JoinColumn({ name: "property_id" })
  property: Property;

  @Column({ name: "tax_label" })
  taxLabel: string;

  @Column({
    type: "enum",
    enum: TaxFrequency,
    default: TaxFrequency.MONTHLY,
  })
  frequency: TaxFrequency;

  @Column({ name: "due_day", type: "int" })
  dueDay: number;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  amount?: number;

  @Column({ type: "text", nullable: true })
  notes?: string;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @Column({ name: "next_due_date", type: "date" })
  nextDueDate: Date;

  @Column({ name: "last_notified_days", type: "int", nullable: true })
  lastNotifiedDays?: number;
}
