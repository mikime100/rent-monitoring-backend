/**
 * Tenant Account Entity
 */

import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Tenant } from "./tenant.entity";
import { Property } from "./property.entity";

@Entity("tenant_accounts")
@Index("UQ_tenant_accounts_user_id", ["userId"], { unique: true })
@Index("UQ_tenant_accounts_tenant_id", ["tenantId"], { unique: true })
@Index(
  "UQ_tenant_accounts_unit_active",
  ["propertyId", "unitNumberNormalized"],
  {
    unique: true,
    where: '"is_active" = true',
  },
)
export class TenantAccount extends BaseEntity {
  @Column({ name: "user_id" })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @Column({ name: "property_id" })
  propertyId: string;

  @ManyToOne(() => Property)
  @JoinColumn({ name: "property_id" })
  property: Property;

  @Column({ name: "unit_number" })
  unitNumber: string;

  @Column({ name: "unit_number_normalized" })
  unitNumberNormalized: string;

  @Column({ name: "is_active", default: true })
  isActive: boolean;
}
