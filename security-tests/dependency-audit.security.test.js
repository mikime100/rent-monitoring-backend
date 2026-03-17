/**
 * Dependency security audit tests.
 *
 * This suite runs npm native audit/outdated commands and enforces a strict
 * policy for high and critical vulnerabilities.
 *
 * -----------------------------------------------------------------------------
 * Manual Binary Analysis Checklist (MobSF) - Markdown Comments
 * -----------------------------------------------------------------------------
 * ## Android APK and iOS IPA MobSF workflow
 *
 * 1. Build release artifacts:
 *    - Android: generate signed APK or AAB and keep the APK artifact.
 *    - iOS: generate release IPA from CI/CD or Xcode archive export.
 *
 * 2. Start MobSF:
 *    - Docker example:
 *      - docker pull opensecurity/mobile-security-framework-mobsf
 *      - docker run -it -p 8000:8000 opensecurity/mobile-security-framework-mobsf
 *
 * 3. Open MobSF UI:
 *    - Navigate to http://localhost:8000
 *    - Upload APK and IPA separately.
 *
 * 4. Review static analysis findings for each binary:
 *    - Hardcoded secrets/API keys:
 *      - Look for embedded API keys, JWT secrets, cloud tokens, private endpoints.
 *      - Prioritize any credential that grants write/admin scope.
 *    - Insecure data storage:
 *      - Check for cleartext token/cache persistence.
 *      - Verify secure keystore/keychain usage and encrypted local storage.
 *    - Weak cryptography:
 *      - Flag MD5/SHA1/DES/ECB usage, hardcoded IVs, static keys.
 *      - Verify TLS pinning decisions and crypto library hygiene.
 *    - Exported Android components:
 *      - Review exported activities/services/receivers/providers.
 *      - Confirm sensitive components require permissions and auth checks.
 *    - iOS ATS configuration:
 *      - Inspect NSAppTransportSecurity exceptions.
 *      - Block broad allows like NSAllowsArbitraryLoads unless explicitly justified.
 *
 * 5. Dynamic checks after static pass:
 *    - Trigger auth/login, token refresh, file upload, payment actions.
 *    - Watch MobSF runtime/network traces for secret exposure and insecure traffic.
 *
 * 6. Interpreting MobSF security score:
 *    - 90-100: strong baseline, still verify critical findings manually.
 *    - 75-89: medium risk, remediation required before production unless accepted by risk owner.
 *    - below 75: high risk posture.
 *
 * 7. Release gate threshold recommendation:
 *    - Block release if score is below 85.
 *    - Block release if any critical finding exists, regardless of score.
 *    - Require explicit security sign-off for any temporary exception.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

jest.setTimeout(180000);

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, "package.json");
const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";

const SECURITY_HISTORY_PACKAGES = ["lodash", "axios", "jsonwebtoken", "express"];

function runNpmJson(args, options = {}) {
  const { allowNonZero = false } = options;

  const proc = spawnSync(NPM_CMD, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });

  const stdout = (proc.stdout || "").trim();
  const stderr = (proc.stderr || "").trim();

  if (proc.error) {
    throw proc.error;
  }

  if (!allowNonZero && proc.status !== 0) {
    throw new Error(
      `Command failed: npm ${args.join(" ")}\nExit: ${proc.status}\n${stderr || stdout}`,
    );
  }

  const rawJson = stdout || (stderr.startsWith("{") ? stderr : "{}");

  try {
    return JSON.parse(rawJson);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON from: npm ${args.join(" ")}\nRaw output:\n${rawJson.slice(0, 4000)}`,
    );
  }
}

function formatTable(rows, headers) {
  const widths = headers.map((h, i) => {
    const maxCell = rows.reduce((max, row) => {
      const value = String(row[i] ?? "");
      return Math.max(max, value.length);
    }, 0);
    return Math.max(h.length, maxCell);
  });

  const pad = (value, width) => String(value).padEnd(width, " ");

  const sep = `+-${widths.map((w) => "-".repeat(w)).join("-+-")}-+`;
  const head = `| ${headers.map((h, i) => pad(h, widths[i])).join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${row.map((c, i) => pad(c, widths[i])).join(" | ")} |`,
  );

  return [sep, head, sep, ...body, sep].join("\n");
}

function severityRank(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "critical") return 4;
  if (s === "high") return 3;
  if (s === "moderate") return 2;
  if (s === "low") return 1;
  return 0;
}

function parseAuditVulnerabilities(auditJson) {
  const rows = [];

  if (auditJson && auditJson.vulnerabilities) {
    for (const [pkg, vuln] of Object.entries(auditJson.vulnerabilities)) {
      const severity = String(vuln.severity || "unknown").toLowerCase();

      let description = "No description available";
      if (Array.isArray(vuln.via) && vuln.via.length > 0) {
        const firstObject = vuln.via.find((v) => typeof v === "object");
        if (firstObject && firstObject.title) {
          description = firstObject.title;
        } else if (typeof vuln.via[0] === "string") {
          description = `via ${vuln.via[0]}`;
        }
      }

      let fix = "Review advisory and update manually";
      if (vuln.fixAvailable === true) {
        fix = "Run npm audit fix";
      } else if (vuln.fixAvailable && typeof vuln.fixAvailable === "object") {
        const target = vuln.fixAvailable.name || pkg;
        const version = vuln.fixAvailable.version || "latest";
        const major = vuln.fixAvailable.isSemVerMajor ? " (major)" : "";
        fix = `Update ${target} to ${version}${major}`;
      }

      rows.push({
        package: pkg,
        severity,
        description,
        fix,
      });
    }
  }

  if (rows.length === 0 && auditJson && auditJson.advisories) {
    for (const advisory of Object.values(auditJson.advisories)) {
      rows.push({
        package: advisory.module_name || "unknown",
        severity: String(advisory.severity || "unknown").toLowerCase(),
        description: advisory.title || "No description available",
        fix: advisory.recommendation || "Update dependency",
      });
    }
  }

  return rows.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function extractMajor(version) {
  const match = String(version || "").match(/(\d+)/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

describe("Dependency audit security", () => {
  test("npm audit has no high or critical vulnerabilities", () => {
    const auditJson = runNpmJson(["audit", "--json"], { allowNonZero: true });
    const vulnerabilities = parseAuditVulnerabilities(auditJson);

    const highOrCritical = vulnerabilities.filter((v) =>
      ["high", "critical"].includes(v.severity),
    );
    const moderate = vulnerabilities.filter((v) => v.severity === "moderate");

    if (vulnerabilities.length > 0) {
      const table = formatTable(
        vulnerabilities.map((v) => [v.package, v.severity, v.description, v.fix]),
        ["Package", "Severity", "Description", "Fix Recommendation"],
      );
      console.log("\nDependency vulnerability report:\n" + table);
    }

    if (moderate.length > 0) {
      console.warn(
        `\nWARN: ${moderate.length} moderate vulnerabilities found. These do not fail this gate but should be remediated soon.`,
      );
    }

    expect(highOrCritical).toHaveLength(0);
  });

  test("dependencies are not more than 2 major versions behind latest", () => {
    if (!fs.existsSync(PACKAGE_JSON_PATH)) {
      throw new Error(`Missing package.json at ${PACKAGE_JSON_PATH}`);
    }

    const outdated = runNpmJson(["outdated", "--json"], { allowNonZero: true });
    const entries = Object.entries(outdated || {});

    const behindByMajor = [];
    const securityHistoryFlags = [];

    for (const [pkg, info] of entries) {
      const currentMajor = extractMajor(info.current);
      const latestMajor = extractMajor(info.latest);
      const behind =
        Number.isInteger(currentMajor) && Number.isInteger(latestMajor)
          ? latestMajor - currentMajor
          : null;

      if (behind !== null && behind > 2) {
        behindByMajor.push({
          package: pkg,
          current: info.current,
          latest: info.latest,
          majorBehind: behind,
        });
      }

      if (SECURITY_HISTORY_PACKAGES.includes(pkg)) {
        securityHistoryFlags.push({
          package: pkg,
          current: info.current,
          latest: info.latest,
          wanted: info.wanted,
          majorBehind: behind,
        });
      }
    }

    if (behindByMajor.length > 0) {
      const table = formatTable(
        behindByMajor.map((r) => [r.package, r.current, r.latest, r.majorBehind]),
        ["Package", "Current", "Latest", "Major Versions Behind"],
      );
      console.log("\nPackages more than 2 majors behind:\n" + table);
    }

    if (securityHistoryFlags.length > 0) {
      const table = formatTable(
        securityHistoryFlags.map((r) => [
          r.package,
          r.current,
          r.wanted,
          r.latest,
          r.majorBehind === null ? "n/a" : r.majorBehind,
        ]),
        ["Security-Sensitive Package", "Current", "Wanted", "Latest", "Major Behind"],
      );
      console.warn("\nWARN: security-relevant packages found in outdated report:\n" + table);
    }

    expect(behindByMajor).toHaveLength(0);
  });
});
