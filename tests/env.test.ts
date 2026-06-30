import { test } from "node:test";
import assert from "node:assert/strict";
import { parseServerEnv, getServerEnv, __resetServerEnvCache } from "@/lib/env";

test("parseServerEnv: nguồn hợp lệ tối thiểu → có DATABASE_URL, NODE_ENV mặc định development", () => {
  const env = parseServerEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/db" });
  assert.equal(env.DATABASE_URL, "postgres://u:p@localhost:5432/db");
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.XBOSS_SECRET, undefined);
});

test("parseServerEnv: thiếu DATABASE_URL → throw kèm tên biến", () => {
  assert.throws(() => parseServerEnv({}), /DATABASE_URL/);
});

test("parseServerEnv: DATABASE_URL rỗng → throw (min 1)", () => {
  assert.throws(() => parseServerEnv({ DATABASE_URL: "" }), /DATABASE_URL/);
});

test("parseServerEnv: NODE_ENV lạ → throw", () => {
  assert.throws(
    () => parseServerEnv({ DATABASE_URL: "x", NODE_ENV: "staging" }),
    /NODE_ENV/,
  );
});

test("parseServerEnv: giữ nguyên các biến tích hợp tuỳ chọn khi có", () => {
  const env = parseServerEnv({
    DATABASE_URL: "x",
    NODE_ENV: "production",
    XBOSS_SECRET: "s3cret",
    TELEGRAM_BOT_TOKEN: "tok",
    GOOGLE_SHEET_ID: "sheet1",
  });
  assert.equal(env.XBOSS_SECRET, "s3cret");
  assert.equal(env.TELEGRAM_BOT_TOKEN, "tok");
  assert.equal(env.GOOGLE_SHEET_ID, "sheet1");
});

test("getServerEnv: đọc process.env và memoize", () => {
  const prev = process.env.DATABASE_URL;
  try {
    __resetServerEnvCache();
    process.env.DATABASE_URL = "postgres://memo:test@localhost/db";
    const a = getServerEnv();
    // Đổi biến sau khi đã cache — getServerEnv vẫn trả giá trị cũ (memoized).
    process.env.DATABASE_URL = "postgres://changed@localhost/db";
    const b = getServerEnv();
    assert.equal(a, b);
    assert.equal(b.DATABASE_URL, "postgres://memo:test@localhost/db");
  } finally {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
    __resetServerEnvCache();
  }
});
