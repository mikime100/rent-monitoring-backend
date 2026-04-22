/**
 * User Entity
 */

import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { Exclude } from "class-transformer";
import { BaseEntity } from "./base.entity";
import { Property } from "./property.entity";

export enum UserRole {
  OWNER = "owner",
  GENERAL_MANAGER = "general_manager",
  STAFF = "staff",
  GUARD = "guard",
  TENANT = "tenant",
}

@Entity("users")
export class User extends BaseEntity {
  @Index()
  @Column({ unique: true })
  email: string;

  @Column({ name: "first_name" })
  firstName: string;

  @Column({ name: "last_name" })
  lastName: string;

  @Exclude()
  @Column()
  password: string;

  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.STAFF,
  })
  role: UserRole;

  @Column({ nullable: true })
  phone?: string;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @Column({ name: "manager_id", nullable: true })
  managerId?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "manager_id" })
  manager?: User;

  @OneToMany(() => User, (user) => user.manager)
  staff?: User[];

  @ManyToMany(() => Property, (property) => property.assignedStaff)
  assignedProperties?: Property[];

  @Column({ name: "fcm_token", nullable: true })
  fcmToken?: string;

  @Column({ name: "refresh_token", type: "text", nullable: true })
  @Exclude()
  refreshToken?: string | null;

  @Column({ name: "reset_otp", type: "varchar", length: 255, nullable: true })
  @Exclude()
  resetOtp?: string | null;

  @Column({ name: "reset_otp_expires_at", type: "timestamp", nullable: true })
  @Exclude()
  resetOtpExpiresAt?: Date | null;

  @Column({ name: "email_verified_at", type: "timestamp", nullable: true })
  emailVerifiedAt?: Date | null;

  @Column({
    name: "email_verification_otp",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  @Exclude()
  emailVerificationOtp?: string | null;

  @Column({
    name: "email_verification_otp_expires_at",
    type: "timestamp",
    nullable: true,
  })
  @Exclude()
  emailVerificationOtpExpiresAt?: Date | null;

  @Column({
    name: "email_verification_sent_at",
    type: "timestamp",
    nullable: true,
  })
  @Exclude()
  emailVerificationSentAt?: Date | null;

  @Column({ name: "last_login_at", nullable: true })
  lastLoginAt?: Date;

  // Virtual property
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
