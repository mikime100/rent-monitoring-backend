/**
 * Audit Log Entity
 */

import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

@Entity("audit_logs")
export class AuditLog extends BaseEntity {
  @Index()
  @Column({ name: "user_id" })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  action: string;

  @Index()
  @Column({ name: "table_name" })
  tableName: string;

  @Column({ name: "record_id" })
  recordId: string;

  @Column({ name: "old_data", type: "jsonb", nullable: true })
  oldData?: Record<string, unknown>;

  @Column({ name: "new_data", type: "jsonb", nullable: true })
  newData?: Record<string, unknown>;

  @Column({ name: "ip_address", nullable: true })
  ipAddress?: string;

  @Column({ name: "user_agent", nullable: true })
  userAgent?: string;
}
