import { HAS_TEST_DB } from "./setup"; // đứng đầu: không kết nối DB production
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryOne } from "@/lib/db";
import { parseMoneyExact, moneyToDecimal, mulRatio } from "@/lib/nen/money";

test(
  "S09: helper exact khớp PostgreSQL numeric, kể cả SUM vượt biên một ô",
  { skip: !HAS_TEST_DB },
  async () => {
    for (const value of [
      "0.005",
      "-0.005",
      "1.004999",
      "-2.999",
      "-0.001",
      "9999999999999.99",
      "90071992547409931234567890.91",
    ]) {
      const row = await queryOne<{ amount: string }>(
        "SELECT round(?::numeric, 2)::text AS amount",
        value,
      );
      assert.equal(row?.amount, moneyToDecimal(parseMoneyExact(value)));
    }
    const total = await queryOne<{ amount: string }>(
      "SELECT SUM(0.01::numeric)::text AS amount FROM generate_series(1, 10000)",
    );
    assert.equal(total?.amount, "100.00");
    for (const minor of [-1n, 1n, 123456n, 9007199254740993123456789091n]) {
      const row = await queryOne<{ amount: string }>(
        "SELECT round(?::numeric * 1025 / 10000, 0)::text AS amount",
        minor.toString(),
      );
      assert.equal(row?.amount, mulRatio(minor, 1025n, 10000n).toString());
    }
  },
);
