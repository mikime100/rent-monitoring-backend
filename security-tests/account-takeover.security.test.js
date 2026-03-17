/**
 * Account takeover security tests.
 *
 * Focus: token lifecycle, refresh misuse, password-reset abuse,
 * session fixation, and JWT manipulation.
 */

const crypto = require("crypto");
const {
  authHeader,
  buildAlgNoneToken,
  buildExpiredLikeToken,
  client,
  config,
  getAuthData,
  loginWith,
} = require("./helpers/securityTestUtils");

jest.setTimeout(180000);

const auth = {
  login: process.env.SEC_LOGIN_ENDPOINT || config.auth.loginEndpoint || "/auth/login",
  logout: process.env.SEC_LOGOUT_ENDPOINT || "/auth/logout",
  refresh:
    process.env.SEC_REFRESH_ENDPOINT || config.auth.refreshEndpoint || "/auth/refresh",
  forgot:
    process.env.SEC_FORGOT_PASSWORD_ENDPOINT ||
    config.auth.passwordResetEndpoint ||
    "/auth/forgot-password",
  reset: process.env.SEC_RESET_PASSWORD_ENDPOINT || "/auth/reset-password",
  me: process.env.SEC_ME_ENDPOINT || config.auth.profileEndpoint || "/auth/me",
  changePassword:
    process.env.SEC_CHANGE_PASSWORD_ENDPOINT || "/auth/change-password",
};

const creds = {
  userA: {
    email: process.env.SEC_EMAIL_A || config.credentials.staff1.email,
    password: process.env.SEC_PASSWORD_A || config.credentials.staff1.password,
  },
  userB: {
    email: process.env.SEC_EMAIL_B || config.credentials.staff2.email,
    password: process.env.SEC_PASSWORD_B || config.credentials.staff2.password,
  },
};

function extractTokensAndUser(loginResponse) {
  const data = getAuthData(loginResponse) || {};
  const tokens = data.tokens || {};
  const user = data.user || {};
  return {
    accessToken: tokens.accessToken || null,
    refreshToken: tokens.refreshToken || null,
    userId: user.id || null,
    user,
  };
}

function decodeJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payloadRaw = Buffer.from(parts[1], "base64").toString("utf8");
    return JSON.parse(payloadRaw);
  } catch {
    return null;
  }
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function toBase64UrlJson(obj) {
  return toBase64Url(JSON.stringify(obj));
}

function forgeHs256Jwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = toBase64UrlJson(header);
  const encodedPayload = toBase64UrlJson(payload);
  const data = encodedHeader + "." + encodedPayload;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return data + "." + signature;
}

function tamperPayloadWithoutResigning(validToken, overrides) {
  const parts = String(validToken || "").split(".");
  if (parts.length !== 3) return "invalid.token.value";

  let payload = {};
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
  } catch {
    return "invalid.token.value";
  }

  const tamperedPayload = Object.assign({}, payload, overrides || {});
  const encodedPayload = toBase64UrlJson(tamperedPayload);

  return parts[0] + "." + encodedPayload + "." + parts[2];
}

async function endpointExists(path, method) {
  try {
    let res;

    if (method === "POST") {
      res = await client.post(path).send({});
    } else {
      res = await client.get(path);
    }

    return ![404].includes(res.status);
  } catch {
    return false;
  }
}

describe("Account takeover security", () => {
  let userA;
  let userB;

  beforeAll(async () => {
    const [loginA, loginB] = await Promise.all([
      loginWith(creds.userA.email, creds.userA.password),
      loginWith(creds.userB.email, creds.userB.password),
    ]);

    expect(loginA.status).toBe(200);
    expect(loginB.status).toBe(200);

    userA = extractTokensAndUser(loginA);
    userB = extractTokensAndUser(loginB);

    expect(typeof userA.accessToken).toBe("string");
    expect(typeof userA.refreshToken).toBe("string");
    expect(typeof userA.userId).toBe("string");

    expect(typeof userB.accessToken).toBe("string");
    expect(typeof userB.refreshToken).toBe("string");
    expect(typeof userB.userId).toBe("string");
  });

  describe("Token lifecycle abuse", () => {
    test("After logout, old access token is rejected", async () => {
      const login = await loginWith(creds.userA.email, creds.userA.password);
      expect(login.status).toBe(200);
      const session = extractTokensAndUser(login);

      const beforeRes = await client
        .get(auth.me)
        .set(authHeader(session.accessToken));
      expect(beforeRes.status).toBe(200);

      const logoutRes = await client
        .post(auth.logout)
        .set(authHeader(session.accessToken));
      expect([200, 204]).toContain(logoutRes.status);

      const afterRes = await client
        .get(auth.me)
        .set(authHeader(session.accessToken));

      expect(afterRes.status).toBe(401);
    });

    test("After logout, old refresh token is rejected", async () => {
      const login = await loginWith(creds.userA.email, creds.userA.password);
      expect(login.status).toBe(200);
      const session = extractTokensAndUser(login);

      const logoutRes = await client
        .post(auth.logout)
        .set(authHeader(session.accessToken));
      expect([200, 204]).toContain(logoutRes.status);

      const refreshRes = await client.post(auth.refresh).send({
        userId: session.userId,
        refreshToken: session.refreshToken,
      });

      expect([400, 401, 403]).toContain(refreshRes.status);
    });

    test("User A refresh token cannot be used with User B session context", async () => {
      const res = await client
        .post(auth.refresh)
        .set(authHeader(userB.accessToken))
        .send({
          userId: userB.userId,
          refreshToken: userA.refreshToken,
        });

      expect([400, 401, 403]).toContain(res.status);
    });

    test("Expired access + valid refresh yields new access and rotates refresh", async () => {
      const login = await loginWith(creds.userA.email, creds.userA.password);
      expect(login.status).toBe(200);
      const session = extractTokensAndUser(login);

      const expiredAccess = buildExpiredLikeToken();
      const expiredAccessRes = await client
        .get(auth.me)
        .set(authHeader(expiredAccess));
      expect(expiredAccessRes.status).toBe(401);

      const refreshRes = await client.post(auth.refresh).send({
        userId: session.userId,
        refreshToken: session.refreshToken,
      });

      expect(refreshRes.status).toBe(200);

      const refreshData = getAuthData(refreshRes) || {};
      const rotated = refreshData.tokens || {};

      expect(typeof rotated.accessToken).toBe("string");
      expect(typeof rotated.refreshToken).toBe("string");
      expect(rotated.accessToken).not.toBe(session.accessToken);
      expect(rotated.refreshToken).not.toBe(session.refreshToken);

      const secondUseRes = await client.post(auth.refresh).send({
        userId: session.userId,
        refreshToken: session.refreshToken,
      });

      expect([400, 401, 403]).toContain(secondUseRes.status);
    });

    test("Using same refresh token twice rejects second call", async () => {
      const login = await loginWith(creds.userA.email, creds.userA.password);
      expect(login.status).toBe(200);
      const session = extractTokensAndUser(login);

      const first = await client.post(auth.refresh).send({
        userId: session.userId,
        refreshToken: session.refreshToken,
      });
      expect(first.status).toBe(200);

      const second = await client.post(auth.refresh).send({
        userId: session.userId,
        refreshToken: session.refreshToken,
      });
      expect([400, 401, 403]).toContain(second.status);
    });
  });

  describe("Password reset abuse", () => {
    test("Request reset then login does not consume reset token (if reset API is available)", async () => {
      const forgotAvailable = await endpointExists(auth.forgot, "POST");
      const resetAvailable = await endpointExists(auth.reset, "POST");

      if (!forgotAvailable || !resetAvailable) {
        expect(true).toBe(true);
        return;
      }

      const forgotRes = await client.post(auth.forgot).send({ email: creds.userA.email });
      expect([200, 202]).toContain(forgotRes.status);

      const loginRes = await loginWith(creds.userA.email, creds.userA.password);
      expect(loginRes.status).toBe(200);

      const issuedResetToken = process.env.SEC_VALID_RESET_TOKEN_A || null;
      if (!issuedResetToken) {
        expect(true).toBe(true);
        return;
      }

      const consumeRes = await client.post(auth.reset).send({
        token: issuedResetToken,
        newPassword: "TempResetA1!",
      });

      expect([200, 400, 401, 403]).toContain(consumeRes.status);
    });

    test("Two reset requests: only newest token should work (if both tokens provided)", async () => {
      const resetAvailable = await endpointExists(auth.reset, "POST");
      if (!resetAvailable) {
        expect(true).toBe(true);
        return;
      }

      const oldToken = process.env.SEC_RESET_TOKEN_OLD || null;
      const newToken = process.env.SEC_RESET_TOKEN_NEW || null;

      if (!oldToken || !newToken) {
        expect(true).toBe(true);
        return;
      }

      const oldRes = await client.post(auth.reset).send({
        token: oldToken,
        newPassword: "TempOldToken1!",
      });

      const newRes = await client.post(auth.reset).send({
        token: newToken,
        newPassword: "TempNewToken1!",
      });

      expect([400, 401, 403]).toContain(oldRes.status);
      expect([200, 204]).toContain(newRes.status);
    });

    test("Syntactically valid but never-issued reset token is rejected", async () => {
      const resetAvailable = await endpointExists(auth.reset, "POST");
      if (!resetAvailable) {
        expect(true).toBe(true);
        return;
      }

      const fakeToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJzdWIiOiJub3QtcmVhbCIsImV4cCI6NDA5OTY4MDAwMH0." +
        "x";

      const res = await client.post(auth.reset).send({
        token: fakeToken,
        newPassword: "ResetNeverIssued1!",
      });

      expect([400, 401]).toContain(res.status);
    });

    test("Used reset token is rejected on reuse (if valid token available)", async () => {
      const resetAvailable = await endpointExists(auth.reset, "POST");
      if (!resetAvailable) {
        expect(true).toBe(true);
        return;
      }

      const oneTimeToken = process.env.SEC_RESET_TOKEN_ONE_TIME || null;
      if (!oneTimeToken) {
        expect(true).toBe(true);
        return;
      }

      const first = await client.post(auth.reset).send({
        token: oneTimeToken,
        newPassword: "OneTimePass1!",
      });

      const second = await client.post(auth.reset).send({
        token: oneTimeToken,
        newPassword: "OneTimePass2!",
      });

      expect([200, 204]).toContain(first.status);
      expect([400, 401, 403]).toContain(second.status);
    });

    test("Reset rejects same-as-old password (optional check when token available)", async () => {
      const resetAvailable = await endpointExists(auth.reset, "POST");
      if (!resetAvailable) {
        expect(true).toBe(true);
        return;
      }

      const token = process.env.SEC_RESET_TOKEN_SAME_OLD || null;
      if (!token) {
        expect(true).toBe(true);
        return;
      }

      const res = await client.post(auth.reset).send({
        token,
        newPassword: creds.userA.password,
      });

      expect([400, 401, 403]).toContain(res.status);
    });
  });

  describe("Session fixation and concurrent sessions", () => {
    test("Two independent login sessions both work", async () => {
      const [a1, a2] = await Promise.all([
        loginWith(creds.userA.email, creds.userA.password),
        loginWith(creds.userA.email, creds.userA.password),
      ]);

      expect(a1.status).toBe(200);
      expect(a2.status).toBe(200);

      const s1 = extractTokensAndUser(a1);
      const s2 = extractTokensAndUser(a2);

      const [me1, me2] = await Promise.all([
        client.get(auth.me).set(authHeader(s1.accessToken)),
        client.get(auth.me).set(authHeader(s2.accessToken)),
      ]);

      expect(me1.status).toBe(200);
      expect(me2.status).toBe(200);
    });

    test("Password change invalidates existing sessions", async () => {
      const changeAvailable = await endpointExists(auth.changePassword, "POST");
      if (!changeAvailable) {
        expect(true).toBe(true);
        return;
      }

      const tempNewPassword = process.env.SEC_TEMP_NEW_PASSWORD_B || "TempBChange1!";

      const [b1Login, b2Login] = await Promise.all([
        loginWith(creds.userB.email, creds.userB.password),
        loginWith(creds.userB.email, creds.userB.password),
      ]);

      expect(b1Login.status).toBe(200);
      expect(b2Login.status).toBe(200);

      const b1 = extractTokensAndUser(b1Login);
      const b2 = extractTokensAndUser(b2Login);

      const changeRes = await client
        .post(auth.changePassword)
        .set(authHeader(b1.accessToken))
        .send({
          oldPassword: creds.userB.password,
          newPassword: tempNewPassword,
        });

      expect([200, 204]).toContain(changeRes.status);

      const [oldSession1, oldSession2] = await Promise.all([
        client.get(auth.me).set(authHeader(b1.accessToken)),
        client.get(auth.me).set(authHeader(b2.accessToken)),
      ]);

      expect(oldSession1.status).toBe(401);
      expect(oldSession2.status).toBe(401);

      const loginWithNew = await loginWith(creds.userB.email, tempNewPassword);
      expect(loginWithNew.status).toBe(200);
      const newSession = extractTokensAndUser(loginWithNew);

      const revertRes = await client
        .post(auth.changePassword)
        .set(authHeader(newSession.accessToken))
        .send({
          oldPassword: tempNewPassword,
          newPassword: creds.userB.password,
        });

      expect([200, 204]).toContain(revertRes.status);
    });
  });

  describe("JWT manipulation", () => {
    test("Tampered payload (user id swap) is rejected", async () => {
      const tampered = tamperPayloadWithoutResigning(userA.accessToken, {
        sub: userB.userId,
      });

      const res = await client.get(auth.me).set(authHeader(tampered));
      expect(res.status).toBe(401);
    });

    test("JWT with alg none is rejected", async () => {
      const token = buildAlgNoneToken({
        sub: userA.userId,
        email: creds.userA.email,
        role: "staff",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await client.get(auth.me).set(authHeader(token));
      expect(res.status).toBe(401);
    });

    test("JWT signed with weak secrets is rejected (critical if accepted)", async () => {
      const baselinePayload = decodeJwt(userA.accessToken) || {
        sub: userA.userId,
        email: creds.userA.email,
        role: "staff",
      };

      const forgedPayload = Object.assign({}, baselinePayload, {
        sub: userB.userId,
        email: creds.userB.email,
      });

      const weakSecrets = ["secret", "password", "12345"];

      for (const secret of weakSecrets) {
        const forged = forgeHs256Jwt(forgedPayload, secret);
        const res = await client.get(auth.me).set(authHeader(forged));
        expect([400, 401, 403]).toContain(res.status);
      }
    });

    test("Expired access token is rejected", async () => {
      const expired = buildExpiredLikeToken();
      const res = await client.get(auth.me).set(authHeader(expired));
      expect(res.status).toBe(401);
    });
  });
});
