import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Unit test M46 PR1 — decideNext (logic thuần chọn bước duyệt kế tiếp theo ngưỡng tiền).

test("decideNext: min_amount NULL luôn hiệu lực, lấy bước đầu khi currentSeq=0", async () => {
  const { decideNext } = await import("@/lib/approvals");
  const steps = [
    { seq: 1, role: "pm" as const, minAmount: null, slaDays: null },
    { seq: 2, role: "cdt" as const, minAmount: null, slaDays: null },
  ];
  assert.equal(decideNext(steps, null, 0)?.seq, 1);
  assert.equal(decideNext(steps, null, 1)?.seq, 2);
  assert.equal(decideNext(steps, null, 2), null); // hết bước
});

test("decideNext: ngưỡng min_amount lọc bước theo amount", async () => {
  const { decideNext } = await import("@/lib/approvals");
  const steps = [
    { seq: 1, role: "pm" as const, minAmount: null, slaDays: null },
    { seq: 2, role: "bch" as const, minAmount: 100, slaDays: null },
    { seq: 3, role: "cdt" as const, minAmount: 1000, slaDays: null },
  ];
  // amount 50: chỉ bước 1 hiệu lực → sau bước 1 là hết.
  assert.equal(decideNext(steps, 50, 0)?.seq, 1);
  assert.equal(decideNext(steps, 50, 1), null);
  // amount 500: bước 1 + 2 hiệu lực (>=100), bước 3 (>=1000) bị loại.
  assert.equal(decideNext(steps, 500, 1)?.seq, 2);
  assert.equal(decideNext(steps, 500, 2), null);
  // amount 5000: cả 3 bước.
  assert.equal(decideNext(steps, 5000, 2)?.seq, 3);
  assert.equal(decideNext(steps, 5000, 3), null);
});

test("decideNext: biên min_amount (amount == ngưỡng) tính là hiệu lực", async () => {
  const { decideNext } = await import("@/lib/approvals");
  const steps = [{ seq: 1, role: "bch" as const, minAmount: 100, slaDays: null }];
  assert.equal(decideNext(steps, 100, 0)?.seq, 1); // >= nên đúng ngưỡng vẫn kích hoạt
  assert.equal(decideNext(steps, 99, 0), null);
});

test("decideNext: amount NULL loại mọi bước có min_amount", async () => {
  const { decideNext } = await import("@/lib/approvals");
  const steps = [
    { seq: 1, role: "pm" as const, minAmount: null, slaDays: null },
    { seq: 2, role: "cdt" as const, minAmount: 100, slaDays: null },
  ];
  // task_acceptance: amount NULL → bước có ngưỡng bị bỏ, chỉ còn bước không ngưỡng.
  assert.equal(decideNext(steps, null, 1), null);
});

test("decideNext: steps không theo thứ tự vẫn chọn đúng theo seq", async () => {
  const { decideNext } = await import("@/lib/approvals");
  const steps = [
    { seq: 3, role: "cdt" as const, minAmount: null, slaDays: null },
    { seq: 1, role: "pm" as const, minAmount: null, slaDays: null },
    { seq: 2, role: "bch" as const, minAmount: null, slaDays: null },
  ];
  assert.equal(decideNext(steps, null, 0)?.seq, 1);
  assert.equal(decideNext(steps, null, 1)?.seq, 2);
  assert.equal(decideNext(steps, null, 2)?.seq, 3);
});
