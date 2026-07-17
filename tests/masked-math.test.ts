import "./setup"; // quy ước: đứng đầu (dù test thuần, không chạm DB)
import { test } from "node:test";
import assert from "node:assert/strict";
import { mSum, mMul, mSub, mSumBy } from "@/app/lib/masked";

// ===== M50 PR2 — số học "lan truyền che" (bịt lỗ Number(null)===0 ở tổng client) =====

test("mSum: null nếu bất kỳ toán hạng bị che, ngược lại cộng đúng", () => {
  assert.equal(mSum(2, 3, 5), 10);
  assert.equal(mSum(0, 0), 0);
  assert.equal(mSum(2, null), null);
  assert.equal(mSum(null, 3), null);
  assert.equal(mSum(2, undefined), null);
  assert.equal(mSum(2, NaN), null);
});

test("mMul: null nếu bất kỳ thừa số bị che (KHÔNG ngầm thành 0)", () => {
  assert.equal(mMul(4, 2), 8);
  assert.equal(mMul(5, 0), 0); // 0 hữu hạn là số thật
  assert.equal(mMul(5, null), null); // qty*unitPrice-che → che, không phải 0
});

test("mSub: null nếu a hoặc b bị che", () => {
  assert.equal(mSub(10, 3), 7);
  assert.equal(mSub(10, null), null);
  assert.equal(mSub(null, 3), null);
});

test("mSumBy: Σ term; null nếu bất kỳ term bị che", () => {
  const items = [
    { qty: 2, price: 100 as number | null },
    { qty: 3, price: 200 as number | null },
  ];
  assert.equal(
    mSumBy(items, (it) => mMul(it.qty, it.price)),
    800,
  );
  items[1].price = null;
  assert.equal(
    mSumBy(items, (it) => mMul(it.qty, it.price)),
    null,
  );
  assert.equal(
    mSumBy([] as { qty: number; price: number | null }[], (it) => mMul(it.qty, it.price)),
    0,
  );
});
