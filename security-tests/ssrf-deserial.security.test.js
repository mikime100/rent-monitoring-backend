/**
 * SSRF + deserialization + verb tampering security tests.
 *
 * Framework note: this backend is NestJS on Express.
 *
 * If no URL-input endpoint exists, SSRF tests are skipped by design and
 * guidance is printed for future endpoint additions.
 */

const http = require("http");
const {
  authHeader,
  client,
  config,
  getAuthData,
  loginWith,
  longString,
} = require("./helpers/securityTestUtils");

jest.setTimeout(240000);

function buildDeepObject(levels) {
  const root = {};
  let cursor = root;
  for (let i = 0; i < levels; i += 1) {
    cursor.n = {};
    cursor = cursor.n;
  }
  return root;
}

function buildLargeArray(size) {
  return Array.from({ length: size }).map((_, i) => i);
}

const GET_ONLY_ENDPOINT = process.env.SEC_GET_ONLY_ENDPOINT || "/health";
const JSON_ENDPOINT_CANDIDATES = [
  process.env.SEC_JSON_BODY_ENDPOINT,
  "/auth/login",
  "/properties",
  "/tenants",
  "/sync/upload",
].filter(Boolean);

const URL_INPUT_CANDIDATES = [
  {
    name: "propertyImageUrl",
    method: "PATCH",
    endpointTemplate: process.env.SEC_URL_ENDPOINT_1 || "/properties/:id",
    bodyFactory: (url) => ({ imageUrl: url }),
  },
  {
    name: "propertyCreateImage",
    method: "POST",
    endpointTemplate: process.env.SEC_URL_ENDPOINT_2 || "/properties",
    bodyFactory: (url) => ({
      name: `SSRF Property ${Date.now()}`,
      address: "Security Street",
      city: "Nairobi",
      state: "Nairobi County",
      postalCode: "00100",
      country: "Kenya",
      description: "SSRF candidate",
      numberOfUnits: 1,
      imageUrl: url,
    }),
  },
].filter(Boolean);

async function sendByMethod(method, endpoint, token, body) {
  let req;
  if (method === "PATCH") {
    req = client.patch(endpoint);
  } else {
    req = client.post(endpoint);
  }

  if (token) {
    req.set(authHeader(token));
  }

  return req.send(body);
}

async function discoverJsonEndpoint(token) {
  for (const ep of JSON_ENDPOINT_CANDIDATES) {
    const res = await client.post(ep).set(authHeader(token)).send({});
    if (res.status !== 404 && res.status !== 405) {
      return ep;
    }
  }
  return null;
}

async function buildSsrfTargets(token) {
  const targets = [];

  // Resolve property id for /properties/:id style candidate
  let propertyId = null;
  const propsRes = await client.get("/properties").set(authHeader(token));
  if (propsRes.status === 200) {
    const list = getAuthData(propsRes) || [];
    if (Array.isArray(list) && list[0]?.id) {
      propertyId = list[0].id;
    }
  }

  for (const c of URL_INPUT_CANDIDATES) {
    const endpoint = c.endpointTemplate.includes(":id")
      ? propertyId
        ? c.endpointTemplate.replace(":id", propertyId)
        : null
      : c.endpointTemplate;

    if (!endpoint) continue;

    const probeRes = await sendByMethod(
      c.method,
      endpoint,
      token,
      c.bodyFactory("https://example.com/a.png"),
    );

    if (probeRes.status !== 404 && probeRes.status !== 405) {
      targets.push({
        name: c.name,
        method: c.method,
        endpoint,
        bodyFactory: c.bodyFactory,
      });
    }
  }

  return targets;
}

describe("SSRF and deserialization security", () => {
  let ownerToken;
  let staffToken;

  let jsonEndpoint;
  let ssrfTargets = [];

  beforeAll(async () => {
    const [ownerLogin, staffLogin] = await Promise.all([
      loginWith(config.credentials.owner.email, config.credentials.owner.password),
      loginWith(config.credentials.staff1.email, config.credentials.staff1.password),
    ]);

    expect(ownerLogin.status).toBe(200);
    expect(staffLogin.status).toBe(200);

    ownerToken = getAuthData(ownerLogin)?.tokens?.accessToken;
    staffToken = getAuthData(staffLogin)?.tokens?.accessToken;

    jsonEndpoint = await discoverJsonEndpoint(ownerToken);
    ssrfTargets = await buildSsrfTargets(ownerToken);
  });

  test("SSRF target discovery note", () => {
    if (ssrfTargets.length === 0) {
      console.warn(
        "No URL-input endpoint discovered. Add URL-accepting fields/endpoints and include them in URL_INPUT_CANDIDATES for SSRF validation.",
      );
    }
    expect(true).toBe(true);
  });

  describe("Part 1: SSRF", () => {
    test("localhost URL is blocked", async () => {
      if (ssrfTargets.length === 0) return;

      for (const t of ssrfTargets) {
        const res = await sendByMethod(
          t.method,
          t.endpoint,
          ownerToken,
          t.bodyFactory("http://localhost/admin"),
        );
        expect([400, 403, 422]).toContain(res.status);
      }
    });

    test("cloud metadata URL is blocked", async () => {
      if (ssrfTargets.length === 0) return;

      for (const t of ssrfTargets) {
        const res = await sendByMethod(
          t.method,
          t.endpoint,
          ownerToken,
          t.bodyFactory("http://169.254.169.254/latest/meta-data/"),
        );
        expect([400, 403, 422]).toContain(res.status);
      }
    });

    test("file scheme URL is rejected", async () => {
      if (ssrfTargets.length === 0) return;

      for (const t of ssrfTargets) {
        const res = await sendByMethod(
          t.method,
          t.endpoint,
          ownerToken,
          t.bodyFactory("file:///etc/passwd"),
        );
        expect([400, 403, 422]).toContain(res.status);
      }
    });

    test("internal hostname URL is rejected", async () => {
      if (ssrfTargets.length === 0) return;

      for (const t of ssrfTargets) {
        const res = await sendByMethod(
          t.method,
          t.endpoint,
          ownerToken,
          t.bodyFactory("http://db:5432"),
        );
        expect([400, 403, 422]).toContain(res.status);
      }
    });

    test("redirect chain ending in internal IP is blocked", async () => {
      if (ssrfTargets.length === 0) return;

      const redirectServer = http.createServer((req, res) => {
        res.statusCode = 302;
        res.setHeader(
          "Location",
          "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        );
        res.end();
      });

      await new Promise((resolve) => redirectServer.listen(0, "127.0.0.1", resolve));
      const addr = redirectServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const chainUrl = `http://127.0.0.1:${port}/redirect`;

      try {
        for (const t of ssrfTargets) {
          const res = await sendByMethod(
            t.method,
            t.endpoint,
            ownerToken,
            t.bodyFactory(chainUrl),
          );
          expect([400, 403, 422]).toContain(res.status);
        }
      } finally {
        await new Promise((resolve) => redirectServer.close(resolve));
      }
    });
  });

  describe("Part 2: Deserialization / parser abuse", () => {
    test("deeply nested JSON (500 levels) does not crash server", async () => {
      if (!jsonEndpoint) return;

      const deepBody = { probe: buildDeepObject(500) };
      const res = await client
        .post(jsonEndpoint)
        .set(authHeader(ownerToken))
        .send(deepBody);

      expect(res.status).not.toBe(500);
      expect(res.status).not.toBe(504);
    });

    test("100000-element JSON array is rejected or handled safely", async () => {
      if (!jsonEndpoint) return;

      const hugeArray = buildLargeArray(100000);
      const res = await client
        .post(jsonEndpoint)
        .set(authHeader(ownerToken))
        .send(hugeArray);

      expect(res.status).not.toBe(500);
      expect([400, 401, 403, 413, 422]).toContain(res.status);
    });

    test("Content-Type application/json with XML body returns 400", async () => {
      if (!jsonEndpoint) return;

      const xmlPayload = "<root><admin>true</admin></root>";
      const res = await client
        .post(jsonEndpoint)
        .set(authHeader(ownerToken))
        .set("Content-Type", "application/json")
        .send(xmlPayload);

      expect([400, 415, 422]).toContain(res.status);
    });

    test("Content-Type text/plain with JSON payload is rejected", async () => {
      if (!jsonEndpoint) return;

      const res = await client
        .post(jsonEndpoint)
        .set(authHeader(ownerToken))
        .set("Content-Type", "text/plain")
        .send('{"a":1}');

      expect([400, 401, 403, 415, 422]).toContain(res.status);
    });

    test("__proto__ pollution payload is rejected/sanitized", async () => {
      if (!jsonEndpoint) return;

      const payload = { __proto__: { admin: true }, marker: `m-${Date.now()}` };

      const before = await client.get("/auth/profile").set(authHeader(staffToken));
      expect(before.status).toBe(200);

      const res = await client
        .post(jsonEndpoint)
        .set(authHeader(staffToken))
        .send(payload);

      expect(res.status).not.toBe(500);

      const after = await client.get("/auth/profile").set(authHeader(staffToken));
      expect(after.status).toBe(200);

      const afterData = getAuthData(after) || {};
      expect(afterData.admin === true).toBe(false);
    });

    test("constructor.prototype pollution payload is rejected/sanitized", async () => {
      if (!jsonEndpoint) return;

      const payload = {
        constructor: { prototype: { admin: true } },
        marker: `c-${Date.now()}`,
      };

      const before = await client.get("/auth/profile").set(authHeader(staffToken));
      expect(before.status).toBe(200);

      const res = await client
        .post(jsonEndpoint)
        .set(authHeader(staffToken))
        .send(payload);

      expect(res.status).not.toBe(500);

      const after = await client.get("/auth/profile").set(authHeader(staffToken));
      expect(after.status).toBe(200);

      const afterData = getAuthData(after) || {};
      expect(afterData.admin === true).toBe(false);
    });
  });

  describe("Part 3: HTTP verb tampering", () => {
    test("DELETE on GET-only endpoint returns 405/404", async () => {
      const res = await client.delete(GET_ONLY_ENDPOINT).set(authHeader(ownerToken));
      expect([404, 405]).toContain(res.status);
    });

    test("PATCH with X-HTTP-Method-Override DELETE still enforces authz", async () => {
      const res = await client
        .patch(GET_ONLY_ENDPOINT)
        .set(authHeader(staffToken))
        .set("X-HTTP-Method-Override", "DELETE")
        .send({});

      expect([401, 403, 404, 405]).toContain(res.status);
    });

    test("Unknown HTTP method returns 405/501 and not 500", async () => {
      const baseUrl = String(config.apiBaseUrl || "").replace(/\/+$/, "");

      const req = await fetch(`${baseUrl}${GET_ONLY_ENDPOINT}`, {
        method: "FAKEMETHOD",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });

      expect([400, 404, 405, 501]).toContain(req.status);
    });
  });
});
