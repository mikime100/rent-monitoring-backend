/**
 * Security test runtime configuration.
 * Override any value with environment variables in CI/CD.
 */

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  apiBaseUrl: process.env.SEC_API_BASE_URL || "http://localhost:3000/api",

  auth: {
    loginEndpoint: process.env.SEC_LOGIN_ENDPOINT || "/auth/login",
    registerEndpoint: process.env.SEC_REGISTER_ENDPOINT || "/auth/register",
    refreshEndpoint: process.env.SEC_REFRESH_ENDPOINT || "/auth/refresh",
    profileEndpoint: process.env.SEC_PROFILE_ENDPOINT || "/auth/profile",
    passwordResetEndpoint:
      process.env.SEC_PASSWORD_RESET_ENDPOINT || "/auth/forgot-password",
  },

  endpoints: {
    search: process.env.SEC_SEARCH_ENDPOINT || "/tenants",
    usersManagers: process.env.SEC_USERS_MANAGERS_ENDPOINT || "/users/managers",
    usersStaff: process.env.SEC_USERS_STAFF_ENDPOINT || "/users/staff",
    tenants: process.env.SEC_TENANTS_ENDPOINT || "/tenants",
    health: process.env.SEC_HEALTH_ENDPOINT || "/health",
    notifications: process.env.SEC_NOTIFICATIONS_ENDPOINT || "/notifications",
  },

  credentials: {
    owner: {
      email: process.env.SEC_OWNER_EMAIL || "owner@rentapp.com",
      password: process.env.SEC_OWNER_PASSWORD || "Owner@1234",
    },
    generalManager: {
      email: process.env.SEC_GM_EMAIL || "gm@rentapp.com",
      password: process.env.SEC_GM_PASSWORD || "Manager@1234",
    },
    staff1: {
      email: process.env.SEC_STAFF1_EMAIL || "alice@rentapp.com",
      password: process.env.SEC_STAFF1_PASSWORD || "Staff@1234",
    },
    staff2: {
      email: process.env.SEC_STAFF2_EMAIL || "bob@rentapp.com",
      password: process.env.SEC_STAFF2_PASSWORD || "Staff@1234",
    },
  },

  rateLimitPerMinute: toInt(
    process.env.SEC_RATE_LIMIT ?? process.env.RATE_LIMIT_MAX,
    1000,
  ),
  unauthorizedOrigin:
    process.env.SEC_UNAUTHORIZED_ORIGIN || "https://evil.example.com",
  allowHttpForLocal:
    String(process.env.SEC_ALLOW_HTTP_FOR_LOCAL || "true").toLowerCase() ===
    "true",
};
