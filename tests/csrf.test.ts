import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/csrf";

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
