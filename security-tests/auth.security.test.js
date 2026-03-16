/**
 * Authentication security tests.
 * Threats covered: credential stuffing, account enumeration, token forgery,
 * session misuse, and password-recovery user discovery.
 */

const {
  authHeader,
  buildExpiredLikeToken,
  client,
  config,
  extractAccessToken,
  getAuthData,
  loginAs,
  loginWith,
  randomEmail,
  tamperJwt,
} = require("./helpers/securityTestUtils");

jest.setTimeout(120000);

describe("Authentication security", () => {
  test("Login with valid credentials returns an access token", async () => {
    const res = await loginWith(
      config.credentials.staff1.email,
      config.credentials.staff1.password,
    );

    expect(res.status).toBe(200);
    const token = extractAccessToken(res);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
  });

  test("Login with wrong password returns 401", async () => {
    const res = await loginWith(
      config.credentials.staff1.email,
      "WrongPass!123",
    );

    expect(res.status).toBe(401);
  });

  test("Login with non-existent user returns same auth error profile as wrong password", async () => {
    const wrongPasswordRes = await loginWith(
      config.credentials.staff1.email,
      "WrongPass!123",
    );

    const unknownUserRes = await loginWith(
      randomEmail("unknown-user"),
      "WrongPass!123",
    );

    expect(unknownUserRes.status).toBe(401);
    expect(unknownUserRes.status).toBe(wrongPasswordRes.status);

    const wrongMsg = String(wrongPasswordRes.body?.message || "");
    const unknownMsg = String(unknownUserRes.body?.message || "");
    expect(unknownMsg).toBe(wrongMsg);
  });

  test("Protected endpoint without token returns 401", async () => {
    const res = await client.get(config.auth.profileEndpoint);
    expect(res.status).toBe(401);
  });

  test("Protected endpoint with expired token returns 401", async () => {
    const expiredToken = buildExpiredLikeToken();
    const res = await client
      .get(config.auth.profileEndpoint)
      .set(authHeader(expiredToken));

    expect(res.status).toBe(401);
  });

  test("Protected endpoint with tampered JWT returns 401", async () => {
    const { accessToken, response } = await loginAs("staff1");
    expect(response.status).toBe(200);
    expect(accessToken).toBeTruthy();

    const tampered = tamperJwt(accessToken);
    const res = await client
      .get(config.auth.profileEndpoint)
      .set(authHeader(tampered));

    expect(res.status).toBe(401);
  });

  test("Brute-force protection should trigger 429 or lockout after 10 rapid failures", async () => {
    const attempts = 10;
    // Use a dedicated target account/email for brute-force checks so later suites
    // are not blocked by the lockout state of shared seeded users.
    const bruteForceEmail = randomEmail("bruteforce");
    const responses = await Promise.all(
      Array.from({ length: attempts }).map(() =>
        loginWith(bruteForceEmail, "WrongPass!123"),
      ),
    );

    const statuses = responses.map((r) => r.status);
    const hasProtection = statuses.some(
      (s) => s === 429 || s === 423 || s === 403,
    );

    expect(hasProtection).toBe(true);
  });

  test("Password reset flow does not reveal whether an email exists", async () => {
    const existingEmail = config.credentials.staff1.email;
    const unknownEmail = randomEmail("reset");

    const existingRes = await client
      .post(config.auth.passwordResetEndpoint)
      .send({ email: existingEmail });

    const unknownRes = await client
      .post(config.auth.passwordResetEndpoint)
      .send({ email: unknownEmail });

    expect(existingRes.status).not.toBe(500);
    expect(unknownRes.status).not.toBe(500);
    expect(existingRes.status).toBe(unknownRes.status);

    const existingMsg = JSON.stringify(
      getAuthData(existingRes) || existingRes.body || {},
    );
    const unknownMsg = JSON.stringify(
      getAuthData(unknownRes) || unknownRes.body || {},
    );
    expect(unknownMsg).toBe(existingMsg);
  });
});
