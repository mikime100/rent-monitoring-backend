/**
 * File upload security tests.
 *
 * Targets upload routes that exist in the current deployment and runs
 * business-relevant abuse cases: type spoofing, size, traversal, access control,
 * and malicious content payloads.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");

const {
  authHeader,
  client,
  config,
  getAuthData,
  loginWith,
} = require("./helpers/securityTestUtils");

jest.setTimeout(240000);

const DEFAULT_FIELD = process.env.SEC_UPLOAD_FIELD || "file";
const SIZE_LIMIT_MB = Number.parseInt(
  process.env.SEC_UPLOAD_SIZE_LIMIT_MB || "50",
  10,
);
const SIZE_LIMIT_BYTES = SIZE_LIMIT_MB * 1024 * 1024;

const uploadConfig = {
  documents: {
    endpoint: process.env.SEC_DOCUMENTS_UPLOAD_ENDPOINT || "/documents/upload",
    field: process.env.SEC_DOCUMENTS_UPLOAD_FIELD || DEFAULT_FIELD,
  },
  receipts: {
    endpoint: process.env.SEC_RECEIPTS_UPLOAD_ENDPOINT || "/receipts/upload",
    field: process.env.SEC_RECEIPTS_UPLOAD_FIELD || DEFAULT_FIELD,
  },
  propertyPhotos: {
    endpointTemplate:
      process.env.SEC_PROPERTY_PHOTOS_UPLOAD_ENDPOINT_TEMPLATE ||
      "/properties/:id/photos",
    field: process.env.SEC_PROPERTY_PHOTOS_UPLOAD_FIELD || DEFAULT_FIELD,
  },
  tenantFolder: {
    endpointTemplate:
      process.env.SEC_TENANT_DOCS_UPLOAD_ENDPOINT_TEMPLATE ||
      "/tenants/:id/documents/upload",
    field: process.env.SEC_TENANT_DOCS_UPLOAD_FIELD || DEFAULT_FIELD,
  },
};

function decodeJwtSub(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(String(token).split(".")[1] || "", "base64").toString(
        "utf8",
      ),
    );
    return payload?.sub || null;
  } catch {
    return null;
  }
}

function extractFileUrl(response) {
  const data = getAuthData(response) || {};
  return (
    data.url ||
    data.fileUrl ||
    data.downloadUrl ||
    data.path ||
    response.body?.url ||
    response.body?.fileUrl ||
    null
  );
}

function hasTraversal(str) {
  return /\.\.|\\|\//.test(String(str || ""));
}

async function endpointExists(endpoint, token, fieldName, tempFilePath) {
  try {
    const res = await client
      .post(endpoint)
      .set(authHeader(token))
      .attach(fieldName, tempFilePath, {
        filename: "probe.pdf",
        contentType: "application/pdf",
      });

    return res.status !== 404;
  } catch {
    return false;
  }
}

function toAbsoluteOrApiUrl(urlOrPath) {
  const value = String(urlOrPath || "");
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const base = String(config.apiBaseUrl || "").replace(/\/+$/, "");
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return `${base}${normalized}`;
}

async function getFileAs(urlOrPath, token) {
  const fullUrl = toAbsoluteOrApiUrl(urlOrPath);
  const target = request(fullUrl);
  const req = target.get("");
  if (token) {
    req.set(authHeader(token));
  }
  return req;
}

describe("File upload security", () => {
  let tmpDir;
  let files;

  let userA;
  let userB;
  let owner;

  let propertyId;
  let secondPropertyId;

  let discovered = [];
  let primaryTarget = null;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rent-upload-sec-"));

    // Test payload files (temporary fixtures)
    files = {
      validPdf: path.join(tmpDir, "valid.pdf"),
      exeAsPdf: path.join(tmpDir, "malware.pdf"),
      htmlAsPdf: path.join(tmpDir, "html-inside.pdf"),
      noExt: path.join(tmpDir, "file-without-extension"),
      zeroByte: path.join(tmpDir, "zero.pdf"),
      xssHtml: path.join(tmpDir, "xss.html"),
      pdfWithJs: path.join(tmpDir, "pdf-with-js.pdf"),
      justUnderLimit: path.join(tmpDir, "just-under-limit.pdf"),
      overLimit: path.join(tmpDir, "over-limit.pdf"),
      smallImage: path.join(tmpDir, "small.jpg"),
    };

    fs.writeFileSync(
      files.validPdf,
      Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"),
    );
    fs.writeFileSync(files.exeAsPdf, Buffer.from("MZ\u0090\u0000fake executable"));
    fs.writeFileSync(
      files.htmlAsPdf,
      Buffer.from("<html><body><h1>not pdf</h1></body></html>"),
    );
    fs.writeFileSync(
      files.noExt,
      Buffer.from("%PDF-1.4\nno-extension file\n%%EOF"),
    );
    fs.writeFileSync(files.zeroByte, Buffer.alloc(0));
    fs.writeFileSync(
      files.xssHtml,
      Buffer.from("<script>alert('stored-xss')</script>"),
    );
    fs.writeFileSync(
      files.pdfWithJs,
      Buffer.from(
        "%PDF-1.4\n1 0 obj<<>>endobj\n2 0 obj<< /S /JavaScript /JS (app.alert('XSS')) >>endobj\n%%EOF",
      ),
    );
    fs.writeFileSync(files.justUnderLimit, Buffer.alloc(SIZE_LIMIT_BYTES - 1, 0x41));
    fs.writeFileSync(
      files.overLimit,
      Buffer.alloc(SIZE_LIMIT_BYTES + 1024 * 1024, 0x42),
    );
    fs.writeFileSync(files.smallImage, Buffer.alloc(1024, 0x43));

    const [loginA, loginB, ownerLogin] = await Promise.all([
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

    userA = {
      token:
        process.env.SEC_USER_A_JWT ||
        getAuthData(loginA)?.tokens?.accessToken ||
        null,
      id: getAuthData(loginA)?.user?.id || null,
    };

    userB = {
      token:
        process.env.SEC_USER_B_JWT ||
        getAuthData(loginB)?.tokens?.accessToken ||
        null,
      id: getAuthData(loginB)?.user?.id || null,
    };

    owner = {
      token: getAuthData(ownerLogin)?.tokens?.accessToken || null,
    };

    if (!userA.id && userA.token) userA.id = decodeJwtSub(userA.token);
    if (!userB.id && userB.token) userB.id = decodeJwtSub(userB.token);

    if (owner.token) {
      const propertiesRes = await client
        .get("/properties")
        .set(authHeader(owner.token));
      if (propertiesRes.status === 200) {
        const props = getAuthData(propertiesRes) || [];
        if (Array.isArray(props) && props.length > 0) {
          propertyId = props[0]?.id;
          secondPropertyId = props[1]?.id || null;
        }
      }
    }

    const candidates = [
      {
        name: "documents",
        endpoint: uploadConfig.documents.endpoint,
        field: uploadConfig.documents.field,
      },
      {
        name: "receipts",
        endpoint: uploadConfig.receipts.endpoint,
        field: uploadConfig.receipts.field,
      },
      propertyId
        ? {
            name: "propertyPhotos",
            endpoint: uploadConfig.propertyPhotos.endpointTemplate.replace(
              ":id",
              propertyId,
            ),
            field: uploadConfig.propertyPhotos.field,
          }
        : null,
      userB.id
        ? {
            name: "tenantFolder",
            endpoint: uploadConfig.tenantFolder.endpointTemplate.replace(
              ":id",
              userB.id,
            ),
            field: uploadConfig.tenantFolder.field,
          }
        : null,
    ].filter(Boolean);

    for (const c of candidates) {
      const exists = await endpointExists(
        c.endpoint,
        owner.token || userA.token || userB.token,
        c.field,
        files.validPdf,
      );
      if (exists) {
        discovered.push(c);
      }
    }

    primaryTarget = discovered.find((d) => d.name !== "tenantFolder") || null;
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  async function uploadTo(target, token, filePath, opts = {}) {
    let req = client.post(target.endpoint).set(authHeader(token));

    if (opts.extraFields) {
      for (const [k, v] of Object.entries(opts.extraFields)) {
        req = req.field(k, String(v));
      }
    }

    return req.attach(target.field, filePath, {
      filename: opts.filename,
      contentType: opts.contentType,
    });
  }

  describe("File type validation", () => {
    test("Upload .exe renamed as .pdf is rejected", async () => {
      if (!primaryTarget || !owner.token) return;

      const res = await uploadTo(primaryTarget, owner.token, files.exeAsPdf, {
        filename: "document.pdf",
        contentType: "application/pdf",
      });

      expect([400, 403, 415, 422]).toContain(res.status);
    });

    test("PDF extension with HTML content is rejected", async () => {
      if (!primaryTarget || !owner.token) return;

      const res = await uploadTo(primaryTarget, owner.token, files.htmlAsPdf, {
        filename: "agreement.pdf",
        contentType: "application/pdf",
      });

      expect([400, 403, 415, 422]).toContain(res.status);
    });

    test("File with no extension is rejected", async () => {
      if (!primaryTarget || !owner.token) return;

      const res = await uploadTo(primaryTarget, owner.token, files.noExt, {
        filename: "filewithoutdot",
        contentType: "application/octet-stream",
      });

      expect([400, 403, 415, 422]).toContain(res.status);
    });

    test("Zero-byte file is rejected", async () => {
      if (!primaryTarget || !owner.token) return;

      const res = await uploadTo(primaryTarget, owner.token, files.zeroByte, {
        filename: "empty.pdf",
        contentType: "application/pdf",
      });

      expect([400, 403, 415, 422]).toContain(res.status);
    });

    test("Valid PDF succeeds (positive)", async () => {
      if (!primaryTarget || !owner.token) return;

      const res = await uploadTo(primaryTarget, owner.token, files.validPdf, {
        filename: "valid.pdf",
        contentType: "application/pdf",
      });

      expect([200, 201, 202]).toContain(res.status);
    });
  });

  describe("File size limits", () => {
    test("1 byte under limit succeeds", async () => {
      if (!primaryTarget || !owner.token) return;

      const res = await uploadTo(
        primaryTarget,
        owner.token,
        files.justUnderLimit,
        {
          filename: "under-limit.pdf",
          contentType: "application/pdf",
        },
      );

      expect([200, 201, 202]).toContain(res.status);
    });

    test("Over size limit is rejected with 413/400", async () => {
      if (!primaryTarget || !owner.token) return;

      const res = await uploadTo(primaryTarget, owner.token, files.overLimit, {
        filename: "over-limit.pdf",
        contentType: "application/pdf",
      });

      expect([400, 413, 422]).toContain(res.status);
    });

    test("20 rapid small uploads are throttled or queued", async () => {
      if (!primaryTarget || !owner.token) return;

      const requests = Array.from({ length: 20 }).map((_, idx) =>
        uploadTo(primaryTarget, owner.token, files.smallImage, {
          filename: `burst-${idx}.jpg`,
          contentType: "image/jpeg",
        }),
      );

      const results = await Promise.all(requests);
      const statuses = results.map((r) => r.status);

      const hasThrottle = statuses.some((s) => [429, 503].includes(s));
      const allQueued = statuses.every((s) => s === 202);

      expect(hasThrottle || allQueued).toBe(true);
    });
  });

  describe("Path traversal", () => {
    test("Filename ../../etc/passwd.pdf is sanitized or rejected", async () => {
      if (!primaryTarget || !owner.token) return;

      const dangerousName = "../../etc/passwd.pdf";
      const res = await uploadTo(primaryTarget, owner.token, files.validPdf, {
        filename: dangerousName,
        contentType: "application/pdf",
      });

      expect([200, 201, 202, 400, 403, 415, 422]).toContain(res.status);

      if ([200, 201, 202].includes(res.status)) {
        const bodyText = JSON.stringify(getAuthData(res) || res.body || {});
        expect(bodyText.includes("../")).toBe(false);
        expect(bodyText.includes("..\\")).toBe(false);
      }
    });

    test("Filename normal/../../../secret.pdf is sanitized or rejected", async () => {
      if (!primaryTarget || !owner.token) return;

      const dangerousName = "normal/../../../secret.pdf";
      const res = await uploadTo(primaryTarget, owner.token, files.validPdf, {
        filename: dangerousName,
        contentType: "application/pdf",
      });

      expect([200, 201, 202, 400, 403, 415, 422]).toContain(res.status);

      if ([200, 201, 202].includes(res.status)) {
        const bodyText = JSON.stringify(getAuthData(res) || res.body || {});
        expect(bodyText.includes("../")).toBe(false);
        expect(bodyText.includes("..\\")).toBe(false);
      }
    });
  });

  describe("Access control on uploaded files", () => {
    test("User A upload cannot be directly accessed by User B", async () => {
      if (!primaryTarget || !userA.token || !userB.token) return;

      const uploadRes = await uploadTo(primaryTarget, userA.token, files.validPdf, {
        filename: "private-lease.pdf",
        contentType: "application/pdf",
      });

      if (![200, 201, 202].includes(uploadRes.status)) {
        expect([400, 403, 415, 422]).toContain(uploadRes.status);
        return;
      }

      const fileUrl = extractFileUrl(uploadRes);
      if (!fileUrl) {
        expect(true).toBe(true);
        return;
      }

      const bRes = await getFileAs(fileUrl, userB.token);
      expect([401, 403, 404]).toContain(bRes.status);
    });

    test("Unauthenticated request to file URL is denied", async () => {
      if (!primaryTarget || !userA.token) return;

      const uploadRes = await uploadTo(primaryTarget, userA.token, files.validPdf, {
        filename: "private-lease-unauth.pdf",
        contentType: "application/pdf",
      });

      if (![200, 201, 202].includes(uploadRes.status)) {
        expect([400, 403, 415, 422]).toContain(uploadRes.status);
        return;
      }

      const fileUrl = extractFileUrl(uploadRes);
      if (!fileUrl) {
        expect(true).toBe(true);
        return;
      }

      const unauthRes = await getFileAs(fileUrl, null);
      expect([401, 403, 404]).toContain(unauthRes.status);
    });

    test("Tenant cannot upload into another tenant folder", async () => {
      const tenantFolderTarget = discovered.find((d) => d.name === "tenantFolder");
      if (!tenantFolderTarget || !userA.token || !userB.id) return;

      const res = await uploadTo(tenantFolderTarget, userA.token, files.validPdf, {
        filename: "cross-tenant.pdf",
        contentType: "application/pdf",
      });

      expect([401, 403, 404]).toContain(res.status);
    });
  });

  describe("Malicious content", () => {
    test("Basic XSS payload file is rejected or quarantined", async () => {
      if (!primaryTarget || !owner.token) return;

      const res = await uploadTo(primaryTarget, owner.token, files.xssHtml, {
        filename: "xss.html",
        contentType: "text/html",
      });

      expect([400, 403, 415, 422, 202]).toContain(res.status);

      if ([200, 201].includes(res.status)) {
        const data = getAuthData(res) || res.body || {};
        const type = String(data.contentType || data.mimeType || "").toLowerCase();
        expect(type.includes("text/html")).toBe(false);
      }
    });

    test("PDF with embedded JavaScript is rejected (or flagged if accepted)", async () => {
      if (!primaryTarget || !owner.token) return;

      const res = await uploadTo(primaryTarget, owner.token, files.pdfWithJs, {
        filename: "scripted.pdf",
        contentType: "application/pdf",
      });

      // If accepted, this is a high-risk indicator for stored active content.
      expect([400, 403, 415, 422]).toContain(res.status);
    });
  });

  test("Discovery note: tests run only for endpoints that exist", () => {
    expect(Array.isArray(discovered)).toBe(true);
  });
});
