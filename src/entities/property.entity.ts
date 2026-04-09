/**
 * Property Entity
 */

import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  JoinTable,
  Index,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Tenant } from "./tenant.entity";

export enum PropertyStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  MAINTENANCE = "maintenance",
}

@Entity("properties")
export class Property extends BaseEntity {
  @Column()
  name: string;

  @Column()
  address: string;

  @Column()
  city: string;

  @Column({ nullable: true })
  state?: string;

  @Column({ name: "postal_code", nullable: true })
  postalCode?: string;

  @Column()
  country: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ name: "number_of_units" })
  numberOfUnits: number;

  @Column({
    type: "enum",
    enum: PropertyStatus,
    default: PropertyStatus.ACTIVE,
  })
  status: PropertyStatus;

  @Index()
  @Column({ name: "manager_id" })
  managerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "manager_id" })
  manager: User;

  @Column({ name: "image_url", nullable: true })
  imageUrl?: string;

  @ManyToMany(() => User, (user) => user.assignedProperties)
  @JoinTable({
    name: "property_staff",
    joinColumn: { name: "property_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "staff_id", referencedColumnName: "id" },
  })
  assignedStaff: User[];

  @OneToMany(() => Tenant, (tenant) => tenant.property)
  tenants: Tenant[];
}
