/**
 * Base Entity with common fields
 */

import {
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
} from "typeorm";
import { v4 as uuidv4 } from "uuid";

export enum SyncStatus {
  PENDING = "pending",
  SYNCED = "synced",
  FAILED = "failed",
}

export abstract class BaseEntity {
  @PrimaryColumn("uuid")
  id: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @Column({
    name: "sync_status",
    type: "enum",
    enum: SyncStatus,
    default: SyncStatus.SYNCED,
  })
  syncStatus: SyncStatus;

  @Column({ type: "int", default: 1 })
  version: number;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }

  @BeforeUpdate()
  incrementVersion() {
    this.version += 1;
  }
}
