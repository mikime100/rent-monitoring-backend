const request = require("supertest");
const config = require("../security.config");

const client = request(config.apiBaseUrl);

function base64Url(input) {
  return Buffer.from(JSON.stringify(input))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function buildAlgNoneToken(payload) {
  const header = { alg: "none", typ: "JWT" };
  return `${base64Url(header)}.${base64Url(payload)}.`;
}

function buildExpiredLikeToken() {
  const payload = {
    sub: "expired-user",
    email: "expired@example.com",
    role: "staff",
    iat: Math.floor(Date.now() / 1000) - 3600,
    exp: Math.floor(Date.now() / 1000) - 60,
  };
  return buildAlgNoneToken(payload);
}

function tamperJwt(token) {
  if (!token || typeof token !== "string") return "invalid.token.value";
  const chars = token.split("");
  const idx = Math.max(chars.length - 2, 0);
  chars[idx] = chars[idx] === "a" ? "b" : "a";
  return chars.join("");
}

function getAuthData(response) {
  return response?.body?.data || response?.body || {};
}

function extractAccessToken(response) {
  const data = getAuthData(response);
  return (
    data?.tokens?.accessToken ||
    data?.accessToken ||
    response?.body?.accessToken ||
    null
  );
}

function extractUser(response) {
  const data = getAuthData(response);
  return data?.user || response?.body?.user || null;
}

async function loginWith(email, password) {
  return client
    .post(config.auth.loginEndpoint)
    .set("Accept", "application/json")
    .send({ email, password });
}

async function loginAs(roleName) {
  const creds =
    roleName === "owner"
      ? config.credentials.owner
      : roleName === "generalManager"
        ? config.credentials.generalManager
        : roleName === "staff2"
          ? config.credentials.staff2
          : config.credentials.staff1;

  const res = await loginWith(creds.email, creds.password);
  const accessToken = extractAccessToken(res);
  const user = extractUser(res);

  return {
    response: res,
    accessToken,
    user,
    creds,
  };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

function randomEmail(prefix = "sec-test") {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 10000)}@example.com`;
}

function randomUuidLike() {
  return "00000000-0000-4000-a000-000000000000";
}

function longString(len = 10000, char = "A") {
  return new Array(len).fill(char).join("");
}

function collectPotentialSensitiveFields(items) {
  const banned = [
    "password",
    "refreshToken",
    "accessToken",
    "token",
    "secret",
    "hash",
  ];
  const findings = [];

  for (const item of items || []) {
    if (!item || typeof item !== "object") continue;
    for (const key of Object.keys(item)) {
      if (banned.includes(key)) {
        findings.push({ key, item });
      }
    }
  }

  return findings;
}

module.exports = {
  client,
  config,
  authHeader,
  buildAlgNoneToken,
  buildExpiredLikeToken,
  collectPotentialSensitiveFields,
  extractAccessToken,
  extractUser,
  getAuthData,
  loginAs,
  loginWith,
  longString,
  randomEmail,
  randomUuidLike,
  tamperJwt,
};
