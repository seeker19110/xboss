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
