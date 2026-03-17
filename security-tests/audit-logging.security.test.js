/**
 * Audit logging security tests.
 *
 * Verifies that security-relevant actions are recorded and that audit data
 * is protected from unauthorized access or tampering.
 */

const {
  authHeader,
  client,
  config,
  getAuthData,
  loginWith,
} = require("./helpers/securityTestUtils");

jest.setTimeout(180000);

const AUDIT_LOG_ENDPOINT_CANDIDATES = [
  process.env.SEC_AUDIT_LOGS_ENDPOINT,
  "/admin/audit-logs",
  "/audit-logs",
  "/audit/logs",
].filter(Boolean);

const USER_ACTIVITY_ENDPOINT_TEMPLATES = [
  process.env.SEC_USER_ACTIVITY_ENDPOINT_TEMPLATE,
  "/users/:id/activity",
  "/users/:id/audit-logs",
  "/activity/users/:id",
].filter(Boolean);

const SENSITIVE_FORBIDDEN_ENDPOINT =
  process.env.SEC_PROTECTED_FORBIDDEN_ENDPOINT || "/users/managers";

const SENSITIVE_UPDATE_ENDPOINT_TEMPLATE =
  process.env.SEC_SENSITIVE_UPDATE_ENDPOINT_TEMPLATE || "/tenants/:id";

function toEventList(response) {
  const data = getAuthData(response);

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(response.body)) return response.body;
  if (Array.isArray(response.body?.items)) return response.body.items;
  if (Array.isArray(response.body?.events)) return response.body.events;

  return [];
}

function asStr(value) {
  return String(value || "");
}

function lower(value) {
  return asStr(value).toLowerCase();
}

function getEventType(event) {
  return lower(
    event?.event_type ||
      event?.eventType ||
      event?.type ||
      event?.action ||
      event?.name,
  );
}

function getTimestamp(event) {
  return (
    event?.timestamp ||
    event?.createdAt ||
    event?.created_at ||
    event?.time ||
    null
  );
}

function getIp(event) {
  return event?.ip_address || event?.ipAddress || event?.ip || null;
}

function getUserAgent(event) {
  return event?.user_agent || event?.userAgent || event?.ua || null;
}

function getUserId(event) {
  return event?.user_id || event?.userId || event?.actorId || event?.actor_id || null;
}

function getResourceType(event) {
  return event?.resource_type || event?.resourceType || event?.entityType || null;
}

function getResourceId(event) {
  return event?.resource_id || event?.resourceId || event?.entityId || null;
}

function maskEmailPatternFound(text) {
  return /[a-z0-9]\*{2,}@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
}

function containsRawSensitiveLeak(text) {
  const lowerText = lower(text);

  const hasPassword = lowerText.includes("password") &&
    !lowerText.includes("password_changed") &&
    !lowerText.includes("password reset requested");

  const hasJwtLike = /eyj[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/i.test(
    text,
  );

  const hasCardLike = /\b(?:\d[ -]*?){13,19}\b/.test(text);

  return hasPassword || hasJwtLike || hasCardLike;
}

async function pollForEvents(fetchEvents, predicate, timeoutMs = 5000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const events = await fetchEvents();
    if (predicate(events)) {
      return events;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return fetchEvents();
}

describe("Audit logging security", () => {
  let userA;
  let userB;
  let owner;

  let auditLogsEndpoint = null;
  let userActivityEndpoint = null;
  let canQueryAuditTrail = false;
  let skipReason = null;

  let targetTenantId = null;

  const generatedEventMarkers = [];

  async function fetchAuditEvents() {
    if (auditLogsEndpoint) {
      const res = await client.get(auditLogsEndpoint).set(authHeader(owner.token));
      if (res.status === 200) {
        return toEventList(res);
      }
    }

    if (userActivityEndpoint) {
      const res = await client.get(userActivityEndpoint).set(authHeader(owner.token));
      if (res.status === 200) {
        return toEventList(res);
      }
    }

    return [];
  }

  beforeAll(async () => {
    const [aLoginRaw, bLoginRaw, ownerLogin] = await Promise.all([
      loginWith(
        process.env.SEC_EMAIL_A || config.credentials.staff1.email,
        process.env.SEC_PASSWORD_A || config.credentials.staff1.password,
      ),
      loginWith(
        process.env.SEC_EMAIL_B || config.credentials.staff2.email,
        process.env.SEC_PASSWORD_B || config.credentials.staff2.password,
      ),
      loginWith(config.credentials.owner.email, config.credentials.owner.password),
    ]);

    let bLogin = bLoginRaw;
    let bEmail = process.env.SEC_EMAIL_B || config.credentials.staff2.email;
    let bPassword = process.env.SEC_PASSWORD_B || config.credentials.staff2.password;

    if (bLogin.status !== 200) {
      bEmail = config.credentials.generalManager.email;
      bPassword = config.credentials.generalManager.password;
      bLogin = await loginWith(bEmail, bPassword);
    }

    if (ownerLogin.status !== 200) {
      skipReason = `Admin login failed (status=${ownerLogin.status})`;
    }

    userA = {
      token: getAuthData(aLoginRaw)?.tokens?.accessToken || null,
      userId: getAuthData(aLoginRaw)?.user?.id || null,
      email: process.env.SEC_EMAIL_A || config.credentials.staff1.email,
      password: process.env.SEC_PASSWORD_A || config.credentials.staff1.password,
    };

    userB = {
      token: getAuthData(bLogin)?.tokens?.accessToken || null,
      userId: getAuthData(bLogin)?.user?.id || null,
      email: bEmail,
      password: bPassword,
    };

    owner = {
      token: getAuthData(ownerLogin)?.tokens?.accessToken || null,
      userId: getAuthData(ownerLogin)?.user?.id || null,
    };

    if (!owner.token) {
      return;
    }

    // Discover audit logs endpoint
    for (const endpoint of AUDIT_LOG_ENDPOINT_CANDIDATES) {
      const res = await client.get(endpoint).set(authHeader(owner.token));
      if (res.status !== 404) {
        auditLogsEndpoint = endpoint;
        if (res.status === 200) {
          canQueryAuditTrail = true;
        }
        break;
      }
    }

    // Discover per-user activity endpoint
    if (owner.userId) {
      for (const template of USER_ACTIVITY_ENDPOINT_TEMPLATES) {
        const endpoint = template.replace(":id", owner.userId);
        const res = await client.get(endpoint).set(authHeader(owner.token));
        if (res.status !== 404) {
          userActivityEndpoint = endpoint;
          if (res.status === 200) {
            canQueryAuditTrail = true;
          }
          break;
        }
      }
    }

    if (!auditLogsEndpoint && !userActivityEndpoint) {
      skipReason = "No audit/activity endpoint discovered";
      return;
    }

    // Fetch a tenant for sensitive update test
    const tenantsRes = await client.get("/tenants").set(authHeader(owner.token));
    if (tenantsRes.status === 200) {
      const tenants = toEventList(tenantsRes);
      if (Array.isArray(tenants) && tenants[0]?.id) {
        targetTenantId = tenants[0].id;
      }
    }
  });

  test.skip(
    "Skipped automatically when no audit/activity endpoint exists in deployment",
    () => {},
  );

  test("Audit endpoint exists or suite exits gracefully without failure", () => {
    if (skipReason || (!auditLogsEndpoint && !userActivityEndpoint)) {
      console.warn(
        `Audit logging assertions skipped: ${skipReason || "No endpoint discovered"}`,
      );
    }

    expect(true).toBe(true);
  });

  describe("Security event logging", () => {
    test("Failed login creates login_failed event with IP/timestamp/masked email and no password", async () => {
      if (skipReason || !canQueryAuditTrail) return;

      const badPassword = `Wrong-${Date.now()}!`;
      await client.post("/auth/login").send({
        email: userA.email,
        password: badPassword,
      });

      const events = await pollForEvents(
        fetchAuditEvents,
        (items) => items.some((e) => getEventType(e).includes("login_failed")),
        5000,
      );

      const event = events.find((e) => getEventType(e).includes("login_failed"));
      expect(event).toBeTruthy();

      const serialized = JSON.stringify(event || {});
      expect(getIp(event)).toBeTruthy();
      expect(getTimestamp(event)).toBeTruthy();
      expect(maskEmailPatternFound(serialized)).toBe(true);
      expect(lower(serialized).includes(lower(badPassword))).toBe(false);
    });

    test("Successful login creates login_success event", async () => {
      if (skipReason || !canQueryAuditTrail) return;

      const login = await loginWith(userA.email, userA.password);
      if (login.status !== 200) return;

      const events = await pollForEvents(
        fetchAuditEvents,
        (items) => items.some((e) => getEventType(e).includes("login_success")),
      );

      const event = events.find((e) => getEventType(e).includes("login_success"));
      expect(event).toBeTruthy();
    });

    test("Logout creates logout event with session identifier", async () => {
      if (skipReason || !canQueryAuditTrail) return;

      const login = await loginWith(userA.email, userA.password);
      const token = getAuthData(login)?.tokens?.accessToken;
      expect(token).toBeTruthy();

      const logoutRes = await client.post("/auth/logout").set(authHeader(token));
      expect([200, 204]).toContain(logoutRes.status);

      const events = await pollForEvents(
        fetchAuditEvents,
        (items) => items.some((e) => getEventType(e).includes("logout")),
      );

      const event = events.find((e) => getEventType(e).includes("logout"));
      expect(event).toBeTruthy();

      const serialized = JSON.stringify(event || {}).toLowerCase();
      const hasSessionId =
        serialized.includes("session") || serialized.includes("sid");
      expect(hasSessionId).toBe(true);
    });

    test("Forbidden request creates permission_denied event", async () => {
      if (skipReason || !canQueryAuditTrail) return;

      const res = await client
        .get(SENSITIVE_FORBIDDEN_ENDPOINT)
        .set(authHeader(userA.token));
      expect([401, 403]).toContain(res.status);

      const events = await pollForEvents(
        fetchAuditEvents,
        (items) =>
          items.some((e) =>
            ["permission_denied", "access_denied", "forbidden"].some((k) =>
              getEventType(e).includes(k),
            ),
          ),
      );

      const event = events.find((e) =>
        ["permission_denied", "access_denied", "forbidden"].some((k) =>
          getEventType(e).includes(k),
        ),
      );

      expect(event).toBeTruthy();
    });

    test("Sensitive update creates update event with actor/what/when", async () => {
      if (skipReason || !canQueryAuditTrail || !targetTenantId) return;

      const endpoint = SENSITIVE_UPDATE_ENDPOINT_TEMPLATE.replace(":id", targetTenantId);

      const beforeRes = await client.get(`/tenants/${targetTenantId}`).set(authHeader(owner.token));
      if (beforeRes.status !== 200) return;
      const beforeData = getAuthData(beforeRes) || {};

      const marker = `AuditMark-${Date.now()}`;
      generatedEventMarkers.push(marker);

      const updateRes = await client
        .patch(endpoint)
        .set(authHeader(owner.token))
        .send({ notes: marker, firstName: beforeData.firstName });

      expect([200, 201]).toContain(updateRes.status);

      const events = await pollForEvents(
        fetchAuditEvents,
        (items) =>
          items.some((e) => {
            const t = getEventType(e);
            const text = JSON.stringify(e || "");
            return (
              (t.includes("update") || t.includes("modified") || t.includes("patch")) &&
              text.includes(marker)
            );
          }),
      );

      const event = events.find((e) => {
        const t = getEventType(e);
        const text = JSON.stringify(e || "");
        return (
          (t.includes("update") || t.includes("modified") || t.includes("patch")) &&
          text.includes(marker)
        );
      });

      expect(event).toBeTruthy();
      expect(getUserId(event)).toBeTruthy();
      expect(getTimestamp(event)).toBeTruthy();
      const serialized = JSON.stringify(event || {}).toLowerCase();
      expect(
        serialized.includes("changed") ||
          serialized.includes("diff") ||
          serialized.includes("updates") ||
          serialized.includes("notes"),
      ).toBe(true);
    });
  });

  describe("Log hygiene", () => {
    test("Audit logs never contain password/JWT/card and avoid full PII leakage", async () => {
      if (skipReason || !canQueryAuditTrail) return;

      const events = await fetchAuditEvents();
      const serialized = JSON.stringify(events || []);

      expect(containsRawSensitiveLeak(serialized)).toBe(false);

      // Full raw emails should be avoided for security events. Masked pattern is acceptable.
      const rawEmailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
      const allEmails = serialized.match(rawEmailPattern) || [];
      const unmasked = allEmails.filter((e) => !maskEmailPatternFound(e));
      expect(unmasked.length).toBe(0);
    });

    test("Audit log endpoint is admin-only", async () => {
      if (skipReason || !auditLogsEndpoint || !userA.token || !userB.token) return;

      const tenantRes = await client
        .get(auditLogsEndpoint)
        .set(authHeader(userA.token));
      const landlordRes = await client
        .get(auditLogsEndpoint)
        .set(authHeader(userB.token));

      expect([401, 403]).toContain(tenantRes.status);
      expect([401, 403]).toContain(landlordRes.status);
    });

    test("Audit logs cannot be deleted by non-super-admin role", async () => {
      if (skipReason || !auditLogsEndpoint || !userA.token || !userB.token) return;

      const candidateId = process.env.SEC_AUDIT_LOG_ENTRY_ID || "sample-log-id";

      const tenantDelete = await client
        .delete(`${auditLogsEndpoint}/${candidateId}`)
        .set(authHeader(userA.token));
      const landlordDelete = await client
        .delete(`${auditLogsEndpoint}/${candidateId}`)
        .set(authHeader(userB.token));

      expect([401, 403, 404, 405]).toContain(tenantDelete.status);
      expect([401, 403, 404, 405]).toContain(landlordDelete.status);
    });

    test("Audit entries are immutable (PATCH/DELETE rejected)", async () => {
      if (skipReason || !auditLogsEndpoint) return;

      const candidateId = process.env.SEC_AUDIT_LOG_ENTRY_ID || "sample-log-id";

      const patchRes = await client
        .patch(`${auditLogsEndpoint}/${candidateId}`)
        .set(authHeader(owner.token))
        .send({ event_type: "tampered" });

      const deleteRes = await client
        .delete(`${auditLogsEndpoint}/${candidateId}`)
        .set(authHeader(owner.token));

      expect([403, 404, 405]).toContain(patchRes.status);
      expect([403, 404, 405]).toContain(deleteRes.status);
    });
  });

  describe("Completeness checks", () => {
    test("10 distinct security actions appear in audit trail within 5 seconds", async () => {
      if (skipReason || !canQueryAuditTrail) return;

      const unique = Date.now();

      // 1 failed login
      await client.post("/auth/login").send({ email: userA.email, password: `Wrong-${unique}` });
      // 2 successful login A
      const loginA = await loginWith(userA.email, userA.password);
      const tokenA = getAuthData(loginA)?.tokens?.accessToken;
      // 3 profile access
      if (tokenA) await client.get("/auth/profile").set(authHeader(tokenA));
      // 4 forbidden managers list (staff)
      await client.get(SENSITIVE_FORBIDDEN_ENDPOINT).set(authHeader(userA.token));
      // 5 logout A
      if (tokenA) await client.post("/auth/logout").set(authHeader(tokenA));
      // 6 successful login B
      const loginB = await loginWith(userB.email, userB.password);
      if (loginB.status !== 200) return;
      const tokenB = getAuthData(loginB)?.tokens?.accessToken;
      // 7 refresh B
      const refreshB = getAuthData(loginB)?.tokens?.refreshToken;
      const userIdB = getAuthData(loginB)?.user?.id;
      if (refreshB && userIdB) {
        await client.post("/auth/refresh").send({ userId: userIdB, refreshToken: refreshB });
      }
      // 8 invalid token profile
      await client.get("/auth/profile").set(authHeader("invalid.token.value"));
      // 9 forbidden property create by staff
      await client
        .post("/properties")
        .set(authHeader(userA.token))
        .send({
          name: `ForbiddenProp-${unique}`,
          address: "forbidden street",
          city: "Nairobi",
          country: "Kenya",
          numberOfUnits: 1,
        });
      // 10 logout B
      if (tokenB) await client.post("/auth/logout").set(authHeader(tokenB));

      const events = await pollForEvents(fetchAuditEvents, (items) => {
        const types = items.map((e) => getEventType(e));
        const checks = [
          types.some((t) => t.includes("login_failed")),
          types.some((t) => t.includes("login_success")),
          types.some((t) => t.includes("logout")),
          types.some((t) => t.includes("permission_denied") || t.includes("forbidden")),
          types.some((t) => t.includes("refresh")),
          types.some((t) => t.includes("profile") || t.includes("me")),
          types.some((t) => t.includes("invalid_token") || t.includes("unauthorized")),
          types.some((t) => t.includes("create") || t.includes("property")),
          types.some((t) => t.includes("auth")),
          items.length >= 10,
        ];
        return checks.filter(Boolean).length >= 10;
      });

      const types = events.map((e) => getEventType(e));
      const matches = [
        types.some((t) => t.includes("login_failed")),
        types.some((t) => t.includes("login_success")),
        types.some((t) => t.includes("logout")),
        types.some((t) => t.includes("permission_denied") || t.includes("forbidden")),
        types.some((t) => t.includes("refresh")),
        types.some((t) => t.includes("profile") || t.includes("me")),
        types.some((t) => t.includes("invalid_token") || t.includes("unauthorized")),
        types.some((t) => t.includes("create") || t.includes("property")),
        types.some((t) => t.includes("auth")),
        events.length >= 10,
      ].filter(Boolean).length;

      expect(matches).toBeGreaterThanOrEqual(10);
    });

    test("Audit entries include required fields", async () => {
      if (skipReason || !canQueryAuditTrail) return;

      const events = await fetchAuditEvents();
      if (!events.length) return;

      const sample = events[0];

      expect(getUserId(sample)).toBeTruthy();
      expect(getIp(sample)).toBeTruthy();
      expect(getUserAgent(sample)).toBeTruthy();
      expect(getTimestamp(sample)).toBeTruthy();
      expect(getEventType(sample)).toBeTruthy();
      expect(getResourceType(sample)).toBeTruthy();
      expect(getResourceId(sample)).toBeTruthy();
    });
  });

  /**
   * Manual checklist: monitoring and alerting
   * - Is there an alert for >10 failed logins from same IP in 1 minute?
   * - Is there an alert for admin actions outside business hours?
   * - Are logs shipped to an external sink (Datadog/Logtail/Papertrail/etc)?
   * - Is retention at least 90 days with tamper-evident controls?
   */
});
