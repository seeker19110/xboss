import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { isSameOrigin, needsSameOriginCheck } from "@/lib/csrf";

// Unit thuần — không chạm DB, không cần tests/setup.ts.

function makeReq(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://xboss.local/api/test", { headers });
}

test("isSameOrigin: không có header origin → cho qua (dựa vào sameSite làm lớp chính)", () => {
  assert.equal(isSameOrigin(makeReq({ host: "xboss.local" })), true);
});

test("isSameOrigin: origin cùng host → cho qua", () => {
  assert.equal(isSameOrigin(makeReq({ host: "xboss.local", origin: "https://xboss.local" })), true);
});

test("isSameOrigin: origin khác host → chặn", () => {
  assert.equal(isSameOrigin(makeReq({ host: "xboss.local", origin: "https://evil.com" })), false);
});

test("isSameOrigin: origin không parse được (URL hỏng) → chặn", () => {
  assert.equal(isSameOrigin(makeReq({ host: "xboss.local", origin: "not-a-url" })), false);
});

// --- needsSameOriginCheck: cổng CSRF toàn cục ở proxy.ts ---

test("needsSameOriginCheck: method an toàn (GET/HEAD/OPTIONS) → không cần kiểm", () => {
  for (const m of ["GET", "HEAD", "OPTIONS", "get"])
    assert.equal(needsSameOriginCheck(m, "/api/tasks/1"), false);
});

test("needsSameOriginCheck: mọi method mutating trên route thường → phải kiểm", () => {
  for (const m of ["POST", "PATCH", "PUT", "DELETE", "post"])
    assert.equal(needsSameOriginCheck(m, "/api/tasks/1/approve"), true);
});

test("needsSameOriginCheck: nhóm không dùng cookie phiên được miễn", () => {
  assert.equal(needsSameOriginCheck("POST", "/api/v1/tasks"), false);
  assert.equal(needsSameOriginCheck("POST", "/api/cron/daily-report"), false);
  assert.equal(needsSameOriginCheck("POST", "/api/admin/traffic/ingest"), false);
});

test("needsSameOriginCheck: /api/admin/webhooks KHÔNG được miễn (route dùng cookie phiên)", () => {
  // Bẫy dễ mắc: tiền tố 'webhook' gợi ý endpoint nhận từ ngoài, nhưng đây là CRUD của Admin.
  assert.equal(needsSameOriginCheck("POST", "/api/admin/webhooks"), true);
  assert.equal(needsSameOriginCheck("DELETE", "/api/admin/webhooks/3"), true);
});
