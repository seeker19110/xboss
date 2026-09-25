import { HAS_TEST_DB } from "./setup"; // đầu tiên: không kết nối DB production
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryOne } from "@/lib/db";
import { moneyToDecimal, sumMoneyProductsExact } from "@/lib/nen/money";

test("S09: sum-products và round tổng khớp PostgreSQL numeric", { skip: !HAS_TEST_DB }, async () => {
  const fixtures = [
    [],
    [
      { quantity: "0.001", unitPrice: "5.00" },
      { quantity: "0.001", unitPrice: "5.00" },
    ],
    [{ quantity: "-0.001", unitPrice: "5.00" }],
    [{ quantity: "1.000", unitPrice: "90071992547409.92" }],
    Array.from({ length: 200 }, (_, index) => ({
      quantity: `${index}.005`,
      unitPrice: `${(index * 7919) % 100_000}.25`,
    })),
  ];
  for (const lines of fixtures) {
    const row = await queryOne<{ amount: string }>(
      `SELECT round(COALESCE(SUM(r.quantity * r."unitPrice"), 0), 2)::text AS amount
         FROM jsonb_to_recordset(?::jsonb) AS r(quantity numeric, "unitPrice" numeric)`,
      JSON.stringify(lines),
    );
    assert.equal(row?.amount, moneyToDecimal(sumMoneyProductsExact(lines)));
  }
});
