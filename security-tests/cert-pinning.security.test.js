/**
 * Certificate pinning preflight security checks (source scanner).
 *
 * Manual Checklist: Certificate pinning validation and implementation guide
 * ------------------------------------------------------------------------
 * ## Burp Suite MitM setup
 * 1. Install Burp Suite Community on your laptop.
 * 2. Put phone and laptop on the same WiFi.
 * 3. In phone WiFi advanced settings, set proxy manually:
 *    - Host: your laptop LAN IP
 *    - Port: 8080
 * 4. Open browser on phone and visit http://burpsuite to install Burp CA cert.
 * 5. Launch the app and perform login/API actions.
 * 6. Interpretation:
 *    - If app traffic appears in Burp after installing CA, pinning is NOT enforced.
 *    - If app fails TLS handshake or shows certificate error while Burp CA is installed,
 *      pinning IS enforced.
 *
 * ## Implementing pinning in React Native (if missing)
 * - Recommended library: react-native-ssl-pinning
 * - Example:
 *   import { fetch } from 'react-native-ssl-pinning';
 *   await fetch('https://rent-monitoring-backend.onrender.com/api/health', {
 *     method: 'GET',
 *     timeoutInterval: 10000,
 *     sslPinning: {
 *       certs: ['rent_backend_cert'],
 *     },
 *     headers: {
 *       Accept: 'application/json',
 *     },
 *   });
 *
 * - Certificate pinning vs public key pinning:
 *   - Certificate pinning ties trust to a specific cert chain artifact and rotates whenever cert rotates.
 *   - Public key pinning ties trust to SPKI/public key and survives certificate renewals if key pair stays the same.
 *
 * - Operational note:
 *   Pinned certs/keys must be rotated before expiration. Maintain overlap windows,
 *   ship app update ahead of cert rollover, and keep backup pins for planned rotation.
 *
 * ## Passing vs failing outcomes
 * - Passing:
 *   Burp CA installed, app cannot establish API TLS session (fails closed).
 * - Failing:
 *   Burp can decrypt app API traffic with inserted CA (pinning absent/bypassed).
 */

const fs = require("fs");
const path = require("path");

jest.setTimeout(120000);

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");

const TEXT_FILE_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".tsx",
  ".json",
  ".yaml",
  ".yml",
  ".env",
  ".properties",
  ".md",
]);

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".expo",
  ".expo-smoke",
]);

const DEV_TEST_PATH_HINTS = [
  /[\\/](test|tests|__tests__|security-tests|spec|fixtures|mocks?|examples?)[\\/]/i,
  /\.dev\./i,
  /\.development\./i,
  /[\\/]seed\.ts$/i,
  /[\\/]android_backup[\\/]/i,
];

function normalizePath(p) {
  return p.replace(/\\/g, "/");
}

function isTextFile(filePath) {
  const base = path.basename(filePath);
  if (base.startsWith(".env")) return true;
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(ext);
}

function walkFiles(dirPath) {
  const out = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      out.push(...walkFiles(full));
      continue;
    }

    if (entry.isFile() && isTextFile(full)) {
      out.push(full);
    }
  }

  return out;
}

function isDevOrTestPath(filePath) {
  const n = normalizePath(filePath);
  return DEV_TEST_PATH_HINTS.some((re) => re.test(n));
}

function findPatternMatches(content, regex) {
  const hits = [];
  let m;
  const localRegex = new RegExp(regex.source, regex.flags);
  while ((m = localRegex.exec(content)) !== null) {
    hits.push({ index: m.index, match: m[0] });
    if (m.index === localRegex.lastIndex) {
      localRegex.lastIndex += 1;
    }
  }
  return hits;
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function formatFindings(findings, headers) {
  if (findings.length === 0) {
    return "(none)";
  }

  const rows = findings.map((f) => headers.map((h) => String(f[h] ?? "")));
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );

  const pad = (v, i) => v.padEnd(widths[i], " ");
  const sep = `+-${widths.map((w) => "-".repeat(w)).join("-+-")}-+`;
  const head = `| ${headers.map((h, i) => pad(h, i)).join(" | ")} |`;
  const body = rows.map(
    (r) => `| ${r.map((v, i) => pad(v, i)).join(" | ")} |`,
  );

  return [sep, head, sep, ...body, sep].join("\n");
}

function isLocalHttp(url) {
  return /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(url);
}

describe("Certificate pinning source controls", () => {
  let allFiles;

  beforeAll(() => {
    allFiles = walkFiles(WORKSPACE_ROOT);
  });

  test("No SSL validation disable patterns in non-dev/non-test code", () => {
    const patterns = [
      {
        name: "rejectUnauthorized:false",
        regex: /rejectUnauthorized\s*:\s*false/g,
      },
      {
        name: "ssl:{rejectUnauthorized:false}",
        regex: /ssl\s*:\s*\{[\s\S]{0,120}?rejectUnauthorized\s*:\s*false[\s\S]{0,120}?\}/g,
      },
      {
        name: "NODE_TLS_REJECT_UNAUTHORIZED=0",
        regex: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*0/g,
      },
    ];

    const findings = [];

    for (const filePath of allFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      const allowed = isDevOrTestPath(filePath);

      for (const p of patterns) {
        const hits = findPatternMatches(content, p.regex);
        for (const hit of hits) {
          if (allowed) continue;
          findings.push({
            file: normalizePath(path.relative(WORKSPACE_ROOT, filePath)),
            line: lineNumberForIndex(content, hit.index),
            pattern: p.name,
            snippet: hit.match.replace(/\s+/g, " ").slice(0, 120),
          });
        }
      }
    }

    if (findings.length > 0) {
      console.log(
        "\nForbidden TLS bypass patterns found:\n" +
          formatFindings(findings, ["file", "line", "pattern", "snippet"]),
      );
    }

    expect(findings).toHaveLength(0);
  });

  test("No committed .env file contains NODE_TLS_REJECT_UNAUTHORIZED=0", () => {
    const envFiles = allFiles.filter((f) => path.basename(f).startsWith(".env"));

    const findings = [];

    for (const filePath of envFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      const hits = findPatternMatches(
        content,
        /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*0/g,
      );

      for (const hit of hits) {
        findings.push({
          file: normalizePath(path.relative(WORKSPACE_ROOT, filePath)),
          line: lineNumberForIndex(content, hit.index),
          value: hit.match,
        });
      }
    }

    if (findings.length > 0) {
      console.log(
        "\nDisallowed env TLS bypass entries:\n" +
          formatFindings(findings, ["file", "line", "value"]),
      );
    }

    expect(findings).toHaveLength(0);
  });

  test("Production API base URL declarations use https:// (not http://)", () => {
    const urlKeyRegexes = [
      /(DEFAULT_API_BASE_URL|API_BASE_URL|EXPO_PUBLIC_API_URL|BACKEND_URL|PRODUCTION_API_URL|API_URL)\s*[:=]\s*["'`](http:\/\/[^"'`\s]+)["'`]/g,
      /^([A-Z0-9_]*(?:API|BACKEND|SERVER)[A-Z0-9_]*URL)\s*=\s*(http:\/\/[^\s#]+)/gm,
    ];

    const findings = [];

    for (const filePath of allFiles) {
      const rel = normalizePath(path.relative(WORKSPACE_ROOT, filePath));

      // Exclude security test fixtures/config where localhost http is intentional.
      if (/backend\/security-tests\//i.test(rel)) continue;

      const content = fs.readFileSync(filePath, "utf8");

      for (const re of urlKeyRegexes) {
        const hits = findPatternMatches(content, re);
        for (const hit of hits) {
          const httpUrlMatch = hit.match.match(/http:\/\/[^"'`\s]+/i);
          const httpUrl = httpUrlMatch ? httpUrlMatch[0] : "";
          if (!httpUrl) continue;
          if (isLocalHttp(httpUrl)) continue;

          findings.push({
            file: rel,
            line: lineNumberForIndex(content, hit.index),
            url: httpUrl,
            key: hit.match.slice(0, 120).replace(/\s+/g, " "),
          });
        }
      }
    }

    if (findings.length > 0) {
      console.log(
        "\nNon-HTTPS production API URL declarations:\n" +
          formatFindings(findings, ["file", "line", "url", "key"]),
      );
    }

    expect(findings).toHaveLength(0);
  });
});
