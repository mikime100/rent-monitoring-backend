/**
 * Business logic security tests for a rent monitoring system.
 *
 * This suite attacks domain rules (not only auth primitives) using
 * role tokens that map to the current backend:
 * - tenant   -> staff
 * - landlord -> general_manager
 * - admin    -> owner
 */

const {
  authHeader,
  client,
  getAuthData,
  loginAs,
  loginWith,
  randomEmail,
  randomUuidLike,
} = require("./helpers/securityTestUtils");

jest.setTimeout(180000);

const endpoints = {
  payments: process.env.SEC_BL_PAYMENTS_ENDPOINT || "/payments",
  leases: process.env.SEC_BL_LEASES_ENDPOINT || "/tenants", // Lease-like resource mapping
  properties: process.env.SEC_BL_PROPERTIES_ENDPOINT || "/properties",
  tenants: process.env.SEC_BL_TENANTS_ENDPOINT || "/tenants",
  managers: process.env.SEC_BL_MANAGERS_ENDPOINT || "/users/managers",
};

function randomPhone() {
  const n = Math.floor(Math.random() * 900000000 + 100000000);
  return `+2547${n}`;
}

function isoDaysFromNow(days) {
  const dt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return dt.toISOString();
}

function asDateOnly(iso) {
  return String(iso).slice(0, 10);
}

describe("Business logic security", () => {
  let tenantToken;
  let landlordToken;
  let adminToken;

  let landlordTenantId;
  let landlordPropertyId;
  let foreignLeaseLikeTenantId;
  let foreignLandlordToken;
  let foreignManagerId;

  let activeLeasePropertyId;

  beforeAll(async () => {
    const [tenantLogin, landlordLogin, adminLogin] = await Promise.all([
      process.env.SEC_TENANT_JWT
        ? { accessToken: process.env.SEC_TENANT_JWT }
        : loginAs("staff1"),
      process.env.SEC_LANDLORD_JWT
        ? { accessToken: process.env.SEC_LANDLORD_JWT }
        : loginAs("generalManager"),
      process.env.SEC_ADMIN_JWT
        ? { accessToken: process.env.SEC_ADMIN_JWT }
        : loginAs("owner"),
    ]);

    tenantToken = tenantLogin.accessToken;
    landlordToken = landlordLogin.accessToken;
    adminToken = adminLogin.accessToken;

    if (!tenantToken || !landlordToken || !adminToken) {
      throw new Error(
        "Missing one or more auth tokens. Provide SEC_TENANT_JWT, SEC_LANDLORD_JWT, SEC_ADMIN_JWT or valid seeded credentials.",
      );
    }

    const landlordTenantsRes = await client
      .get(endpoints.tenants)
      .set(authHeader(landlordToken));

    if (landlordTenantsRes.status !== 200) {
      throw new Error(
        `Failed to load landlord tenants for setup (status=${landlordTenantsRes.status}).`,
      );
    }

    const landlordTenants = getAuthData(landlordTenantsRes) || [];
    const firstTenant = Array.isArray(landlordTenants) ? landlordTenants[0] : null;

    if (!firstTenant?.id || !firstTenant?.propertyId) {
      throw new Error("Setup requires at least one tenant for landlord token scope.");
    }

    landlordTenantId = firstTenant.id;
    landlordPropertyId = firstTenant.propertyId;

    // Create an additional manager + property + tenant to simulate cross-landlord access checks.
    const managerEmail = randomEmail("bl-manager");
    const managerPassword = "Manager@1234";

    const managerCreateRes = await client
      .post(endpoints.managers)
      .set(authHeader(adminToken))
      .send({
        email: managerEmail,
        password: managerPassword,
        phone: randomPhone(),
        firstName: "BL",
        lastName: "Manager",
      });

    if ([200, 201].includes(managerCreateRes.status)) {
      const managerData = getAuthData(managerCreateRes) || managerCreateRes.body;
      foreignManagerId = managerData?.id;

      const managerLoginRes = await loginWith(managerEmail, managerPassword);
      const foreignToken = getAuthData(managerLoginRes)?.tokens?.accessToken;
      if (managerLoginRes.status === 200 && foreignToken) {
        foreignLandlordToken = foreignToken;

        const foreignPropertyRes = await client
          .post(endpoints.properties)
          .set(authHeader(foreignLandlordToken))
          .send({
            name: `BL Foreign Property ${Date.now()}`,
            address: "100 Test Lane",
            city: "Nairobi",
            state: "Nairobi County",
            postalCode: "00100",
            country: "Kenya",
            description: "Business logic foreign scope fixture",
            numberOfUnits: 3,
          });

        if ([200, 201].includes(foreignPropertyRes.status)) {
          const foreignProperty =
            getAuthData(foreignPropertyRes) || foreignPropertyRes.body;

          const foreignTenantRes = await client
            .post(endpoints.tenants)
            .set(authHeader(foreignLandlordToken))
            .send({
              firstName: "Foreign",
              lastName: "Tenant",
              email: randomEmail("bl-foreign-tenant"),
              phone: randomPhone(),
              propertyId: foreignProperty.id,
              unitNumber: `U-${Date.now()}`,
              monthlyRent: 23000,
              rentDueDay: 5,
              contractStartDate: asDateOnly(isoDaysFromNow(-7)),
              contractEndDate: asDateOnly(isoDaysFromNow(365)),
              securityDeposit: 46000,
            });

          if ([200, 201].includes(foreignTenantRes.status)) {
            const foreignTenant = getAuthData(foreignTenantRes) || foreignTenantRes.body;
            foreignLeaseLikeTenantId = foreignTenant?.id;
          }
        }
      }
    }

    // Property with an active lease-like tenant for deletion conflict tests.
    const propertyWithLeaseRes = await client
      .post(endpoints.properties)
      .set(authHeader(landlordToken))
      .send({
        name: `BL Active Lease Property ${Date.now()}`,
        address: "200 Control Street",
        city: "Nairobi",
        state: "Nairobi County",
        postalCode: "00100",
        country: "Kenya",
        description: "Deletion constraint fixture",
        numberOfUnits: 2,
      });

    if ([200, 201].includes(propertyWithLeaseRes.status)) {
      const p = getAuthData(propertyWithLeaseRes) || propertyWithLeaseRes.body;
      activeLeasePropertyId = p?.id;

      if (activeLeasePropertyId) {
        await client
          .post(endpoints.tenants)
          .set(authHeader(landlordToken))
          .send({
            firstName: "Delete",
            lastName: "Guard",
            email: randomEmail("bl-active-lease"),
            phone: randomPhone(),
            propertyId: activeLeasePropertyId,
            unitNumber: `DL-${Date.now()}`,
            monthlyRent: 25000,
            rentDueDay: 5,
            contractStartDate: asDateOnly(isoDaysFromNow(-10)),
            contractEndDate: asDateOnly(isoDaysFromNow(365)),
            securityDeposit: 50000,
          });
      }
    }
  });

  afterAll(async () => {
    if (adminToken && foreignManagerId) {
      await client
        .patch(`${endpoints.managers}/${foreignManagerId}/deactivate`)
        .set(authHeader(adminToken));
    }
  });

  describe("Payment manipulation", () => {
    test("Tenant submits a backdated payment date (2 years ago) -> reject/flag", async () => {
      const res = await client
        .post(endpoints.payments)
        .set(authHeader(tenantToken))
        .send({
          tenantId: landlordTenantId,
          amount: 1000,
          paymentDate: isoDaysFromNow(-730),
          dueDate: isoDaysFromNow(-730),
          paymentMethod: "cash",
        });

      expect([400, 403, 422]).toContain(res.status);
    });

    test("Tenant cannot self-mark payment status as paid via PATCH", async () => {
      const res = await client
        .patch(`${endpoints.payments}/${randomUuidLike()}`)
        .set(authHeader(tenantToken))
        .send({ status: "paid" });

      expect([400, 403, 404]).toContain(res.status);
    });

    test.each([0, -1, 0.001])(
      "Tenant submits payment amount %p -> rejected",
      async (amount) => {
        const res = await client
          .post(endpoints.payments)
          .set(authHeader(tenantToken))
          .send({
            tenantId: landlordTenantId,
            amount,
            paymentDate: isoDaysFromNow(0),
            dueDate: isoDaysFromNow(0),
            paymentMethod: "cash",
          });

        expect([400, 403, 422]).toContain(res.status);
      },
    );

    test("Tenant submits payment for lease they are not party to -> 403", async () => {
      const targetLeaseTenantId = foreignLeaseLikeTenantId || randomUuidLike();

      const res = await client
        .post(endpoints.payments)
        .set(authHeader(tenantToken))
        .send({
          tenantId: targetLeaseTenantId,
          amount: 1000,
          paymentDate: isoDaysFromNow(0),
          dueDate: isoDaysFromNow(0),
          paymentMethod: "cash",
        });

      expect([403, 404]).toContain(res.status);
    });
  });

  describe("Lease tampering", () => {
    test("Tenant attempts to PATCH lease terms -> 403", async () => {
      const res = await client
        .patch(`${endpoints.leases}/${landlordTenantId}`)
        .set(authHeader(tenantToken))
        .send({
          monthlyRent: 999,
          contractEndDate: asDateOnly(isoDaysFromNow(900)),
        });

      expect([403, 404]).toContain(res.status);
    });

    test("Landlord attempts to PATCH lease belonging to another landlord -> 403", async () => {
      const foreignId = foreignLeaseLikeTenantId || randomUuidLike();

      const res = await client
        .patch(`${endpoints.leases}/${foreignId}`)
        .set(authHeader(landlordToken))
        .send({ monthlyRent: 7777 });

      expect([403, 404]).toContain(res.status);
    });

    test("Landlord sets lease end date in the past -> reject/flag", async () => {
      const res = await client
        .patch(`${endpoints.leases}/${landlordTenantId}`)
        .set(authHeader(landlordToken))
        .send({ contractEndDate: asDateOnly(isoDaysFromNow(-30)) });

      expect([400, 422]).toContain(res.status);
    });
  });

  describe("Ownership and property rules", () => {
    test("Tenant attempts to create a property -> 403", async () => {
      const res = await client
        .post(endpoints.properties)
        .set(authHeader(tenantToken))
        .send({
          name: `Tenant-Owned? ${Date.now()}`,
          address: "Nope Street",
          city: "Nairobi",
          state: "Nairobi County",
          postalCode: "00100",
          country: "Kenya",
          description: "Should not be allowed",
          numberOfUnits: 1,
        });

      expect(res.status).toBe(403);
    });

    test("Landlord cannot delete property with active lease-like tenant", async () => {
      if (!activeLeasePropertyId) {
        throw new Error("Setup did not create active lease property fixture.");
      }

      const res = await client
        .delete(`${endpoints.properties}/${activeLeasePropertyId}`)
        .set(authHeader(landlordToken));

      expect([400, 409, 422]).toContain(res.status);
    });

    test("Landlord list endpoint does not leak all-landlord tenant scope", async () => {
      const [landlordRes, adminRes] = await Promise.all([
        client.get(endpoints.tenants).set(authHeader(landlordToken)),
        client.get(endpoints.tenants).set(authHeader(adminToken)),
      ]);

      expect(landlordRes.status).toBe(200);
      expect(adminRes.status).toBe(200);

      const landlordTenants = getAuthData(landlordRes) || [];
      const adminTenants = getAuthData(adminRes) || [];

      expect(Array.isArray(landlordTenants)).toBe(true);
      expect(Array.isArray(adminTenants)).toBe(true);
      expect(landlordTenants.length).toBeLessThanOrEqual(adminTenants.length);

      if (foreignLeaseLikeTenantId) {
        const landlordIds = new Set(landlordTenants.map((t) => t.id));
        expect(landlordIds.has(foreignLeaseLikeTenantId)).toBe(false);
      }
    });
  });

  describe("Numeric and boundary abuse", () => {
    test("Astronomically large payment amount is rejected", async () => {
      const res = await client
        .post(endpoints.payments)
        .set(authHeader(landlordToken))
        .send({
          tenantId: landlordTenantId,
          amount: 999999999.99,
          paymentDate: isoDaysFromNow(0),
          dueDate: isoDaysFromNow(0),
          paymentMethod: "bank_transfer",
        });

      expect([400, 422]).toContain(res.status);
    });

    test("String amount (\"free\") is rejected", async () => {
      const res = await client
        .post(endpoints.payments)
        .set(authHeader(landlordToken))
        .send({
          tenantId: landlordTenantId,
          amount: "free",
          paymentDate: isoDaysFromNow(0),
          dueDate: isoDaysFromNow(0),
          paymentMethod: "cash",
        });

      expect([400, 422]).toContain(res.status);
    });

    test("Lease with start_date after end_date is rejected", async () => {
      const res = await client
        .post(endpoints.tenants)
        .set(authHeader(landlordToken))
        .send({
          firstName: "Date",
          lastName: "Reversal",
          email: randomEmail("bl-date-reversal"),
          phone: randomPhone(),
          propertyId: landlordPropertyId,
          unitNumber: `DR-${Date.now()}`,
          monthlyRent: 21000,
          rentDueDay: 5,
          contractStartDate: asDateOnly(isoDaysFromNow(30)),
          contractEndDate: asDateOnly(isoDaysFromNow(10)),
          securityDeposit: 42000,
        });

      expect([400, 422]).toContain(res.status);
    });
  });

  describe("Replay and duplicate attacks", () => {
    test("Duplicate payment submission inside 1 second should reject second request", async () => {
      const payload = {
        tenantId: landlordTenantId,
        amount: 14500,
        paymentDate: isoDaysFromNow(0),
        dueDate: isoDaysFromNow(0),
        paymentMethod: "mpesa",
        transactionReference: `BL-REPLAY-${Date.now()}`,
      };

      const [firstRes, secondRes] = await Promise.all([
        client.post(endpoints.payments).set(authHeader(landlordToken)).send(payload),
        client.post(endpoints.payments).set(authHeader(landlordToken)).send(payload),
      ]);

      const statuses = [firstRes.status, secondRes.status];
      const successCount = statuses.filter((s) => [200, 201].includes(s)).length;
      const blockedCount = statuses.filter((s) => [400, 409, 422].includes(s)).length;

      expect(successCount).toBe(1);
      expect(blockedCount).toBe(1);
    });
  });
});
