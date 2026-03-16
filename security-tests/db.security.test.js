/**
 * Database and injection security tests.
 * Threats covered: SQL/NoSQL injection, verbose error leakage,
 * and mass-assignment privilege abuse.
 */

const {
  authHeader,
  client,
  config,
  getAuthData,
  loginAs,
  longString,
  randomEmail,
  randomUuidLike,
} = require("./helpers/securityTestUtils");

describe("Database and injection security", () => {
  let gmToken;

  beforeAll(async () => {
    const gmLogin = await loginAs("generalManager");
    gmToken = gmLogin.accessToken;
  });

  test("SQL injection payload in login must not bypass authentication", async () => {
    const res = await client.post(config.auth.loginEndpoint).send({
      email: "' OR '1'='1",
      password: "' OR '1'='1",
    });

    expect(res.status).not.toBe(200);
    expect(res.body?.data?.tokens?.accessToken).toBeUndefined();
  });

  test("SQL injection payload in search endpoint does not crash with 500", async () => {
    const { accessToken } = await loginAs("staff1");

    const res = await client
      .get(config.endpoints.search)
      .query({ q: "'; DROP TABLE users; --" })
      .set(authHeader(accessToken));

    expect(res.status).not.toBe(500);

    if (res.status === 200) {
      const data = getAuthData(res);
      if (Array.isArray(data)) {
        expect(data.length).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("NoSQL-style injection object does not bypass login", async () => {
    const res = await client.post(config.auth.loginEndpoint).send({
      email: { $gt: "" },
      password: { $gt: "" },
    });

    expect([400, 401, 429]).toContain(res.status);
  });

  test("Bad query errors do not leak SQL internals or stack traces", async () => {
    if (!gmToken) {
      throw new Error(
        "General manager login failed; cannot run guarded endpoint tests.",
      );
    }

    const res = await client
      .get(`${config.endpoints.usersStaff}/not-a-uuid`)
      .set(authHeader(gmToken));

    expect([400, 404, 403]).toContain(res.status);

    const bodyText = JSON.stringify(res.body || {}).toLowerCase();
    const forbiddenPatterns = [
      "select ",
      "insert ",
      "update ",
      "delete ",
      "from users",
      "syntax error",
      "typeormerror",
      "queryfailederror",
      "stack",
      "at ",
    ];

    for (const pattern of forbiddenPatterns) {
      expect(bodyText.includes(pattern)).toBe(false);
    }
  });

  test("Mass assignment attempt with role field is rejected or ignored", async () => {
    if (!gmToken) {
      throw new Error(
        "General manager login failed; cannot run staff creation tests.",
      );
    }

    const res = await client
      .post(config.endpoints.usersStaff)
      .set(authHeader(gmToken))
      .send({
        email: randomEmail("mass-assignment"),
        password: "TempPass!234",
        firstName: "Mass",
        lastName: "Assign",
        phone: "+254700555444",
        role: "owner",
        token: longString(32, "Z"),
      });

    expect([201, 400, 403]).toContain(res.status);

    if (res.status === 201) {
      const data = getAuthData(res) || res.body;
      const role = data?.role || data?.user?.role;
      expect(["owner", "admin", "super_admin"]).not.toContain(role);
    }
  });
});
