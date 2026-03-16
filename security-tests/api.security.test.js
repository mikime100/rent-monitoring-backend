/**
 * API and network security tests.
 * Threats covered: insecure transport, missing headers, weak CORS policy,
 * object-level authorization (IDOR), JWT algorithm confusion, and URL secret leakage.
 */

const request = require("supertest");
const {
  authHeader,
  buildAlgNoneToken,
  client,
  config,
  getAuthData,
  loginAs,
  randomUuidLike,
} = require("./helpers/securityTestUtils");

jest.setTimeout(120000);

describe("API and network security", () => {
  let staff1Token;
  let staff2Token;
  let staff2ExclusiveTenantId;

  beforeAll(async () => {
    const staff1Login = await loginAs("staff1");
    staff1Token = staff1Login.accessToken;

    const staff2Login = await loginAs("staff2");
    staff2Token = staff2Login.accessToken;

    // Build a candidate foreign resource for IDOR tests.
    const [staff1TenantsRes, staff2TenantsRes] = await Promise.all([
      client.get(config.endpoints.tenants).set(authHeader(staff1Token)),
      client.get(config.endpoints.tenants).set(authHeader(staff2Token)),
    ]);

    const staff1Data = getAuthData(staff1TenantsRes) || [];
    const staff2Data = getAuthData(staff2TenantsRes) || [];

    if (Array.isArray(staff1Data) && Array.isArray(staff2Data)) {
      const staff1Ids = new Set(staff1Data.map((t) => t.id));
      const foreign = staff2Data.find((t) => t?.id && !staff1Ids.has(t.id));
      staff2ExclusiveTenantId = foreign?.id;
    }
  });

  test("Plain HTTP is rejected or redirected to HTTPS (except explicit local override)", async () => {
    const isHttpsBase = config.apiBaseUrl.startsWith("https://");

    if (!isHttpsBase && config.allowHttpForLocal) {
      expect(config.allowHttpForLocal).toBe(true);
      return;
    }

    const httpBase = config.apiBaseUrl.replace(/^https:/, "http:");
    const insecureClient = request(httpBase);
    const res = await insecureClient.get(config.endpoints.health);

    expect([301, 302, 307, 308, 400, 403, 426]).toContain(res.status);
  });

  test("Security headers are present on responses", async () => {
    const res = await client.get(config.endpoints.health);
    const isHttpsBase = config.apiBaseUrl.startsWith("https://");

    if (isHttpsBase) {
      expect(res.headers["strict-transport-security"]).toBeDefined();
    }
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  test("CORS preflight from unauthorized origin is rejected", async () => {
    const res = await client
      .options(config.auth.loginEndpoint)
      .set("Origin", config.unauthorizedOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,authorization");

    const allowOrigin = res.headers["access-control-allow-origin"];

    // Secure behavior: do not reflect unauthorized origin and do not use wildcard with credentials.
    expect(
      allowOrigin === config.unauthorizedOrigin || allowOrigin === "*",
    ).toBe(false);
  });

  test("IDOR attempts on another user's resource are blocked", async () => {
    const targetId = staff2ExclusiveTenantId || randomUuidLike();

    const [readRes, updateRes, deleteRes] = await Promise.all([
      client
        .get(`${config.endpoints.tenants}/${targetId}`)
        .set(authHeader(staff1Token)),
      client
        .patch(`${config.endpoints.tenants}/${targetId}`)
        .set(authHeader(staff1Token))
        .send({ firstName: "Unauthorized" }),
      client
        .delete(`${config.endpoints.tenants}/${targetId}`)
        .set(authHeader(staff1Token)),
    ]);

    expect([403, 404]).toContain(readRes.status);
    expect([403, 404]).toContain(updateRes.status);
    expect([403, 404]).toContain(deleteRes.status);
  });

  test("JWT algorithm confusion with alg:none token is rejected", async () => {
    const algNoneToken = buildAlgNoneToken({
      sub: "attacker",
      role: "owner",
      email: "attacker@example.com",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const res = await client
      .get(config.auth.profileEndpoint)
      .set(authHeader(algNoneToken));

    expect(res.status).toBe(401);
  });

  test("Sensitive values are not exposed in URL query handling", async () => {
    const secretValues = {
      token: "Bearer super-secret-token",
      password: "TopSecret!123",
    };

    const res = await client
      .get(config.endpoints.health)
      .query(secretValues)
      .set(authHeader(staff1Token));

    const responseText = JSON.stringify(res.body || {});
    expect(responseText.includes(secretValues.token)).toBe(false);
    expect(responseText.includes(secretValues.password)).toBe(false);

    const location = String(res.headers.location || "");
    expect(location.includes("token=")).toBe(false);
    expect(location.includes("password=")).toBe(false);
  });
});
