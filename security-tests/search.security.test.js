/**
 * Search endpoint security tests.
 * Threats covered: unauthorized discovery, injection-style query abuse,
 * IDOR via query manipulation, and sensitive field exposure.
 */

const {
  authHeader,
  client,
  collectPotentialSensitiveFields,
  config,
  getAuthData,
  loginAs,
  longString,
} = require("./helpers/securityTestUtils");

jest.setTimeout(120000);

describe("Search endpoint security", () => {
  let staffToken;
  let ownerToken;
  let ownerUserId;

  beforeAll(async () => {
    const staffLogin = await loginAs("staff1");
    staffToken = staffLogin.accessToken;

    const ownerLogin = await loginAs("owner");
    ownerToken = ownerLogin.accessToken;
    ownerUserId = ownerLogin.user?.id;
  });

  test("Authenticated search returns only data user is authorized to see", async () => {
    const staffRes = await client
      .get(config.endpoints.search)
      .query({ q: "a" })
      .set(authHeader(staffToken));

    const ownerRes = await client
      .get(config.endpoints.search)
      .query({ q: "a" })
      .set(authHeader(ownerToken));

    expect([403, 404]).toContain(staffRes.status);
    expect(ownerRes.status).toBe(200);

    const staffData = getAuthData(staffRes) || staffRes.body;
    const ownerData = getAuthData(ownerRes) || ownerRes.body;

    if (Array.isArray(staffData) && Array.isArray(ownerData)) {
      expect(staffData.length).toBeLessThanOrEqual(ownerData.length);
    }
  });

  test("Special characters in search query do not trigger 500", async () => {
    const payloads = ["<script>", '"', "--", "*", "()"];

    for (const q of payloads) {
      const res = await client
        .get(config.endpoints.search)
        .query({ q })
        .set(authHeader(staffToken));

      expect(res.status).not.toBe(500);
    }
  });

  test("Search endpoint without authentication returns 401", async () => {
    const res = await client.get(config.endpoints.search).query({ q: "john" });
    expect(res.status).toBe(401);
  });

  test("Search query length limit is handled gracefully", async () => {
    const res = await client
      .get(config.endpoints.search)
      .query({ q: longString(10000, "x") })
      .set(authHeader(staffToken));

    expect(res.status).not.toBe(500);
    expect([403, 404]).toContain(res.status);
  });

  test("IDOR via search parameter manipulation is blocked", async () => {
    const baselineRes = await client
      .get(config.endpoints.search)
      .query({ q: "" })
      .set(authHeader(staffToken));

    const manipulatedRes = await client
      .get(config.endpoints.search)
      .query({
        q: "",
        userId: ownerUserId || "owner-id",
        managerId: ownerUserId || "owner-id",
        includePrivate: true,
      })
      .set(authHeader(staffToken));

    expect([403, 404]).toContain(baselineRes.status);
    expect(manipulatedRes.status).not.toBe(500);
    expect([403, 404]).toContain(manipulatedRes.status);

    const baselineData = getAuthData(baselineRes) || baselineRes.body;
    const manipulatedData = getAuthData(manipulatedRes) || manipulatedRes.body;

    if (Array.isArray(baselineData) && Array.isArray(manipulatedData)) {
      expect(manipulatedData.length).toBeLessThanOrEqual(baselineData.length);
    }
  });

  test("Search results do not expose internal sensitive fields", async () => {
    const res = await client
      .get(config.endpoints.search)
      .query({ q: "" })
      .set(authHeader(ownerToken));

    expect(res.status).toBe(200);

    const data = getAuthData(res) || res.body;
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
        ? data.items
        : [];

    const sensitiveFieldFindings = collectPotentialSensitiveFields(list);
    expect(sensitiveFieldFindings.length).toBe(0);
  });
});
