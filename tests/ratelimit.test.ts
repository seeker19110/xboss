// Test rate limit đăng nhập (in-memory, không cần DB).
import test from "node:test";
import assert from "node:assert/strict";
import { loginBlockedSeconds, recordLoginFailure, recordLoginSuccess } from "../lib/ratelimit";

test("ratelimit: dưới 5 lần sai thì chưa khoá", () => {
  const ip = "10.0.0.1", email = "a@test.vn";
  for (let i = 0; i < 4; i++) recordLoginFailure(ip, email);
  assert.equal(loginBlockedSeconds(ip, email), 0);
});

test("ratelimit: 5 lần sai → khoá, trả số giây chờ > 0", () => {
  const ip = "10.0.0.2", email = "b@test.vn";
  for (let i = 0; i < 5; i++) recordLoginFailure(ip, email);
  const wait = loginBlockedSeconds(ip, email);
  assert.ok(wait > 0 && wait <= 15 * 60, `wait = ${wait}`);
});

test("ratelimit: đăng nhập đúng xoá đếm của cặp IP+email", () => {
  const ip = "10.0.0.3", email = "c@test.vn";
  for (let i = 0; i < 5; i++) recordLoginFailure(ip, email);
  assert.ok(loginBlockedSeconds(ip, email) > 0);
  recordLoginSuccess(ip, email);
  assert.equal(loginBlockedSeconds(ip, email), 0);
});

test("ratelimit: email khác trên cùng IP không bị khoá lây (dưới ngưỡng IP)", () => {
  const ip = "10.0.0.4";
  for (let i = 0; i < 5; i++) recordLoginFailure(ip, "d@test.vn");
  assert.ok(loginBlockedSeconds(ip, "d@test.vn") > 0);
  assert.equal(loginBlockedSeconds(ip, "e@test.vn"), 0);
});

test("ratelimit: 20 lần sai trên 1 IP khoá mọi email từ IP đó", () => {
  const ip = "10.0.0.5";
  for (let i = 0; i < 20; i++) recordLoginFailure(ip, `user${i}@test.vn`);
  assert.ok(loginBlockedSeconds(ip, "khac@test.vn") > 0);
});
