import { test } from "node:test";
import assert from "node:assert/strict";
import { TRAFFIC_TOKEN_HEADER, trafficToken } from "@/lib/traffic-token";

test("TRAFFIC_TOKEN_HEADER: đúng tên header thống nhất giữa proxy và endpoint", () => {
  assert.equal(TRAFFIC_TOKEN_HEADER, "x-traffic-token");
});

test("trafficToken(): trả về đúng giá trị XBOSS_SECRET khi đã set", () => {
  const original = process.env.XBOSS_SECRET;
  try {
    process.env.XBOSS_SECRET = "bi-mat-test-123";
    assert.equal(trafficToken(), "bi-mat-test-123");
  } finally {
    if (original === undefined) delete process.env.XBOSS_SECRET;
    else process.env.XBOSS_SECRET = original;
  }
});

test("trafficToken(): trả về chuỗi fallback dev khi XBOSS_SECRET không được set", () => {
  const original = process.env.XBOSS_SECRET;
  try {
    delete process.env.XBOSS_SECRET;
    assert.equal(trafficToken(), "xboss-dev-secret-change-me");
  } finally {
    if (original === undefined) delete process.env.XBOSS_SECRET;
    else process.env.XBOSS_SECRET = original;
  }
});
