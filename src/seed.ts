/**
 * Database Seed Script
 * Run with: npx ts-node src/seed.ts
 */

import "reflect-metadata";
import { DataSource } from "typeorm";
import * as bcrypt from "bcrypt";
import * as dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: parseInt(process.env.DB_PORT ?? "5432"),
  username: process.env.DB_USERNAME ?? "postgres",
  password: process.env.DB_PASSWORD ?? "0000",
  database: process.env.DB_NAME ?? "rent_monitoring",
  synchronize: false,
  logging: false,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  entities: [__dirname + "/entities/**/*.entity{.ts,.js}"],
});

async function seed() {
  console.log("\nðŸŒ±  Connecting to database...");
  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    console.log("ðŸ§¹  Clearing existing data...");
    await qr.query(`DELETE FROM "tax_schedules"`).catch(() => {});
    await qr.query(`DELETE FROM "notifications"`);
    await qr.query(`DELETE FROM "complaints"`).catch(() => {}); // table may not exist yet
    await qr.query(`DELETE FROM "payments"`);
    await qr.query(`DELETE FROM "tenants"`);
    await qr.query(`DELETE FROM "property_staff"`);
    await qr.query(`DELETE FROM "properties"`);
    await qr.query(`DELETE FROM "users"`);

    const now = new Date();
    const nowISO = now.toISOString();
    const curMonth = now.getMonth() + 1; // 1-based
    const curYear = now.getFullYear();

    // Helper: get previous month/year
    const prevMonth = (m: number, y: number, n: number) => {
      let month = m - n;
      let year = y;
      while (month <= 0) {
        month += 12;
        year--;
      }
      return { month, year };
    };

    // â”€â”€ USERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log("ðŸ‘¤  Seeding users...");
    const ownerId = uuidv4();
    const gmId = uuidv4();
    const staff1Id = uuidv4();
    const staff2Id = uuidv4();

    const ownerHash = await bcrypt.hash("Owner@1234", 10);
    const gmHash = await bcrypt.hash("Manager@1234", 10);
    const staffHash = await bcrypt.hash("Staff@1234", 10);

    await qr.query(
      `INSERT INTO "users" (id, email, first_name, last_name, password, role, phone, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'owner',$6,true,$7,$7)`,
      [
        ownerId,
        "owner@rentapp.com",
        "System",
        "Owner",
        ownerHash,
        "+254-700-000000",
        nowISO,
      ],
    );
    await qr.query(
      `INSERT INTO "users" (id, email, first_name, last_name, password, role, phone, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'general_manager',$6,true,$7,$7)`,
      [
        gmId,
        "gm@rentapp.com",
        "General",
        "Manager",
        gmHash,
        "+254-700-000001",
        nowISO,
      ],
    );
    await qr.query(
      `INSERT INTO "users" (id, email, first_name, last_name, password, role, phone, is_active, manager_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'staff',$6,true,$7,$8,$8)`,
      [
        staff1Id,
        "alice@rentapp.com",
        "Alice",
        "Johnson",
        staffHash,
        "+254-700-000002",
        gmId,
        nowISO,
      ],
    );
    await qr.query(
      `INSERT INTO "users" (id, email, first_name, last_name, password, role, phone, is_active, manager_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'staff',$6,true,$7,$8,$8)`,
      [
        staff2Id,
        "bob@rentapp.com",
        "Bob",
        "Smith",
        staffHash,
        "+254-700-000003",
        gmId,
        nowISO,
      ],
    );

    // â”€â”€ PROPERTIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log("ðŸ   Seeding properties...");
    const prop1Id = uuidv4();
    const prop2Id = uuidv4();

    await qr.query(
      `INSERT INTO "properties" (id, name, address, city, state, postal_code, country, description, number_of_units, status, manager_id, image_url, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,$12)`,
      [
        prop1Id,
        "Sunset Apartments",
        "123 Sunset Blvd",
        "Nairobi",
        "Nairobi County",
        "00100",
        "Kenya",
        "Modern apartments with great city views",
        12,
        gmId,
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80",
        nowISO,
      ],
    );
    await qr.query(
      `INSERT INTO "properties" (id, name, address, city, state, postal_code, country, description, number_of_units, status, manager_id, image_url, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,$12)`,
      [
        prop2Id,
        "Green Valley Complex",
        "456 Valley Road",
        "Mombasa",
        "Coast Province",
        "80100",
        "Kenya",
        "Spacious units in a quiet neighborhood",
        8,
        gmId,
        "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=800&q=80",
        nowISO,
      ],
    );

    // Assign staff
    await qr.query(
      `INSERT INTO "property_staff" (property_id, staff_id) VALUES ($1,$2),($1,$3),($4,$3)`,
      [prop1Id, staff1Id, staff2Id, prop2Id],
    );

    // â”€â”€ TENANTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log("ðŸ§‘â€ðŸ¤â€ðŸ§‘  Seeding tenants...");
    const tenants = [
      {
        id: uuidv4(),
        fn: "James",
        ln: "Mwangi",
        email: "james.mwangi@email.com",
        phone: "+254-700-100001",
        unit: "A1",
        rent: 25000,
        property: prop1Id,
        worker: staff1Id,
      },
      {
        id: uuidv4(),
        fn: "Grace",
        ln: "Otieno",
        email: "grace.otieno@email.com",
        phone: "+254-700-100002",
        unit: "A2",
        rent: 25000,
        property: prop1Id,
        worker: staff1Id,
      },
      {
        id: uuidv4(),
        fn: "Peter",
        ln: "Kamau",
        email: "peter.kamau@email.com",
        phone: "+254-700-100003",
        unit: "B1",
        rent: 28000,
        property: prop1Id,
        worker: staff2Id,
      },
      {
        id: uuidv4(),
        fn: "Sarah",
        ln: "Njeri",
        email: "sarah.njeri@email.com",
        phone: "+254-700-100004",
        unit: "B2",
        rent: 28000,
        property: prop1Id,
        worker: staff2Id,
      },
      {
        id: uuidv4(),
        fn: "David",
        ln: "Ochieng",
        email: "david.ochieng@email.com",
        phone: "+254-700-100005",
        unit: "C1",
        rent: 30000,
        property: prop1Id,
        worker: staff1Id,
      },
      {
        id: uuidv4(),
        fn: "Fatuma",
        ln: "Ali",
        email: "fatuma.ali@email.com",
        phone: "+254-700-100006",
        unit: "101",
        rent: 22000,
        property: prop2Id,
        worker: staff2Id,
      },
      {
        id: uuidv4(),
        fn: "Hassan",
        ln: "Omar",
        email: "hassan.omar@email.com",
        phone: "+254-700-100007",
        unit: "102",
        rent: 22000,
        property: prop2Id,
        worker: staff2Id,
      },
      {
        id: uuidv4(),
        fn: "Amina",
        ln: "Said",
        email: "amina.said@email.com",
        phone: "+254-700-100008",
        unit: "103",
        rent: 24000,
        property: prop2Id,
        worker: staff2Id,
      },
    ];

    const startDate = `${curYear - 1}-01-01`;
    const endDate = `${curYear + 1}-12-31`;

    for (const t of tenants) {
      await qr.query(
        `INSERT INTO "tenants" (id, first_name, last_name, email, phone, property_id, unit_number, monthly_rent, currency, rent_due_day, contract_start_date, contract_end_date, security_deposit, status, assigned_staff_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'KES',5,$9,$10,$11,'active',$12,$13,$13)`,
        [
          t.id,
          t.fn,
          t.ln,
          t.email,
          t.phone,
          t.property,
          t.unit,
          t.rent,
          startDate,
          endDate,
          t.rent * 2,
          t.worker,
          nowISO,
        ],
      );
    }

    // â”€â”€ PAYMENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log("ðŸ’³  Seeding payments...");
    const methods = ["cash", "bank_transfer", "mpesa", "cheque"];
    let recNum = 1000;

    // Past 4 months â€” all PAID
    const pm1 = prevMonth(curMonth, curYear, 4);
    const pm2 = prevMonth(curMonth, curYear, 3);
    const pm3 = prevMonth(curMonth, curYear, 2);
    const pm4 = prevMonth(curMonth, curYear, 1);
    const paidMonths = [pm1, pm2, pm3, pm4];

    for (let i = 0; i < tenants.length; i++) {
      const t = tenants[i]!;
      for (let mIdx = 0; mIdx < paidMonths.length; mIdx++) {
        const pm = paidMonths[mIdx]!;
        const payId = uuidv4();

        // Due date is always the 5th
        const dueDate = `${pm.year}-${String(pm.month).padStart(2, "0")}-05`;

        let payDate;
        if (i % 3 === 0) {
          // Early payer: pays on the 2nd
          payDate = `${pm.year}-${String(pm.month).padStart(2, "0")}-02T10:30:00.000Z`;
        } else if (i % 3 === 1) {
          // On-time payer: pays on the 4th/5th
          payDate = `${pm.year}-${String(pm.month).padStart(2, "0")}-04T14:15:00.000Z`;
        } else {
          // Late/delayed payer: pays on the 10th (after the 5th)
          payDate = `${pm.year}-${String(pm.month).padStart(2, "0")}-10T09:00:00.000Z`;
        }

        const method = methods[recNum % methods.length];
        await qr.query(
          `INSERT INTO "payments" (id, tenant_id, property_id, amount, currency, payment_date, due_date, status, payment_method, receipt_number, month, year, is_partial_payment, remaining_balance, recorded_by_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'KES',$5,$6,'paid',$7,$8,$9,$10,false,0,$11,$12,$12)`,
          [
            payId,
            t.id,
            t.property,
            t.rent,
            payDate,
            dueDate,
            method,
            `RCP-${recNum++}`,
            pm.month,
            pm.year,
            gmId,
            nowISO,
          ],
        );
      }
    }

    // Current month â€” mixed statuses
    // First 4 tenants: PAID (early payers)
    // Next 2 tenants: PENDING (due soon â€” not yet paid)
    // Last 2 tenants: OVERDUE (past due date, not paid)
    const curDueDate = `${curYear}-${String(curMonth).padStart(2, "0")}-05`;

    for (let i = 0; i < tenants.length; i++) {
      const t = tenants[i]!;
      const payId = uuidv4();

      if (i < 4) {
        // Paid â€” paid a few days ago
        const paidDay = Math.max(1, now.getDate() - (4 - i));
        const payDate = new Date(curYear, curMonth - 1, paidDay, 10, 30);
        const method = methods[recNum % methods.length];
        await qr.query(
          `INSERT INTO "payments" (id, tenant_id, property_id, amount, currency, payment_date, due_date, status, payment_method, receipt_number, month, year, is_partial_payment, remaining_balance, recorded_by_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'KES',$5,$6,'paid',$7,$8,$9,$10,false,0,$11,$12,$12)`,
          [
            payId,
            t.id,
            t.property,
            t.rent,
            payDate.toISOString(),
            curDueDate,
            method,
            `RCP-${recNum++}`,
            curMonth,
            curYear,
            gmId,
            nowISO,
          ],
        );
      } else if (i < 6) {
        // Pending â€” due soon, not yet paid
        await qr.query(
          `INSERT INTO "payments" (id, tenant_id, property_id, amount, currency, payment_date, due_date, status, month, year, is_partial_payment, remaining_balance, recorded_by_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'KES',$5,$6,'pending',$7,$8,false,$9,$10,$11,$11)`,
          [
            payId,
            t.id,
            t.property,
            t.rent,
            curDueDate,
            curDueDate,
            curMonth,
            curYear,
            t.rent,
            gmId,
            nowISO,
          ],
        );
      } else {
        // Overdue â€” past due date, still unpaid
        await qr.query(
          `INSERT INTO "payments" (id, tenant_id, property_id, amount, currency, payment_date, due_date, status, month, year, is_partial_payment, remaining_balance, recorded_by_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'KES',$5,$6,'overdue',$7,$8,false,$9,$10,$11,$11)`,
          [
            payId,
            t.id,
            t.property,
            t.rent,
            nowISO,
            curDueDate,
            curMonth,
            curYear,
            t.rent,
            gmId,
            nowISO,
          ],
        );
      }
    }

    // â”€â”€ NOTIFICATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log("ðŸ””  Seeding notifications...");

    const hoursAgo = (h: number) =>
      new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();

    const notifications = [
      {
        title: "Payment received",
        message: `${tenants[0]!.fn} ${tenants[0]!.ln} paid KES ${tenants[0]!.rent.toLocaleString()} for Unit ${tenants[0]!.unit} via Bank Transfer.`,
        type: "payment_received",
        isRead: false,
        createdAt: hoursAgo(0.5),
      },
      {
        title: "Payment received",
        message: `${tenants[1]!.fn} ${tenants[1]!.ln} paid KES ${tenants[1]!.rent.toLocaleString()} for Unit ${tenants[1]!.unit} via M-Pesa.`,
        type: "payment_received",
        isRead: false,
        createdAt: hoursAgo(2),
      },
      {
        title: "Overdue alert",
        message: `${tenants[6]!.fn} ${tenants[6]!.ln} (Unit ${tenants[6]!.unit}) is overdue on rent payment for this month.`,
        type: "payment_overdue",
        isRead: false,
        createdAt: hoursAgo(4),
      },
      {
        title: "Overdue alert",
        message: `${tenants[7]!.fn} ${tenants[7]!.ln} (Unit ${tenants[7]!.unit}) is overdue on rent payment for this month.`,
        type: "payment_overdue",
        isRead: false,
        createdAt: hoursAgo(5),
      },
      {
        title: "Tenant registered",
        message: `${tenants[7]!.fn} ${tenants[7]!.ln} has been added to Unit ${tenants[7]!.unit} at Green Valley Complex.`,
        type: "tenant_registered",
        isRead: true,
        createdAt: hoursAgo(24),
      },
      {
        title: "Payment reminder",
        message: `Rent is due on the 5th for ${tenants[4]!.fn} ${tenants[4]!.ln} (Unit ${tenants[4]!.unit}). Amount: KES ${tenants[4]!.rent.toLocaleString()}.`,
        type: "payment_reminder",
        isRead: true,
        createdAt: hoursAgo(48),
      },
      {
        title: "Contract expiring soon",
        message: `${tenants[2]!.fn} ${tenants[2]!.ln}'s lease for Unit ${tenants[2]!.unit} expires in 60 days.`,
        type: "contract_expiry",
        isRead: true,
        createdAt: hoursAgo(72),
      },
      {
        title: "Sync completed",
        message: "All data has been successfully synchronized with the server.",
        type: "sync_completed",
        isRead: true,
        createdAt: hoursAgo(96),
      },
      {
        title: "Tax payment due soon",
        message:
          "Municipal tax for Sunset Apartments is due in 5 days. Amount: BIRR 15,000.",
        type: "tax_due",
        isRead: false,
        createdAt: hoursAgo(6),
      },
      {
        title: "Tax payment reminder",
        message:
          "Quarterly VAT for Green Valley Complex is due in 3 days. Amount: BIRR 22,500.",
        type: "tax_due",
        isRead: false,
        createdAt: hoursAgo(12),
      },
    ];

    // Seed sample complaints
    console.log("Seeding complaints...");
    const complaint1Id = uuidv4();
    const complaint2Id = uuidv4();
    const complaint3Id = uuidv4();
    const complaint4Id = uuidv4();
    await qr.query(
      `INSERT INTO "complaints" (id, staff_id, property_id, title, description, category, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$7)`,
      [
        complaint1Id,
        staff1Id,
        prop1Id,
        "Broken water pipe in Block A",
        "There is a leaking pipe in the ground floor corridor of Block A that needs urgent repair.",
        "plumbing",
        nowISO,
      ],
    );
    await qr.query(
      `INSERT INTO "complaints" (id, staff_id, property_id, title, description, category, status, response, responded_by_id, responded_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'resolved',$7,$8,$9,$10,$10)`,
      [
        complaint2Id,
        staff2Id,
        prop2Id,
        "Security light not working",
        "The security light at the main gate of Green Valley Complex has been off for 3 days.",
        "electrical",
        "Electrician has been dispatched and the light has been fixed.",
        gmId,
        nowISO,
        nowISO,
      ],
    );
    await qr.query(
      `INSERT INTO "complaints" (id, staff_id, property_id, title, description, category, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'in_progress',$7,$7)`,
      [
        complaint3Id,
        staff1Id,
        prop1Id,
        "Elevator maintenance required",
        "The elevator in building 2 is making unusual noises and needs professional inspection.",
        "structural",
        nowISO,
      ],
    );
    await qr.query(
      `INSERT INTO "complaints" (id, staff_id, property_id, title, description, category, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$7)`,
      [
        complaint4Id,
        staff2Id,
        prop2Id,
        "Pest control needed",
        "Multiple tenants have reported seeing cockroaches in the common areas of the building.",
        "pest",
        nowISO,
      ],
    );

    for (const n of notifications) {
      // Send to GM
      await qr.query(
        `INSERT INTO "notifications" (id, user_id, title, message, type, is_read, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
        [uuidv4(), gmId, n.title, n.message, n.type, n.isRead, n.createdAt],
      );
      // Also send to Owner (so owner sees notifications too)
      await qr.query(
        `INSERT INTO "notifications" (id, user_id, title, message, type, is_read, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
        [uuidv4(), ownerId, n.title, n.message, n.type, n.isRead, n.createdAt],
      );
    }

    // ── TAX SCHEDULES ────────────────────────────────────────────────────
    console.log("🏛️  Seeding tax schedules...");

    // Calculate next due dates
    const nextMonthlyDue = new Date(
      curYear,
      curMonth - 1 + (now.getDate() > 15 ? 1 : 0),
      15,
    );
    if (nextMonthlyDue <= now)
      nextMonthlyDue.setMonth(nextMonthlyDue.getMonth() + 1);
    const nextQuarterlyDue = new Date(curYear, Math.ceil(curMonth / 3) * 3, 1);
    if (nextQuarterlyDue <= now)
      nextQuarterlyDue.setMonth(nextQuarterlyDue.getMonth() + 3);
    const nextAnnualDue = new Date(curYear, 5, 30); // June 30th
    if (nextAnnualDue <= now)
      nextAnnualDue.setFullYear(nextAnnualDue.getFullYear() + 1);

    const taxSchedules = [
      {
        id: uuidv4(),
        propertyId: prop1Id,
        taxLabel: "Municipal Tax",
        frequency: "monthly",
        dueDay: 15,
        amount: 5000,
        notes: "Monthly municipal tax payment for Sunset Apartments",
        nextDueDate: nextMonthlyDue.toISOString().split("T")[0],
      },
      {
        id: uuidv4(),
        propertyId: prop1Id,
        taxLabel: "Property Tax",
        frequency: "annually",
        dueDay: 30,
        amount: 120000,
        notes: "Annual property tax for Sunset Apartments, due June 30th",
        nextDueDate: nextAnnualDue.toISOString().split("T")[0],
      },
      {
        id: uuidv4(),
        propertyId: prop2Id,
        taxLabel: "VAT",
        frequency: "quarterly",
        dueDay: 1,
        amount: 18000,
        notes: "Quarterly VAT for Green Valley Complex",
        nextDueDate: nextQuarterlyDue.toISOString().split("T")[0],
      },
    ];

    for (const ts of taxSchedules) {
      await qr.query(
        `INSERT INTO "tax_schedules" (id, property_id, tax_label, frequency, due_day, amount, notes, is_active, next_due_date, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$9)`,
        [
          ts.id,
          ts.propertyId,
          ts.taxLabel,
          ts.frequency,
          ts.dueDay,
          ts.amount,
          ts.notes,
          ts.nextDueDate,
          nowISO,
        ],
      );
    }

    // Add a tax-due notification for the GM
    await qr.query(
      `INSERT INTO "notifications" (id, user_id, title, message, type, is_read, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'tax_due',false,$5,$5)`,
      [
        uuidv4(),
        gmId,
        "⚠️ Tax Due in 5 days",
        `Municipal Tax for Sunset Apartments is due on the 15th of this month.`,
        hoursAgo(6),
      ],
    );

    await qr.commitTransaction();
    console.log("\nDatabase seeded successfully!\n");
    console.log("===========================================");
    console.log("  LOGIN CREDENTIALS");
    console.log("===========================================");
    console.log("  OWNER");
    console.log("    Email   : owner@rentapp.com");
    console.log("    Password: Owner@1234");
    console.log("    Role    : owner");
    console.log("-------------------------------------------");
    console.log("  GENERAL MANAGER");
    console.log("    Email   : gm@rentapp.com");
    console.log("    Password: Manager@1234");
    console.log("    Role    : general_manager");
    console.log("-------------------------------------------");
    console.log("  STAFF 1");
    console.log("    Email   : alice@rentapp.com");
    console.log("    Password: Staff@1234");
    console.log("-------------------------------------------");
    console.log("  STAFF 2");
    console.log("    Email   : bob@rentapp.com");
    console.log("    Password: Staff@1234");
    console.log("===========================================");
    console.log("\n  Data Summary:");
    console.log("    4 users (1 owner, 1 general manager, 2 staff)");
    console.log("    2 properties (20 total units)");
    console.log("    8 tenants (active)");
    console.log(
      `    ${paidMonths.length * tenants.length + tenants.length} payments (${paidMonths.length} months paid + current month mixed)`,
    );
    console.log(`    ${notifications.length + 1} notifications`);
    console.log(
      "    4 complaints (2 per property: plumbing, electrical, structural, pest)",
    );
    console.log(
      `    ${taxSchedules.length} tax schedules (monthly, quarterly, annually)`,
    );
    console.log(`\n  Current month: ${curMonth}/${curYear}`);
    console.log(`    Paid: 4 | Pending: 2 | Overdue: 2\n`);
  } catch (err) {
    await qr.rollbackTransaction();
    console.error("Seed failed, rolled back:", err);
    process.exit(1);
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

seed();
