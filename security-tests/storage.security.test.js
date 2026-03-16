/**
 * React Native local-storage and data-exposure security tests.
 * Threats covered: plaintext token storage, incomplete logout cleanup,
 * secret leakage in debug logs, and unsafe filesystem persistence.
 *
 * Note: These tests are static CI checks against mobile source code and are
 * intentionally runtime-independent so they run in Node/Jest without emulators.
 */

const fs = require("fs");
const path = require("path");

const mobileSrcDir = path.resolve(__dirname, "..", "..", "mobile", "src");
const authStorePath = path.resolve(
  __dirname,
  "..",
  "..",
  "mobile",
  "src",
  "store",
  "authStore.ts",
);

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

describe("Local storage and client-side exposure security", () => {
  test("Auth tokens are written to secure storage and not directly to AsyncStorage", () => {
    const authStore = readText(authStorePath);

    expect(
      authStore.includes("SecureStore.setItemAsync(TOKEN_STORAGE_KEY"),
    ).toBe(true);

    const asyncTokenWriteRegex =
      /AsyncStorage\.(setItem|multiSet)\([^\n]*token/i;
    expect(asyncTokenWriteRegex.test(authStore)).toBe(false);
  });

  test("Logout flow clears auth tokens from secure storage", () => {
    const authStore = readText(authStorePath);

    expect(authStore.includes("clearStoredTokens")).toBe(true);
    expect(
      authStore.includes("SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY)"),
    ).toBe(true);
    expect(authStore.includes("logout: async")).toBe(true);
  });

  test("Mobile source does not log passwords/tokens/secrets to debug logs", () => {
    const files = walkFiles(mobileSrcDir);
    const dangerousLogRegex =
      /console\.(log|debug|warn|error)\([^\n]*(password|token|secret|refreshToken|authorization)/i;

    const violations = [];
    for (const file of files) {
      const text = readText(file);
      if (dangerousLogRegex.test(text)) {
        violations.push(path.relative(mobileSrcDir, file));
      }
    }

    expect(violations).toEqual([]);
  });

  test("Sensitive auth data is not intentionally written to filesystem", () => {
    const files = walkFiles(mobileSrcDir);
    const fileWriteRegex =
      /(writeAsStringAsync|copyAsync|writeFile|appendFile)/;
    const sensitiveRegex =
      /(password|token|refreshToken|accessToken|secret|authorization)/i;

    const violations = [];

    for (const file of files) {
      const text = readText(file);
      if (!fileWriteRegex.test(text)) continue;

      const lines = text.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (fileWriteRegex.test(line) && sensitiveRegex.test(line)) {
          violations.push(`${path.relative(mobileSrcDir, file)}:${index + 1}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
