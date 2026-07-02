import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Test rate limit đăng nhập (lưu Postgres — xem migrations/0002_login_rate_limit.sql).
// Cần Postgres riêng qua TEST_DATABASE_URL, không có thì tự skip (xem tests/setup.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { loginBlockedSeconds, recordLoginFailure, recordLoginSuccess } from "../lib/ratelimit";

test("ratelimit: dưới 5 lần sai thì chưa khoá", { skip: !HAS_TEST_DB }, async () => {
  const ip = "10.0.0.1",
    email = "a@test.vn";
  for (let i = 0; i < 4; i++) await recordLoginFailure(ip, email);
  assert.equal(await loginBlockedSeconds(ip, email), 0);
});

test("ratelimit: 5 lần sai → khoá, trả số giây chờ > 0", { skip: !HAS_TEST_DB }, async () => {
  const ip = "10.0.0.2",
    email = "b@test.vn";
  for (let i = 0; i < 5; i++) await recordLoginFailure(ip, email);
  const wait = await loginBlockedSeconds(ip, email);
  assert.ok(wait > 0 && wait <= 15 * 60, `wait = ${wait}`);
});

test("ratelimit: đăng nhập đúng xoá đếm của cặp IP+email", { skip: !HAS_TEST_DB }, async () => {
  const ip = "10.0.0.3",
    email = "c@test.vn";
  for (let i = 0; i < 5; i++) await recordLoginFailure(ip, email);
  assert.ok((await loginBlockedSeconds(ip, email)) > 0);
  await recordLoginSuccess(ip, email);
  assert.equal(await loginBlockedSeconds(ip, email), 0);
});

test(
  "ratelimit: email khác trên cùng IP không bị khoá lây (dưới ngưỡng IP)",
  { skip: !HAS_TEST_DB },
  async () => {
    const ip = "10.0.0.4";
    for (let i = 0; i < 5; i++) await recordLoginFailure(ip, "d@test.vn");
    assert.ok((await loginBlockedSeconds(ip, "d@test.vn")) > 0);
    assert.equal(await loginBlockedSeconds(ip, "e@test.vn"), 0);
  },
);

test(
  "ratelimit: 20 lần sai trên 1 IP khoá mọi email từ IP đó",
  { skip: !HAS_TEST_DB },
  async () => {
    const ip = "10.0.0.5";
    for (let i = 0; i < 20; i++) await recordLoginFailure(ip, `user${i}@test.vn`);
    assert.ok((await loginBlockedSeconds(ip, "khac@test.vn")) > 0);
  },
);
