/**
 * Authorization and access-control security tests.
 * Threats covered: role bypass, privilege escalation, cross-tenant deletion,
 * stale/deleted-resource disclosure, and missing rate limiting.
 */

const {
  authHeader,
  client,
  config,
  getAuthData,
  loginAs,
  randomUuidLike,
} = require("./helpers/securityTestUtils");

jest.setTimeout(120000);

describe("Authorization and access control", () => {
  let staff1Token;
  let staff2Token;
  let gmToken;
  let staff1UserId;
  let staff2ExclusiveTenantId;

  beforeAll(async () => {
    const [staff1Login, staff2Login, gmLogin] = await Promise.all([
      loginAs("staff1"),
      loginAs("staff2"),
      loginAs("generalManager"),
    ]);

    staff1Token = staff1Login.accessToken;
    staff2Token = staff2Login.accessToken;
    gmToken = gmLogin.accessToken;
    staff1UserId = staff1Login.user?.id;

    const [staff1TenantsRes, staff2TenantsRes] = await Promise.all([
      client.get(config.endpoints.tenants).set(authHeader(staff1Token)),
      client.get(config.endpoints.tenants).set(authHeader(staff2Token)),
    ]);

    const staff1Tenants = getAuthData(staff1TenantsRes) || [];
    const staff2Tenants = getAuthData(staff2TenantsRes) || [];

    if (Array.isArray(staff1Tenants) && Array.isArray(staff2Tenants)) {
      const ownIds = new Set(staff1Tenants.map((t) => t.id));
      const foreign = staff2Tenants.find((t) => t?.id && !ownIds.has(t.id));
      staff2ExclusiveTenantId = foreign?.id;
    }
  });

  test("Regular user cannot access admin-only endpoint", async () => {
    const res = await client
      .get(config.endpoints.usersManagers)
      .set(authHeader(staff1Token));

    expect(res.status).toBe(403);
  });

  test("Role escalation via PATCH payload is rejected or ignored", async () => {
    const targetStaffId = staff1UserId || randomUuidLike();

    const res = await client
      .patch(`${config.endpoints.usersStaff}/${targetStaffId}`)
      .set(authHeader(gmToken))
      .send({ role: "owner", firstName: "RoleEscalationAttempt" });

    expect([400, 403, 404, 200]).toContain(res.status);

    if (res.status === 200) {
      const data = getAuthData(res) || res.body;
      const updatedRole = data?.role || data?.user?.role;
      expect(["owner", "admin", "super_admin"]).not.toContain(updatedRole);
    }
  });

  test("Deleting another user's resource as non-owner returns 403/404", async () => {
    const targetTenantId = staff2ExclusiveTenantId || randomUuidLike();

    const res = await client
      .delete(`${config.endpoints.tenants}/${targetTenantId}`)
      .set(authHeader(staff1Token));

    expect([403, 404]).toContain(res.status);
  });

  test("Deleted/expired resource requests return 404 without data leakage", async () => {
    const missingId = randomUuidLike();

    const res = await client
      .get(`${config.endpoints.tenants}/${missingId}`)
      .set(authHeader(gmToken));

    expect(res.status).toBe(404);

    const bodyText = JSON.stringify(res.body || {}).toLowerCase();
    expect(bodyText.includes("password")).toBe(false);
    expect(bodyText.includes("refresh_token")).toBe(false);
  });

  test("Rate limiting blocks requests above configured threshold", async () => {
    const totalRequests = config.rateLimitPerMinute + 5;

    const responses = await Promise.all(
      Array.from({ length: totalRequests }).map(() =>
        client.get(config.endpoints.health).set(authHeader(staff1Token)),
      ),
    );

    const statuses = responses.map((r) => r.status);
    const has429 = statuses.includes(429);

    expect(has429).toBe(true);
  });
});
