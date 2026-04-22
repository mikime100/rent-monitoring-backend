/**
 * Permanent demo data seed script.
 *
 * This seeder is idempotent and non-destructive:
 * - It does NOT wipe existing tables.
 * - It creates or updates a stable set of realistic demo accounts and entities.
 * - It inserts missing payment history records using deterministic IDs.
 *
 * Run with: npm run seed
 */

import "reflect-metadata";
import { DataSource, QueryRunner } from "typeorm";
import * as bcrypt from "bcrypt";
import * as dotenv from "dotenv";
import { createHash } from "crypto";
import { v5 as uuidv5 } from "uuid";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

const AppDataSource = new DataSource({
  type: "postgres",
  url: databaseUrl || undefined,
  host: databaseUrl ? undefined : process.env.DB_HOST ?? "localhost",
  port: databaseUrl
    ? undefined
    : parseInt(process.env.DB_PORT ?? "5432", 10),
  username: databaseUrl ? undefined : process.env.DB_USERNAME ?? "postgres",
  password: databaseUrl ? undefined : process.env.DB_PASSWORD ?? "0000",
  database: databaseUrl ? undefined : process.env.DB_NAME ?? "rent_monitoring",
  synchronize: false,
  logging: false,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  entities: [__dirname + "/entities/**/*.entity{.ts,.js}"],
});

const DEMO_NAMESPACE = "79e10b77-7ec3-42b9-bd08-b22dc6a90a9f";
const HISTORY_MONTHS = 12;
const VISITOR_CODE_SALT_ROUNDS = 12;

const stableId = (...parts: string[]): string =>
  uuidv5(parts.join(":"), DEMO_NAMESPACE);

const pad2 = (value: number): string => String(value).padStart(2, "0");

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

const shiftMonth = (
  baseYear: number,
  baseMonth: number,
  monthsBack: number,
): { year: number; month: number } => {
  let month = baseMonth - monthsBack;
  let year = baseYear;

  while (month <= 0) {
    month += 12;
    year -= 1;
  }

  return { year, month };
};

const buildDueDate = (year: number, month: number, dueDay: number): Date => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const safeDay = Math.max(1, Math.min(dueDay, daysInMonth));
  return new Date(Date.UTC(year, month - 1, safeDay, 9, 0, 0, 0));
};

type UserRole = "owner" | "general_manager" | "staff" | "guard" | "tenant";

type UserSeed = {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: UserRole;
  phone: string;
  managerId?: string;
  emailVerifiedAt?: string | null;
};

type PropertySeed = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  description: string;
  numberOfUnits: number;
  managerId: string;
  imageUrl: string;
};

type TenantSeed = {
  key: string;
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  propertyId: string;
  unitNumber: string;
  monthlyRent: number;
  rentDueDay: number;
  assignedStaffId: string;
};

type PaymentSeed = {
  id: string;
  tenantId: string;
  propertyId: string;
  amount: number;
  currency: string;
  paymentDate: string;
  dueDate: string;
  status: "paid" | "partial" | "pending" | "overdue";
  paymentMethod: string | null;
  receiptNumber: string | null;
  month: number;
  year: number;
  isPartialPayment: boolean;
  remainingBalance: number;
  recordedById: string;
  createdAt: string;
  updatedAt: string;
};

type ComplaintSeed = {
  id: string;
  staffId: string;
  propertyId: string;
  title: string;
  description: string;
  category: string;
  status: "open" | "in_progress" | "resolved";
  response?: string;
  respondedById?: string;
  respondedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type NotificationSeed = {
  key: string;
  title: string;
  message: string;
  type:
    | "payment_received"
    | "payment_overdue"
    | "payment_reminder"
    | "tenant_registered"
    | "sync_completed"
    | "tax_due"
    | "complaint_response"
    | "contract_expiry";
  isRead: boolean;
  createdAt: string;
};

type TaxScheduleSeed = {
  id: string;
  propertyId: string;
  taxLabel: string;
  frequency: "monthly" | "quarterly" | "annually";
  dueDay: number;
  amount: number;
  notes: string;
  nextDueDate: string;
};

async function upsertUser(
  qr: QueryRunner,
  user: UserSeed,
  nowIso: string,
): Promise<string> {
  const passwordHash = await bcrypt.hash(user.password, 10);

  const rows = await qr.query(
    `INSERT INTO "users" (
      id,
      email,
      first_name,
      last_name,
      password,
      role,
      phone,
      is_active,
      manager_id,
      email_verified_at,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$10)
    ON CONFLICT (email)
    DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      password = EXCLUDED.password,
      role = EXCLUDED.role,
      phone = EXCLUDED.phone,
      is_active = EXCLUDED.is_active,
      manager_id = EXCLUDED.manager_id,
      email_verified_at = EXCLUDED.email_verified_at,
      updated_at = EXCLUDED.updated_at
    RETURNING id`,
    [
      stableId("user", user.key),
      user.email,
      user.firstName,
      user.lastName,
      passwordHash,
      user.role,
      user.phone,
      user.managerId ?? null,
      user.emailVerifiedAt ?? null,
      nowIso,
    ],
  );

  return rows[0]?.id;
}

async function upsertProperty(
  qr: QueryRunner,
  property: PropertySeed,
  nowIso: string,
): Promise<void> {
  await qr.query(
    `INSERT INTO "properties" (
      id,
      name,
      address,
      city,
      state,
      postal_code,
      country,
      description,
      number_of_units,
      status,
      manager_id,
      image_url,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,$12)
    ON CONFLICT (id)
    DO UPDATE SET
      name = EXCLUDED.name,
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      postal_code = EXCLUDED.postal_code,
      country = EXCLUDED.country,
      description = EXCLUDED.description,
      number_of_units = EXCLUDED.number_of_units,
      status = EXCLUDED.status,
      manager_id = EXCLUDED.manager_id,
      image_url = EXCLUDED.image_url,
      updated_at = EXCLUDED.updated_at`,
    [
      property.id,
      property.name,
      property.address,
      property.city,
      property.state,
      property.postalCode,
      property.country,
      property.description,
      property.numberOfUnits,
      property.managerId,
      property.imageUrl,
      nowIso,
    ],
  );
}

async function upsertTenant(
  qr: QueryRunner,
  tenant: TenantSeed,
  contractStartDate: string,
  contractEndDate: string,
  nowIso: string,
): Promise<void> {
  await qr.query(
    `INSERT INTO "tenants" (
      id,
      first_name,
      last_name,
      email,
      phone,
      property_id,
      unit_number,
      monthly_rent,
      currency,
      rent_due_day,
      contract_start_date,
      contract_end_date,
      security_deposit,
      status,
      assigned_staff_id,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'KES',$9,$10,$11,$12,'active',$13,$14,$14)
    ON CONFLICT (id)
    DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      property_id = EXCLUDED.property_id,
      unit_number = EXCLUDED.unit_number,
      monthly_rent = EXCLUDED.monthly_rent,
      currency = EXCLUDED.currency,
      rent_due_day = EXCLUDED.rent_due_day,
      contract_start_date = EXCLUDED.contract_start_date,
      contract_end_date = EXCLUDED.contract_end_date,
      security_deposit = EXCLUDED.security_deposit,
      status = EXCLUDED.status,
      assigned_staff_id = EXCLUDED.assigned_staff_id,
      updated_at = EXCLUDED.updated_at`,
    [
      tenant.id,
      tenant.firstName,
      tenant.lastName,
      tenant.email,
      tenant.phone,
      tenant.propertyId,
      tenant.unitNumber,
      tenant.monthlyRent,
      tenant.rentDueDay,
      contractStartDate,
      contractEndDate,
      tenant.monthlyRent * 2,
      tenant.assignedStaffId,
      nowIso,
    ],
  );
}

type TenantAccountSeed = {
  id: string;
  userId: string;
  tenantId: string;
  propertyId: string;
  unitNumber: string;
};

type TenantReminderPreferenceSeed = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  dueDayEnabled: boolean;
  beforeDueDays: number[];
  afterDueDays: number[];
};

const normalizeUnitNumber = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

async function upsertTenantAccount(
  qr: QueryRunner,
  account: TenantAccountSeed,
  nowIso: string,
): Promise<string> {
  const rows = await qr.query(
    `INSERT INTO "tenant_accounts" (
      id,
      user_id,
      tenant_id,
      property_id,
      unit_number,
      unit_number_normalized,
      is_active,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,true,$7,$7)
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      property_id = EXCLUDED.property_id,
      unit_number = EXCLUDED.unit_number,
      unit_number_normalized = EXCLUDED.unit_number_normalized,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at
    RETURNING id`,
    [
      account.id,
      account.userId,
      account.tenantId,
      account.propertyId,
      account.unitNumber,
      normalizeUnitNumber(account.unitNumber),
      nowIso,
    ],
  );

  return rows[0]?.id;
}

async function upsertTenantReminderPreference(
  qr: QueryRunner,
  preferenceId: string,
  tenantAccountId: string,
  preference: TenantReminderPreferenceSeed,
  nowIso: string,
): Promise<void> {
  await qr.query(
    `INSERT INTO "tenant_reminder_preferences" (
      id,
      tenant_account_id,
      push_enabled,
      email_enabled,
      due_day_enabled,
      before_due_days,
      after_due_days,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
    ON CONFLICT (tenant_account_id)
    DO UPDATE SET
      push_enabled = EXCLUDED.push_enabled,
      email_enabled = EXCLUDED.email_enabled,
      due_day_enabled = EXCLUDED.due_day_enabled,
      before_due_days = EXCLUDED.before_due_days,
      after_due_days = EXCLUDED.after_due_days,
      updated_at = EXCLUDED.updated_at`,
    [
      preferenceId,
      tenantAccountId,
      preference.pushEnabled,
      preference.emailEnabled,
      preference.dueDayEnabled,
      preference.beforeDueDays,
      preference.afterDueDays,
      nowIso,
    ],
  );
}

async function insertPaymentIfMissing(
  qr: QueryRunner,
  payment: PaymentSeed,
): Promise<boolean> {
  const rows = await qr.query(
    `INSERT INTO "payments" (
      id,
      tenant_id,
      property_id,
      amount,
      currency,
      payment_date,
      due_date,
      status,
      payment_method,
      receipt_number,
      month,
      year,
      is_partial_payment,
      remaining_balance,
      recorded_by_id,
      created_at,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id`,
    [
      payment.id,
      payment.tenantId,
      payment.propertyId,
      payment.amount,
      payment.currency,
      payment.paymentDate,
      payment.dueDate,
      payment.status,
      payment.paymentMethod,
      payment.receiptNumber,
      payment.month,
      payment.year,
      payment.isPartialPayment,
      payment.remainingBalance,
      payment.recordedById,
      payment.createdAt,
      payment.updatedAt,
    ],
  );

  return rows.length > 0;
}

async function upsertComplaint(
  qr: QueryRunner,
  complaint: ComplaintSeed,
): Promise<void> {
  await qr.query(
    `INSERT INTO "complaints" (
      id,
      staff_id,
      property_id,
      title,
      description,
      category,
      status,
      response,
      responded_by_id,
      responded_at,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id)
    DO UPDATE SET
      staff_id = EXCLUDED.staff_id,
      property_id = EXCLUDED.property_id,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      status = EXCLUDED.status,
      response = EXCLUDED.response,
      responded_by_id = EXCLUDED.responded_by_id,
      responded_at = EXCLUDED.responded_at,
      updated_at = EXCLUDED.updated_at`,
    [
      complaint.id,
      complaint.staffId,
      complaint.propertyId,
      complaint.title,
      complaint.description,
      complaint.category,
      complaint.status,
      complaint.response ?? null,
      complaint.respondedById ?? null,
      complaint.respondedAt ?? null,
      complaint.createdAt,
      complaint.updatedAt,
    ],
  );
}

async function insertNotificationIfMissing(
  qr: QueryRunner,
  id: string,
  userId: string,
  notification: NotificationSeed,
): Promise<boolean> {
  const rows = await qr.query(
    `INSERT INTO "notifications" (
      id,
      user_id,
      title,
      message,
      type,
      is_read,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
    ON CONFLICT (id) DO NOTHING
    RETURNING id`,
    [
      id,
      userId,
      notification.title,
      notification.message,
      notification.type,
      notification.isRead,
      notification.createdAt,
    ],
  );

  return rows.length > 0;
}

async function upsertTaxSchedule(
  qr: QueryRunner,
  schedule: TaxScheduleSeed,
  nowIso: string,
): Promise<void> {
  await qr.query(
    `INSERT INTO "tax_schedules" (
      id,
      property_id,
      tax_label,
      frequency,
      due_day,
      amount,
      notes,
      is_active,
      next_due_date,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$9)
    ON CONFLICT (id)
    DO UPDATE SET
      property_id = EXCLUDED.property_id,
      tax_label = EXCLUDED.tax_label,
      frequency = EXCLUDED.frequency,
      due_day = EXCLUDED.due_day,
      amount = EXCLUDED.amount,
      notes = EXCLUDED.notes,
      is_active = EXCLUDED.is_active,
      next_due_date = EXCLUDED.next_due_date,
      updated_at = EXCLUDED.updated_at`,
    [
      schedule.id,
      schedule.propertyId,
      schedule.taxLabel,
      schedule.frequency,
      schedule.dueDay,
      schedule.amount,
      schedule.notes,
      schedule.nextDueDate,
      nowIso,
    ],
  );
}

type VisitorInviteSeed = {
  id: string;
  tenantAccountId: string;
  propertyId: string;
  unitNumber: string;
  shareToken: string;
  expiresAt: string;
  status: "active" | "revoked" | "expired";
};

type VisitorPassSeed = {
  id: string;
  inviteLinkId: string;
  visitorName: string;
  visitorPhone?: string;
  visitorEmail?: string;
  idNumber?: string;
  vehiclePlate?: string;
  photoUrl?: string;
  verificationCode: string;
  verificationCodeExpiresAt: string;
  status: "pending" | "verified" | "expired" | "revoked";
  usedAt?: string | null;
  verifiedById?: string | null;
};

type VisitorVerificationLogSeed = {
  id: string;
  visitorPassId: string;
  guardUserId: string;
  action: "verified" | "denied";
  channel: "manual" | "qr";
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type ReminderDispatchSeed = {
  id: string;
  tenantAccountId: string;
  paymentId?: string;
  channel: "push" | "email";
  reminderType: string;
  dueDate: string;
  dedupeKey: string;
  dispatchedAt: string;
  createdAt: string;
  updatedAt: string;
};

const hashShareToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

async function upsertVisitorInviteLink(
  qr: QueryRunner,
  invite: VisitorInviteSeed,
  nowIso: string,
): Promise<void> {
  await qr.query(
    `INSERT INTO "visitor_invite_links" (
      id,
      tenant_account_id,
      property_id,
      unit_number,
      share_token_hash,
      expires_at,
      status,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
    ON CONFLICT (id)
    DO UPDATE SET
      tenant_account_id = EXCLUDED.tenant_account_id,
      property_id = EXCLUDED.property_id,
      unit_number = EXCLUDED.unit_number,
      share_token_hash = EXCLUDED.share_token_hash,
      expires_at = EXCLUDED.expires_at,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at`,
    [
      invite.id,
      invite.tenantAccountId,
      invite.propertyId,
      invite.unitNumber,
      hashShareToken(invite.shareToken),
      invite.expiresAt,
      invite.status,
      nowIso,
    ],
  );
}

async function upsertVisitorPass(
  qr: QueryRunner,
  pass: VisitorPassSeed,
  nowIso: string,
): Promise<void> {
  const verificationCodeHash = await bcrypt.hash(
    pass.verificationCode,
    VISITOR_CODE_SALT_ROUNDS,
  );

  await qr.query(
    `INSERT INTO "visitor_passes" (
      id,
      invite_link_id,
      visitor_name,
      visitor_phone,
      visitor_email,
      id_number,
      vehicle_plate,
      photo_url,
      verification_code_hash,
      verification_code_expires_at,
      status,
      used_at,
      verified_by_id,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
    ON CONFLICT (id)
    DO UPDATE SET
      invite_link_id = EXCLUDED.invite_link_id,
      visitor_name = EXCLUDED.visitor_name,
      visitor_phone = EXCLUDED.visitor_phone,
      visitor_email = EXCLUDED.visitor_email,
      id_number = EXCLUDED.id_number,
      vehicle_plate = EXCLUDED.vehicle_plate,
      photo_url = EXCLUDED.photo_url,
      verification_code_hash = EXCLUDED.verification_code_hash,
      verification_code_expires_at = EXCLUDED.verification_code_expires_at,
      status = EXCLUDED.status,
      used_at = EXCLUDED.used_at,
      verified_by_id = EXCLUDED.verified_by_id,
      updated_at = EXCLUDED.updated_at`,
    [
      pass.id,
      pass.inviteLinkId,
      pass.visitorName,
      pass.visitorPhone ?? null,
      pass.visitorEmail ?? null,
      pass.idNumber ?? null,
      pass.vehiclePlate ?? null,
      pass.photoUrl ?? null,
      verificationCodeHash,
      pass.verificationCodeExpiresAt,
      pass.status,
      pass.usedAt ?? null,
      pass.verifiedById ?? null,
      nowIso,
    ],
  );
}

async function upsertVisitorVerificationLog(
  qr: QueryRunner,
  log: VisitorVerificationLogSeed,
): Promise<void> {
  await qr.query(
    `INSERT INTO "visitor_verification_logs" (
      id,
      visitor_pass_id,
      guard_user_id,
      action,
      channel,
      notes,
      metadata,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (id)
    DO UPDATE SET
      visitor_pass_id = EXCLUDED.visitor_pass_id,
      guard_user_id = EXCLUDED.guard_user_id,
      action = EXCLUDED.action,
      channel = EXCLUDED.channel,
      notes = EXCLUDED.notes,
      metadata = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at`,
    [
      log.id,
      log.visitorPassId,
      log.guardUserId,
      log.action,
      log.channel,
      log.notes ?? null,
      log.metadata ? JSON.stringify(log.metadata) : null,
      log.createdAt,
      log.updatedAt,
    ],
  );
}

async function upsertReminderDispatchLog(
  qr: QueryRunner,
  log: ReminderDispatchSeed,
): Promise<void> {
  await qr.query(
    `INSERT INTO "reminder_dispatch_logs" (
      id,
      tenant_account_id,
      payment_id,
      channel,
      reminder_type,
      due_date,
      dedupe_key,
      dispatched_at,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (dedupe_key)
    DO UPDATE SET
      tenant_account_id = EXCLUDED.tenant_account_id,
      payment_id = EXCLUDED.payment_id,
      channel = EXCLUDED.channel,
      reminder_type = EXCLUDED.reminder_type,
      due_date = EXCLUDED.due_date,
      dispatched_at = EXCLUDED.dispatched_at,
      updated_at = EXCLUDED.updated_at`,
    [
      log.id,
      log.tenantAccountId,
      log.paymentId ?? null,
      log.channel,
      log.reminderType,
      log.dueDate,
      log.dedupeKey,
      log.dispatchedAt,
      log.createdAt,
      log.updatedAt,
    ],
  );
}

function nextMonthlyDueDate(now: Date, dueDay: number): string {
  const candidate = buildDueDate(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    dueDay,
  );
  if (candidate >= now) {
    return toIsoDate(candidate);
  }

  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return toIsoDate(
    buildDueDate(next.getUTCFullYear(), next.getUTCMonth() + 1, dueDay),
  );
}

function nextQuarterlyDueDate(now: Date): string {
  const quarter = Math.floor(now.getUTCMonth() / 3);
  const nextQuarterMonth = (quarter + 1) * 3;
  const year = now.getUTCFullYear() + (nextQuarterMonth >= 12 ? 1 : 0);
  const month = (nextQuarterMonth % 12) + 1;
  return toIsoDate(buildDueDate(year, month, 1));
}

function nextAnnualDueDate(now: Date, month: number, day: number): string {
  const currentYearDate = buildDueDate(now.getUTCFullYear(), month, day);
  if (currentYearDate >= now) {
    return toIsoDate(currentYearDate);
  }
  return toIsoDate(buildDueDate(now.getUTCFullYear() + 1, month, day));
}

async function seed() {
  console.log("\n[seed] Connecting to database...");

  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();

    console.log("[seed] Upserting users...");

    const ownerId = await upsertUser(
      qr,
      {
        key: "owner",
        email: "owner@rentapp.com",
        firstName: "System",
        lastName: "Owner",
        password: "Owner@1234",
        role: "owner",
        phone: "+254-700-000000",
      },
      nowIso,
    );

    const gmId = await upsertUser(
      qr,
      {
        key: "general-manager",
        email: "gm@rentapp.com",
        firstName: "General",
        lastName: "Manager",
        password: "Manager@1234",
        role: "general_manager",
        phone: "+254-700-000001",
      },
      nowIso,
    );

    const staffAliceId = await upsertUser(
      qr,
      {
        key: "staff-alice",
        email: "alice@rentapp.com",
        firstName: "Alice",
        lastName: "Johnson",
        password: "Staff@1234",
        role: "staff",
        phone: "+254-700-000002",
        managerId: gmId,
      },
      nowIso,
    );

    const staffBobId = await upsertUser(
      qr,
      {
        key: "staff-bob",
        email: "bob@rentapp.com",
        firstName: "Bob",
        lastName: "Smith",
        password: "Staff@1234",
        role: "staff",
        phone: "+254-700-000003",
        managerId: gmId,
      },
      nowIso,
    );

    const guardSamuelId = await upsertUser(
      qr,
      {
        key: "guard-samuel",
        email: "guard@rentapp.com",
        firstName: "Samuel",
        lastName: "Kariuki",
        password: "Guard@1234",
        role: "guard",
        phone: "+254-700-000004",
        managerId: gmId,
      },
      nowIso,
    );

    const properties: PropertySeed[] = [
      {
        id: stableId("property", "sunset-apartments"),
        name: "Sunset Apartments",
        address: "123 Sunset Blvd",
        city: "Nairobi",
        state: "Nairobi County",
        postalCode: "00100",
        country: "Kenya",
        description: "Modern apartments with city access and secure parking",
        numberOfUnits: 12,
        managerId: gmId,
        imageUrl:
          "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=80",
      },
      {
        id: stableId("property", "green-valley-complex"),
        name: "Green Valley Complex",
        address: "456 Valley Road",
        city: "Mombasa",
        state: "Coast County",
        postalCode: "80100",
        country: "Kenya",
        description: "Family-friendly complex in a quiet neighborhood",
        numberOfUnits: 8,
        managerId: gmId,
        imageUrl:
          "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=1200&q=80",
      },
    ];

    console.log("[seed] Upserting properties...");
    for (const property of properties) {
      await upsertProperty(qr, property, nowIso);
    }

    console.log("[seed] Ensuring property staff assignments...");
    const propertyStaffAssignments: Array<{
      propertyId: string;
      staffId: string;
    }> = [
      { propertyId: properties[0].id, staffId: staffAliceId },
      { propertyId: properties[0].id, staffId: staffBobId },
      { propertyId: properties[0].id, staffId: guardSamuelId },
      { propertyId: properties[1].id, staffId: staffBobId },
    ];

    for (const assignment of propertyStaffAssignments) {
      await qr.query(
        `INSERT INTO "property_staff" (property_id, staff_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [assignment.propertyId, assignment.staffId],
      );
    }

    const tenants: TenantSeed[] = [
      {
        key: "james-mwangi",
        id: stableId("tenant", "james-mwangi"),
        firstName: "James",
        lastName: "Mwangi",
        email: "james.mwangi@email.com",
        phone: "+254-700-100001",
        propertyId: properties[0].id,
        unitNumber: "A1",
        monthlyRent: 25000,
        rentDueDay: 5,
        assignedStaffId: staffAliceId,
      },
      {
        key: "grace-otieno",
        id: stableId("tenant", "grace-otieno"),
        firstName: "Grace",
        lastName: "Otieno",
        email: "grace.otieno@email.com",
        phone: "+254-700-100002",
        propertyId: properties[0].id,
        unitNumber: "A2",
        monthlyRent: 25000,
        rentDueDay: 5,
        assignedStaffId: staffAliceId,
      },
      {
        key: "peter-kamau",
        id: stableId("tenant", "peter-kamau"),
        firstName: "Peter",
        lastName: "Kamau",
        email: "peter.kamau@email.com",
        phone: "+254-700-100003",
        propertyId: properties[0].id,
        unitNumber: "B1",
        monthlyRent: 28000,
        rentDueDay: 5,
        assignedStaffId: staffBobId,
      },
      {
        key: "sarah-njeri",
        id: stableId("tenant", "sarah-njeri"),
        firstName: "Sarah",
        lastName: "Njeri",
        email: "sarah.njeri@email.com",
        phone: "+254-700-100004",
        propertyId: properties[0].id,
        unitNumber: "B2",
        monthlyRent: 28000,
        rentDueDay: 5,
        assignedStaffId: staffBobId,
      },
      {
        key: "david-ochieng",
        id: stableId("tenant", "david-ochieng"),
        firstName: "David",
        lastName: "Ochieng",
        email: "david.ochieng@email.com",
        phone: "+254-700-100005",
        propertyId: properties[0].id,
        unitNumber: "C1",
        monthlyRent: 30000,
        rentDueDay: 5,
        assignedStaffId: staffAliceId,
      },
      {
        key: "fatuma-ali",
        id: stableId("tenant", "fatuma-ali"),
        firstName: "Fatuma",
        lastName: "Ali",
        email: "fatuma.ali@email.com",
        phone: "+254-700-100006",
        propertyId: properties[1].id,
        unitNumber: "101",
        monthlyRent: 22000,
        rentDueDay: 5,
        assignedStaffId: staffBobId,
      },
      {
        key: "hassan-omar",
        id: stableId("tenant", "hassan-omar"),
        firstName: "Hassan",
        lastName: "Omar",
        email: "hassan.omar@email.com",
        phone: "+254-700-100007",
        propertyId: properties[1].id,
        unitNumber: "102",
        monthlyRent: 22000,
        rentDueDay: 5,
        assignedStaffId: staffBobId,
      },
      {
        key: "amina-said",
        id: stableId("tenant", "amina-said"),
        firstName: "Amina",
        lastName: "Said",
        email: "amina.said@email.com",
        phone: "+254-700-100008",
        propertyId: properties[1].id,
        unitNumber: "103",
        monthlyRent: 24000,
        rentDueDay: 5,
        assignedStaffId: staffBobId,
      },
    ];

    console.log("[seed] Upserting tenants...");
    const contractStartDate = `${currentYear - 1}-01-01`;
    const contractEndDate = `${currentYear + 2}-12-31`;

    for (const tenant of tenants) {
      await upsertTenant(
        qr,
        tenant,
        contractStartDate,
        contractEndDate,
        nowIso,
      );
    }

    console.log("[seed] Upserting tenant app accounts...");
    const tenantPassword = "Tenant@1234";
    const propertyNameById = new Map(
      properties.map((property) => [property.id, property.name]),
    );
    const tenantLoginRows: Array<{
      email: string;
      password: string;
      tenantName: string;
      unitNumber: string;
      propertyName: string;
    }> = [];
    const tenantAccountIdsByKey = new Map<string, string>();

    const defaultReminderPreference: TenantReminderPreferenceSeed = {
      pushEnabled: true,
      emailEnabled: true,
      dueDayEnabled: true,
      beforeDueDays: [7, 3, 1],
      afterDueDays: [3, 7],
    };

    const reminderPreferenceByTenantKey: Record<
      string,
      TenantReminderPreferenceSeed
    > = {
      "james-mwangi": {
        ...defaultReminderPreference,
        beforeDueDays: [10, 5, 2],
      },
      "grace-otieno": {
        ...defaultReminderPreference,
        emailEnabled: false,
      },
      "peter-kamau": {
        ...defaultReminderPreference,
        afterDueDays: [1, 4, 9],
      },
      "sarah-njeri": {
        ...defaultReminderPreference,
        dueDayEnabled: false,
      },
      "david-ochieng": {
        ...defaultReminderPreference,
        beforeDueDays: [7, 1],
        afterDueDays: [2, 5],
      },
      "fatuma-ali": {
        ...defaultReminderPreference,
        pushEnabled: false,
      },
      "hassan-omar": {
        ...defaultReminderPreference,
        beforeDueDays: [14, 7, 3],
      },
      "amina-said": {
        ...defaultReminderPreference,
        emailEnabled: false,
        beforeDueDays: [5, 1],
      },
    };

    for (const tenant of tenants) {
      const tenantUserId = await upsertUser(
        qr,
        {
          key: `tenant-user-${tenant.key}`,
          email: tenant.email,
          firstName: tenant.firstName,
          lastName: tenant.lastName,
          password: tenantPassword,
          role: "tenant",
          phone: tenant.phone,
          emailVerifiedAt: nowIso,
        },
        nowIso,
      );

      const tenantAccountId = await upsertTenantAccount(
        qr,
        {
          id: stableId("tenant-account", tenant.key),
          userId: tenantUserId,
          tenantId: tenant.id,
          propertyId: tenant.propertyId,
          unitNumber: tenant.unitNumber,
        },
        nowIso,
      );

      await upsertTenantReminderPreference(
        qr,
        stableId("tenant-reminder-preference", tenant.key),
        tenantAccountId,
        reminderPreferenceByTenantKey[tenant.key] ?? defaultReminderPreference,
        nowIso,
      );

      tenantAccountIdsByKey.set(tenant.key, tenantAccountId);

      tenantLoginRows.push({
        email: tenant.email,
        password: tenantPassword,
        tenantName: `${tenant.firstName} ${tenant.lastName}`,
        unitNumber: tenant.unitNumber,
        propertyName: propertyNameById.get(tenant.propertyId) || "Property",
      });
    }

    const getTenantAccountId = (tenantKey: string): string => {
      const id = tenantAccountIdsByKey.get(tenantKey);
      if (!id) {
        throw new Error(
          `[seed] Missing tenant account for visitor/reminder seed: ${tenantKey}`,
        );
      }
      return id;
    };

    console.log("[seed] Inserting realistic payment history...");

    const paymentMethods = ["cash", "bank_transfer", "mpesa", "cheque"];
    const paymentRecords: PaymentSeed[] = [];

    for (let tenantIndex = 0; tenantIndex < tenants.length; tenantIndex += 1) {
      const tenant = tenants[tenantIndex]!;

      for (let offset = HISTORY_MONTHS; offset >= 1; offset -= 1) {
        const { year, month } = shiftMonth(currentYear, currentMonth, offset);
        const dueDate = buildDueDate(year, month, tenant.rentDueDay);
        const paymentDate = new Date(dueDate);

        switch (tenantIndex % 4) {
          case 0:
            paymentDate.setUTCDate(paymentDate.getUTCDate() - 3);
            break;
          case 1:
            paymentDate.setUTCDate(paymentDate.getUTCDate());
            break;
          case 2:
            paymentDate.setUTCDate(paymentDate.getUTCDate() + 2);
            break;
          default:
            paymentDate.setUTCDate(paymentDate.getUTCDate() + 5);
            break;
        }

        paymentDate.setUTCHours(10, 30, 0, 0);

        paymentRecords.push({
          id: stableId(
            "payment",
            tenant.key,
            `${year}-${pad2(month)}`,
            "monthly",
          ),
          tenantId: tenant.id,
          propertyId: tenant.propertyId,
          amount: tenant.monthlyRent,
          currency: "KES",
          paymentDate: paymentDate.toISOString(),
          dueDate: toIsoDate(dueDate),
          status: "paid",
          paymentMethod:
            paymentMethods[(tenantIndex + offset) % paymentMethods.length] ??
            "cash",
          receiptNumber: `RCP-${year}${pad2(month)}-${tenant.unitNumber}`,
          month,
          year,
          isPartialPayment: false,
          remainingBalance: 0,
          recordedById: gmId,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }

    const currentMonthDueDate = buildDueDate(currentYear, currentMonth, 5);

    for (let tenantIndex = 0; tenantIndex < tenants.length; tenantIndex += 1) {
      const tenant = tenants[tenantIndex]!;
      const paymentId = stableId(
        "payment",
        tenant.key,
        `${currentYear}-${pad2(currentMonth)}`,
        "monthly",
      );

      if (tenantIndex <= 2) {
        const paidDate = new Date(currentMonthDueDate);
        paidDate.setUTCDate(
          Math.max(1, paidDate.getUTCDate() - (2 - tenantIndex)),
        );
        paidDate.setUTCHours(11, 15, 0, 0);

        paymentRecords.push({
          id: paymentId,
          tenantId: tenant.id,
          propertyId: tenant.propertyId,
          amount: tenant.monthlyRent,
          currency: "KES",
          paymentDate: paidDate.toISOString(),
          dueDate: toIsoDate(currentMonthDueDate),
          status: "paid",
          paymentMethod:
            paymentMethods[tenantIndex % paymentMethods.length] ?? "cash",
          receiptNumber: `RCP-${currentYear}${pad2(currentMonth)}-${tenant.unitNumber}`,
          month: currentMonth,
          year: currentYear,
          isPartialPayment: false,
          remainingBalance: 0,
          recordedById: gmId,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } else if (tenantIndex === 3) {
        const partialPaid = Math.round(tenant.monthlyRent * 0.65);
        const partialDate = new Date(currentMonthDueDate);
        partialDate.setUTCDate(partialDate.getUTCDate() + 2);
        partialDate.setUTCHours(14, 20, 0, 0);

        paymentRecords.push({
          id: paymentId,
          tenantId: tenant.id,
          propertyId: tenant.propertyId,
          amount: partialPaid,
          currency: "KES",
          paymentDate: partialDate.toISOString(),
          dueDate: toIsoDate(currentMonthDueDate),
          status: "partial",
          paymentMethod: "mpesa",
          receiptNumber: `RCP-${currentYear}${pad2(currentMonth)}-${tenant.unitNumber}`,
          month: currentMonth,
          year: currentYear,
          isPartialPayment: true,
          remainingBalance: tenant.monthlyRent - partialPaid,
          recordedById: gmId,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } else if (tenantIndex <= 5) {
        paymentRecords.push({
          id: paymentId,
          tenantId: tenant.id,
          propertyId: tenant.propertyId,
          amount: tenant.monthlyRent,
          currency: "KES",
          paymentDate: currentMonthDueDate.toISOString(),
          dueDate: toIsoDate(currentMonthDueDate),
          status: "pending",
          paymentMethod: null,
          receiptNumber: null,
          month: currentMonth,
          year: currentYear,
          isPartialPayment: false,
          remainingBalance: tenant.monthlyRent,
          recordedById: gmId,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } else {
        paymentRecords.push({
          id: paymentId,
          tenantId: tenant.id,
          propertyId: tenant.propertyId,
          amount: tenant.monthlyRent,
          currency: "KES",
          paymentDate: currentMonthDueDate.toISOString(),
          dueDate: toIsoDate(currentMonthDueDate),
          status: "overdue",
          paymentMethod: null,
          receiptNumber: null,
          month: currentMonth,
          year: currentYear,
          isPartialPayment: false,
          remainingBalance: tenant.monthlyRent,
          recordedById: gmId,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }

    const longOverdueDate = new Date(now);
    longOverdueDate.setUTCDate(longOverdueDate.getUTCDate() - 45);
    const longOverdueMonth = longOverdueDate.getUTCMonth() + 1;
    const longOverdueYear = longOverdueDate.getUTCFullYear();

    for (const tenant of [tenants[6], tenants[7]]) {
      const dueDate = buildDueDate(
        longOverdueYear,
        longOverdueMonth,
        tenant!.rentDueDay,
      );

      paymentRecords.push({
        id: stableId(
          "payment",
          tenant!.key,
          `${longOverdueYear}-${pad2(longOverdueMonth)}`,
          "legacy-overdue",
        ),
        tenantId: tenant!.id,
        propertyId: tenant!.propertyId,
        amount: tenant!.monthlyRent,
        currency: "KES",
        paymentDate: longOverdueDate.toISOString(),
        dueDate: toIsoDate(dueDate),
        status: "overdue",
        paymentMethod: null,
        receiptNumber: null,
        month: longOverdueMonth,
        year: longOverdueYear,
        isPartialPayment: false,
        remainingBalance: tenant!.monthlyRent,
        recordedById: gmId,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    let insertedPayments = 0;
    for (const payment of paymentRecords) {
      const inserted = await insertPaymentIfMissing(qr, payment);
      if (inserted) {
        insertedPayments += 1;
      }
    }

    console.log("[seed] Upserting complaints...");

    const complaints: ComplaintSeed[] = [
      {
        id: stableId("complaint", "broken-water-pipe"),
        staffId: staffAliceId,
        propertyId: properties[0].id,
        title: "Broken water pipe in Block A",
        description:
          "A leaking pipe in the Block A corridor has reduced water pressure in several units.",
        category: "plumbing",
        status: "open",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: stableId("complaint", "security-light"),
        staffId: staffBobId,
        propertyId: properties[1].id,
        title: "Security light not working",
        description:
          "The security light at the main gate has been off for three nights and needs urgent replacement.",
        category: "electrical",
        status: "resolved",
        response:
          "The light fitting was replaced and tested. Night visibility is now restored.",
        respondedById: gmId,
        respondedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: stableId("complaint", "elevator-noise"),
        staffId: staffAliceId,
        propertyId: properties[0].id,
        title: "Elevator maintenance required",
        description:
          "Elevator in Building 2 has intermittent vibration and unusual noise during peak hours.",
        category: "structural",
        status: "in_progress",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: stableId("complaint", "pest-control"),
        staffId: staffBobId,
        propertyId: properties[1].id,
        title: "Pest control needed",
        description:
          "Tenants in Units 101 and 103 reported repeated cockroach sightings in shared corridors.",
        category: "pest",
        status: "open",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    for (const complaint of complaints) {
      await upsertComplaint(qr, complaint);
    }

    console.log("[seed] Upserting visitor access data...");

    const visitorInviteSeeds: VisitorInviteSeed[] = [
      {
        id: stableId("visitor-invite", "james-main-link"),
        tenantAccountId: getTenantAccountId("james-mwangi"),
        propertyId: properties[0].id,
        unitNumber: "A1",
        shareToken: "seed-link-james-a1-2026",
        expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
        status: "active",
      },
      {
        id: stableId("visitor-invite", "grace-family-link"),
        tenantAccountId: getTenantAccountId("grace-otieno"),
        propertyId: properties[0].id,
        unitNumber: "A2",
        shareToken: "seed-link-grace-a2-2026",
        expiresAt: new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString(),
        status: "active",
      },
      {
        id: stableId("visitor-invite", "hassan-expired-link"),
        tenantAccountId: getTenantAccountId("hassan-omar"),
        propertyId: properties[1].id,
        unitNumber: "102",
        shareToken: "seed-link-hassan-102-old",
        expiresAt: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
        status: "expired",
      },
    ];

    for (const invite of visitorInviteSeeds) {
      await upsertVisitorInviteLink(qr, invite, nowIso);
    }

    const visitorPassSeeds: VisitorPassSeed[] = [
      {
        id: stableId("visitor-pass", "john-doe-james"),
        inviteLinkId: visitorInviteSeeds[0].id,
        visitorName: "John Doe",
        visitorPhone: "+254700555001",
        visitorEmail: "john.doe.guest@example.com",
        idNumber: "ID-230045",
        vehiclePlate: "KDA 234P",
        photoUrl:
          "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
        verificationCode: "246810",
        verificationCodeExpiresAt: new Date(
          now.getTime() + 18 * 60 * 60 * 1000,
        ).toISOString(),
        status: "verified",
        usedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        verifiedById: guardSamuelId,
      },
      {
        id: stableId("visitor-pass", "mary-grace"),
        inviteLinkId: visitorInviteSeeds[1].id,
        visitorName: "Mary Wanjiku",
        visitorPhone: "+254700555002",
        visitorEmail: "mary.wanjiku.guest@example.com",
        idNumber: "ID-991223",
        vehiclePlate: "KBX 901T",
        photoUrl:
          "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80",
        verificationCode: "135790",
        verificationCodeExpiresAt: new Date(
          now.getTime() + 20 * 60 * 60 * 1000,
        ).toISOString(),
        status: "pending",
      },
      {
        id: stableId("visitor-pass", "ali-hassan-old"),
        inviteLinkId: visitorInviteSeeds[2].id,
        visitorName: "Ali Hassan",
        visitorPhone: "+254700555003",
        visitorEmail: "ali.hassan.guest@example.com",
        idNumber: "ID-776510",
        vehiclePlate: "KCH 110M",
        verificationCode: "112233",
        verificationCodeExpiresAt: new Date(
          now.getTime() - 10 * 60 * 60 * 1000,
        ).toISOString(),
        status: "expired",
      },
    ];

    for (const pass of visitorPassSeeds) {
      await upsertVisitorPass(qr, pass, nowIso);
    }

    const visitorVerificationLogSeeds: VisitorVerificationLogSeed[] = [
      {
        id: stableId("visitor-log", "john-doe-verified"),
        visitorPassId: visitorPassSeeds[0].id,
        guardUserId: guardSamuelId,
        action: "verified",
        channel: "manual",
        notes: "ID matched and tenant confirmed via intercom.",
        metadata: {
          gate: "Main Gate",
          idChecked: true,
          verifier: "Samuel Kariuki",
        },
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        updatedAt: nowIso,
      },
      {
        id: stableId("visitor-log", "mary-first-denied"),
        visitorPassId: visitorPassSeeds[1].id,
        guardUserId: guardSamuelId,
        action: "denied",
        channel: "qr",
        notes: "Incorrect verification code entered once.",
        metadata: {
          gate: "Side Gate",
          attempt: 1,
        },
        createdAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
        updatedAt: nowIso,
      },
      {
        id: stableId("visitor-log", "ali-expired-denied"),
        visitorPassId: visitorPassSeeds[2].id,
        guardUserId: guardSamuelId,
        action: "denied",
        channel: "manual",
        notes: "Pass was expired at time of arrival.",
        metadata: {
          gate: "Main Gate",
          expired: true,
        },
        createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(),
        updatedAt: nowIso,
      },
    ];

    for (const log of visitorVerificationLogSeeds) {
      await upsertVisitorVerificationLog(qr, log);
    }

    console.log("[seed] Inserting notifications...");

    const hoursAgo = (hours: number): string =>
      new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

    const notificationTemplates: NotificationSeed[] = [
      {
        key: "payment-received-1",
        title: "Payment received",
        message: "James Mwangi paid KES 25,000 for Unit A1 via bank transfer.",
        type: "payment_received",
        isRead: false,
        createdAt: hoursAgo(1),
      },
      {
        key: "payment-received-2",
        title: "Payment received",
        message: "Grace Otieno paid KES 25,000 for Unit A2 via M-Pesa.",
        type: "payment_received",
        isRead: false,
        createdAt: hoursAgo(2),
      },
      {
        key: "overdue-alert-1",
        title: "Overdue alert",
        message: "Hassan Omar (Unit 102) is overdue on this month's rent.",
        type: "payment_overdue",
        isRead: false,
        createdAt: hoursAgo(4),
      },
      {
        key: "tenant-registered",
        title: "Tenant registered",
        message: "Amina Said was added to Unit 103 at Green Valley Complex.",
        type: "tenant_registered",
        isRead: true,
        createdAt: hoursAgo(24),
      },
      {
        key: "payment-reminder",
        title: "Payment reminder",
        message:
          "Rent is due on the 5th for David Ochieng (Unit C1). Amount: KES 30,000.",
        type: "payment_reminder",
        isRead: true,
        createdAt: hoursAgo(48),
      },
      {
        key: "contract-expiry",
        title: "Contract expiring soon",
        message: "Peter Kamau's lease for Unit B1 expires in 60 days.",
        type: "contract_expiry",
        isRead: true,
        createdAt: hoursAgo(72),
      },
      {
        key: "sync-completed",
        title: "Sync completed",
        message: "All data has been synchronized successfully.",
        type: "sync_completed",
        isRead: true,
        createdAt: hoursAgo(96),
      },
      {
        key: "tax-due",
        title: "Tax due soon",
        message: "Municipal tax for Sunset Apartments is due in 5 days.",
        type: "tax_due",
        isRead: false,
        createdAt: hoursAgo(6),
      },
      {
        key: "complaint-response",
        title: "Complaint response",
        message:
          "Your complaint 'Security light not working' has been resolved.",
        type: "complaint_response",
        isRead: false,
        createdAt: hoursAgo(3),
      },
    ];

    const notificationUsers = [ownerId, gmId, staffAliceId, staffBobId];
    let insertedNotifications = 0;

    for (const userId of notificationUsers) {
      for (const template of notificationTemplates) {
        const inserted = await insertNotificationIfMissing(
          qr,
          stableId("notification", userId, template.key),
          userId,
          template,
        );

        if (inserted) {
          insertedNotifications += 1;
        }
      }
    }

    console.log("[seed] Upserting tax schedules...");

    const taxSchedules: TaxScheduleSeed[] = [
      {
        id: stableId("tax", "sunset-municipal"),
        propertyId: properties[0].id,
        taxLabel: "Municipal Tax",
        frequency: "monthly",
        dueDay: 15,
        amount: 5000,
        notes: "Monthly municipal tax payment for Sunset Apartments",
        nextDueDate: nextMonthlyDueDate(now, 15),
      },
      {
        id: stableId("tax", "sunset-property-annual"),
        propertyId: properties[0].id,
        taxLabel: "Property Tax",
        frequency: "annually",
        dueDay: 30,
        amount: 120000,
        notes: "Annual property tax for Sunset Apartments",
        nextDueDate: nextAnnualDueDate(now, 6, 30),
      },
      {
        id: stableId("tax", "green-valley-vat"),
        propertyId: properties[1].id,
        taxLabel: "VAT",
        frequency: "quarterly",
        dueDay: 1,
        amount: 18000,
        notes: "Quarterly VAT for Green Valley Complex",
        nextDueDate: nextQuarterlyDueDate(now),
      },
    ];

    for (const schedule of taxSchedules) {
      await upsertTaxSchedule(qr, schedule, nowIso);
    }

    console.log("[seed] Upserting reminder dispatch history...");

    const previousPeriod = shiftMonth(currentYear, currentMonth, 1);
    const previousDueDate = buildDueDate(
      previousPeriod.year,
      previousPeriod.month,
      5,
    );
    const previousDueDateIso = toIsoDate(previousDueDate);

    const olderPeriod = shiftMonth(currentYear, currentMonth, 2);
    const olderDueDate = buildDueDate(olderPeriod.year, olderPeriod.month, 5);
    const olderDueDateIso = toIsoDate(olderDueDate);

    const beforeDueDispatch = new Date(previousDueDate);
    beforeDueDispatch.setUTCDate(beforeDueDispatch.getUTCDate() - 3);
    beforeDueDispatch.setUTCHours(8, 15, 0, 0);

    const dueDayDispatch = new Date(previousDueDate);
    dueDayDispatch.setUTCHours(9, 30, 0, 0);

    const overdueDispatch = new Date(olderDueDate);
    overdueDispatch.setUTCDate(overdueDispatch.getUTCDate() + 7);
    overdueDispatch.setUTCHours(10, 5, 0, 0);

    const reminderDispatchSeeds: ReminderDispatchSeed[] = [
      {
        id: stableId("reminder-log", "james", "before_due_3", "push"),
        tenantAccountId: getTenantAccountId("james-mwangi"),
        paymentId: stableId(
          "payment",
          "james-mwangi",
          `${previousPeriod.year}-${pad2(previousPeriod.month)}`,
          "monthly",
        ),
        channel: "push",
        reminderType: "before_due_3",
        dueDate: previousDueDateIso,
        dedupeKey: `${getTenantAccountId("james-mwangi")}:${previousDueDateIso}:before_due_3:push`,
        dispatchedAt: beforeDueDispatch.toISOString(),
        createdAt: beforeDueDispatch.toISOString(),
        updatedAt: nowIso,
      },
      {
        id: stableId("reminder-log", "james", "before_due_3", "email"),
        tenantAccountId: getTenantAccountId("james-mwangi"),
        paymentId: stableId(
          "payment",
          "james-mwangi",
          `${previousPeriod.year}-${pad2(previousPeriod.month)}`,
          "monthly",
        ),
        channel: "email",
        reminderType: "before_due_3",
        dueDate: previousDueDateIso,
        dedupeKey: `${getTenantAccountId("james-mwangi")}:${previousDueDateIso}:before_due_3:email`,
        dispatchedAt: beforeDueDispatch.toISOString(),
        createdAt: beforeDueDispatch.toISOString(),
        updatedAt: nowIso,
      },
      {
        id: stableId("reminder-log", "sarah", "due_day", "push"),
        tenantAccountId: getTenantAccountId("sarah-njeri"),
        paymentId: stableId(
          "payment",
          "sarah-njeri",
          `${previousPeriod.year}-${pad2(previousPeriod.month)}`,
          "monthly",
        ),
        channel: "push",
        reminderType: "due_day",
        dueDate: previousDueDateIso,
        dedupeKey: `${getTenantAccountId("sarah-njeri")}:${previousDueDateIso}:due_day:push`,
        dispatchedAt: dueDayDispatch.toISOString(),
        createdAt: dueDayDispatch.toISOString(),
        updatedAt: nowIso,
      },
      {
        id: stableId("reminder-log", "hassan", "overdue_7", "push"),
        tenantAccountId: getTenantAccountId("hassan-omar"),
        paymentId: stableId(
          "payment",
          "hassan-omar",
          `${olderPeriod.year}-${pad2(olderPeriod.month)}`,
          "monthly",
        ),
        channel: "push",
        reminderType: "overdue_7",
        dueDate: olderDueDateIso,
        dedupeKey: `${getTenantAccountId("hassan-omar")}:${olderDueDateIso}:overdue_7:push`,
        dispatchedAt: overdueDispatch.toISOString(),
        createdAt: overdueDispatch.toISOString(),
        updatedAt: nowIso,
      },
    ];

    for (const reminderLog of reminderDispatchSeeds) {
      await upsertReminderDispatchLog(qr, reminderLog);
    }

    await qr.commitTransaction();

    const paymentCountRows = await AppDataSource.query(
      `SELECT COUNT(*)::int AS count FROM "payments" WHERE recorded_by_id = $1`,
      [gmId],
    );

    console.log("\n[seed] Demo data seeded successfully.");
    console.log("-------------------------------------------");
    console.log("Logins");
    console.log("  owner@rentapp.com / Owner@1234");
    console.log("  gm@rentapp.com / Manager@1234");
    console.log("  alice@rentapp.com / Staff@1234");
    console.log("  bob@rentapp.com / Staff@1234");
    console.log("  guard@rentapp.com / Guard@1234");
    console.log("  Tenant accounts (all use password Tenant@1234):");
    for (const tenantLogin of tenantLoginRows) {
      console.log(
        `    ${tenantLogin.email} (${tenantLogin.tenantName}, Unit ${tenantLogin.unitNumber} - ${tenantLogin.propertyName})`,
      );
    }
    console.log("  Visitor demo credentials:");
    console.log(
      `    Invite token (James, Unit A1): ${visitorInviteSeeds[0].shareToken}`,
    );
    console.log(
      `    Invite token (Grace, Unit A2): ${visitorInviteSeeds[1].shareToken}`,
    );
    console.log(
      `    Pending visitor verification code (Mary Wanjiku): ${visitorPassSeeds[1].verificationCode}`,
    );
    console.log(
      `    Verified sample code (John Doe): ${visitorPassSeeds[0].verificationCode}`,
    );
    console.log("-------------------------------------------");
    console.log(`History months inserted target: ${HISTORY_MONTHS}`);
    console.log(`Payments inserted this run: ${insertedPayments}`);
    console.log(`Notifications inserted this run: ${insertedNotifications}`);
    console.log(`Visitor invite links seeded: ${visitorInviteSeeds.length}`);
    console.log(`Visitor passes seeded: ${visitorPassSeeds.length}`);
    console.log(
      `Visitor verification logs seeded: ${visitorVerificationLogSeeds.length}`,
    );
    console.log(`Reminder dispatch logs seeded: ${reminderDispatchSeeds.length}`);
    console.log(
      `Total payments recorded by GM in DB: ${paymentCountRows[0]?.count ?? 0}`,
    );
  } catch (error) {
    await qr.rollbackTransaction();
    console.error("[seed] Seed failed. Transaction rolled back.");
    console.error(error);
    process.exit(1);
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

seed();
