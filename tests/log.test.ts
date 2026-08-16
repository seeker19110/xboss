import { test } from "node:test";
import assert from "node:assert/strict";

// Test M44 PR3 — lib/log.ts. Không chạm DB nên không cần tests/setup.ts (chỉ dùng cho test
// chạm DB — xem CLAUDE.md/tests/setup.ts).

test("log.info (production): in 1 dòng JSON đủ trường t/level/msg", async () => {
  const { log } = await import("@/lib/log");
  const origEnv = process.env.NODE_ENV;
  const origConsoleLog = console.log;
  const calls: string[] = [];
  (process.env as Record<string, string>).NODE_ENV = "production";
  console.log = (s: string) => calls.push(s);
  try {
    log.info("test message", { route: "/api/test", foo: 1 });
  } finally {
    console.log = origConsoleLog;
    (process.env as Record<string, string>).NODE_ENV = origEnv ?? "";
  }
  assert.equal(calls.length, 1);
  const entry = JSON.parse(calls[0]);
  assert.equal(entry.level, "info");
  assert.equal(entry.msg, "test message");
  assert.equal(entry.route, "/api/test");
  assert.equal(entry.foo, 1);
  assert.equal(typeof entry.t, "string");
  assert.ok(!Number.isNaN(Date.parse(entry.t)));
});

test("log.error (production): dùng console.error, giữ nguyên level=error", async () => {
  const { log } = await import("@/lib/log");
  const origEnv = process.env.NODE_ENV;
  const origConsoleError = console.error;
  const calls: string[] = [];
  (process.env as Record<string, string>).NODE_ENV = "production";
  console.error = (s: string) => calls.push(s);
  try {
    log.error("lỗi nghiêm trọng");
  } finally {
    console.error = origConsoleError;
    (process.env as Record<string, string>).NODE_ENV = origEnv ?? "";
  }
  assert.equal(calls.length, 1);
  const entry = JSON.parse(calls[0]);
  assert.equal(entry.level, "error");
  assert.equal(entry.msg, "lỗi nghiêm trọng");
});

test("log.info: không throw khi chưa có request context (ngoài request scope)", async () => {
  const { log } = await import("@/lib/log");
  assert.doesNotThrow(() => log.info("không context"));
  assert.doesNotThrow(() => log.warn("không context"));
  assert.doesNotThrow(() => log.error("không context"));
});

test("log.info: đọc requestId/userId từ getRequestContext khi có ngữ cảnh", async () => {
  const { log } = await import("@/lib/log");
  const { runWithRequestContext } = await import("@/lib/request-context");
  const origEnv = process.env.NODE_ENV;
  const origConsoleLog = console.log;
  const calls: string[] = [];
  (process.env as Record<string, string>).NODE_ENV = "production";
  console.log = (s: string) => calls.push(s);
  try {
    runWithRequestContext({ requestId: "req-abc", userId: 42, role: "admin" }, () => {
      log.info("có ngữ cảnh");
    });
  } finally {
    console.log = origConsoleLog;
    (process.env as Record<string, string>).NODE_ENV = origEnv ?? "";
  }
  assert.equal(calls.length, 1);
  const entry = JSON.parse(calls[0]);
  assert.equal(entry.requestId, "req-abc");
  assert.equal(entry.userId, 42);
});

test("log.warn (dev, NODE_ENV khác production): không throw, in dòng có nhãn [WARN]", async () => {
  const { log } = await import("@/lib/log");
  const origEnv = process.env.NODE_ENV;
  const origConsoleWarn = console.warn;
  const calls: string[] = [];
  (process.env as Record<string, string>).NODE_ENV = "development";
  console.warn = (s: string) => calls.push(s);
  try {
    log.warn("cảnh báo dev", { foo: "bar" });
  } finally {
    console.warn = origConsoleWarn;
    (process.env as Record<string, string>).NODE_ENV = origEnv ?? "";
  }
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\[WARN\]/);
  assert.match(calls[0], /cảnh báo dev/);
});

// ===== C4 §6 — Log redaction: secret/token/password không được xuất hiện nguyên văn =====

// method: console cần chặn — khớp đúng hàm mà level tương ứng dùng bên trong lib/log.ts
// (error→console.error, warn→console.warn, info→console.log).
async function captureProdLog(
  fn: () => void,
  method: "log" | "warn" | "error" = "error",
): Promise<Record<string, unknown>> {
  const origEnv = process.env.NODE_ENV;
  const orig = console[method];
  const calls: string[] = [];
  (process.env as Record<string, string>).NODE_ENV = "production";
  console[method] = (s: string) => calls.push(s);
  try {
    fn();
  } finally {
    console[method] = orig;
    (process.env as Record<string, string>).NODE_ENV = origEnv ?? "";
  }
  assert.equal(calls.length, 1);
  return JSON.parse(calls[0]) as Record<string, unknown>;
}

test("redaction: field tên nhạy cảm (password/token/secret/apiKey) bị thay bằng [REDACTED]", async () => {
  const { log } = await import("@/lib/log");
  const entry = await captureProdLog(() => {
    log.error("lỗi đăng nhập", {
      password: "mat-khau-that-123",
      accessToken: "gia-tri-bi-mat",
      XBOSS_SECRET: "chuoi-ky-cookie",
      apiKey: "khoa-api-that",
      Authorization: "Bearer xyz",
      note: "field bình thường phải giữ nguyên",
    });
  });
  assert.equal(entry.password, "[REDACTED]");
  assert.equal(entry.accessToken, "[REDACTED]");
  assert.equal(entry.XBOSS_SECRET, "[REDACTED]");
  assert.equal(entry.apiKey, "[REDACTED]");
  assert.equal(entry.Authorization, "[REDACTED]");
  assert.equal(entry.note, "field bình thường phải giữ nguyên");
});

test("redaction: khớp không phân biệt hoa/thường và khi tên trường là 1 phần của key dài hơn", async () => {
  const { log } = await import("@/lib/log");
  const entry = await captureProdLog(() => {
    log.error("test", { dbPassword: "x", userToken: "y", PRIVATE_KEY: "z", cookieValue: "w" });
  });
  assert.equal(entry.dbPassword, "[REDACTED]");
  assert.equal(entry.userToken, "[REDACTED]");
  assert.equal(entry.PRIVATE_KEY, "[REDACTED]");
  assert.equal(entry.cookieValue, "[REDACTED]");
});

test("redaction: đệ quy vào object/mảng lồng nhau", async () => {
  const { log } = await import("@/lib/log");
  const entry = await captureProdLog(() => {
    log.error("test", {
      detail: { headers: { authorization: "Bearer abc" }, ok: true },
      items: [{ token: "t1" }, { token: "t2" }],
    });
  });
  const detail = entry.detail as { headers: { authorization: string }; ok: boolean };
  assert.equal(detail.headers.authorization, "[REDACTED]");
  assert.equal(detail.ok, true);
  const items = entry.items as { token: string }[];
  assert.equal(items[0].token, "[REDACTED]");
  assert.equal(items[1].token, "[REDACTED]");
});

test("redaction: mật khẩu trong connection string Postgres bị che, phần còn lại giữ nguyên", async () => {
  const { log } = await import("@/lib/log");
  const entry = await captureProdLog(() => {
    log.error("kết nối DB lỗi", {
      err: "connect ECONNREFUSED postgres://xboss_app:MatKhauThat123@10.0.0.5:5432/xboss",
    });
  });
  const err = entry.err as string;
  assert.ok(!err.includes("MatKhauThat123"), "mật khẩu không được xuất hiện nguyên văn");
  assert.ok(err.includes("postgres://xboss_app:[REDACTED]@10.0.0.5:5432/xboss"));
  assert.ok(err.includes("ECONNREFUSED"), "phần message còn lại phải giữ nguyên để còn debug được");
});

test("redaction: chuỗi 'Bearer <token>' và API key thô xbk_... trong message bị che", async () => {
  const { log } = await import("@/lib/log");
  const entry = await captureProdLog(() => {
    log.warn("OIDC callback đổi token lỗi", {
      error: "token_exchange_failed: header Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def",
    });
  }, "warn");
  const error = entry.error as string;
  assert.ok(!error.includes("eyJhbGciOiJIUzI1NiJ9.abc.def"), "JWT không được lộ nguyên văn");
  assert.match(error, /Bearer \[REDACTED\]/);

  const entry2 = await captureProdLog(() => {
    log.error("dùng nhầm key trong log debug", {
      hint: "key gửi lên là xbk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });
  assert.ok(!(entry2.hint as string).includes("xbk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
});

test("redaction: chuỗi dạng JWT độc lập (không đứng sau 'Bearer') cũng bị che", async () => {
  const { log } = await import("@/lib/log");
  // JWT mẫu công khai của jwt.io (header/payload rỗng ý nghĩa, chữ ký minh hoạ) — không
  // phải bí mật thật, nhưng đúng cấu trúc JWT nên gitleaks báo nhầm theo rule "jwt".
  // gitleaks:allow
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const entry = await captureProdLog(() => {
    log.error("id_token nhận được", { idToken: jwt });
  });
  assert.equal(entry.idToken, "[REDACTED]"); // field "idToken" khớp cả theo TÊN lẫn GIÁ TRỊ
});

test("redaction: message (tham số msg) cũng được quét, không chỉ fields", async () => {
  const { log } = await import("@/lib/log");
  const entry = await captureProdLog(() => {
    log.error("Lỗi kết nối postgres://app:BiMat456@db:5432/x xảy ra khi khởi động");
  });
  assert.ok(!(entry.msg as string).includes("BiMat456"));
});

test("redaction: KHÔNG động vào field/chuỗi bình thường (không báo nhầm)", async () => {
  const { log } = await import("@/lib/log");
  const entry = await captureProdLog(() => {
    log.info("Import hoàn tất", {
      route: "/api/import/excel",
      taskCount: 42,
      fileName: "tracking.xlsx",
      note: "Mã hợp đồng HD-2026-001, không phải bí mật",
    });
  }, "log");
  assert.equal(entry.route, "/api/import/excel");
  assert.equal(entry.taskCount, 42);
  assert.equal(entry.fileName, "tracking.xlsx");
  assert.equal(entry.note, "Mã hợp đồng HD-2026-001, không phải bí mật");
});
