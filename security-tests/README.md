# Security Test Suite (React Native + REST API)

This folder contains a runnable Jest security suite targeting your NestJS REST API and mobile client storage patterns.

## Files

- auth.security.test.js
- db.security.test.js
- search.security.test.js
- api.security.test.js
- storage.security.test.js
- authz.security.test.js
- helpers/securityTestUtils.js
- security.config.js

## Run

1. Install dependencies:

   npm install

2. Run all security tests:

   npm run test:security

You can override runtime config with environment variables (examples):

- SEC_API_BASE_URL=https://your-api-host/api
- SEC_SEARCH_ENDPOINT=/search
- SEC_PASSWORD_RESET_ENDPOINT=/auth/forgot-password
- SEC_RATE_LIMIT=100

---

## What this tests & why

### auth.security.test.js

- Verifies successful login returns a token so baseline auth flow is healthy.
- Verifies wrong password and unknown-user both return 401 and matching message profile, reducing account enumeration risk.
- Verifies protected endpoints reject no token, expired-like token, and tampered JWT.
- Verifies brute-force resistance by expecting lockout/rate-limit behavior after rapid failed attempts.
- Verifies password reset flow does not reveal whether an email exists.

### db.security.test.js

- Sends SQL injection payloads to login and search-like endpoint to ensure auth is not bypassed and server does not crash.
- Sends NoSQL-style object payloads to login to ensure type confusion does not bypass auth.
- Sends malformed IDs to guarded endpoints and checks error responses do not leak SQL internals or stack traces.
- Attempts mass assignment (role override) and verifies secure rejection or ignored privilege field.

### search.security.test.js

- Compares owner vs staff search/list responses to catch unauthorized overexposure.
- Sends special characters and very long query to ensure graceful handling (not 500).
- Verifies search/list endpoint is protected by auth.
- Attempts query-based IDOR tricks and ensures result scope does not expand.
- Verifies response objects do not expose sensitive fields (password/token/secret/hash).

### api.security.test.js

- Checks insecure HTTP behavior (redirect/reject) unless explicitly allowed for local HTTP.
- Verifies core security headers are present.
- Verifies CORS preflight from unauthorized origin is not allowed.
- Tests IDOR by trying read/update/delete on another user’s resource.
- Verifies alg:none JWT confusion payloads are rejected.
- Verifies token/password values are not echoed back from URL query processing.

### storage.security.test.js

- Statically verifies auth tokens are persisted via SecureStore and not directly to AsyncStorage.
- Verifies logout path clears secure token storage.
- Scans source for debug logs that include token/password/secret indicators.
- Scans filesystem write calls for likely sensitive auth data persistence.

### authz.security.test.js

- Verifies regular users cannot access owner/admin endpoints.
- Verifies role escalation attempts via PATCH payload are blocked.
- Verifies non-owners cannot delete foreign resources.
- Verifies missing/deleted resource paths return 404 and do not leak sensitive fields.
- Verifies request bursts over configured limit trigger 429.

---

## Package.json snippet

{
"scripts": {
"test": "jest",
"test:security": "jest --runInBand security-tests/\*_/_.security.test.js"
},
"devDependencies": {
"jest": "^29.7.0",
"supertest": "^7.1.1",
"@types/supertest": "^6.0.2"
}
}

---

## Next steps (manual security checks)

- Certificate pinning test from real devices (mitmproxy/Burp with rooted/test device).
- Dynamic interception tests for token refresh and replay at API gateway/load balancer level.
- Mobile binary/static analysis with MobSF and dependency SCA scan.
- Runtime hardening checks (root/jailbreak detection, anti-tamper, anti-debug if required).
- WAF/rate-limit verification behind production ingress/CDN, not only app server.
- Secrets exposure check in crash reports, analytics events, and remote logs.
