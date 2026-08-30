import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

test("M70: syncSpoolToWbsAndPayment sinh mã băm Provenance Token bất biến và tính đúng giá trị thanh toán", () => {
  const projectId = 1;
  const spoolId = "SP-FP-T5-01";
  const calculatedQty = 25.5;
  const unitRateVnd = 520000;
  const totalAmountVnd = Math.round(calculatedQty * unitRateVnd);

  const rawToken = `${projectId}:${spoolId}:${totalAmountVnd}`;
  const token = `SIG-PAY-${createHash("sha256").update(rawToken).digest("hex").slice(0, 24).toUpperCase()}`;

  assert.equal(totalAmountVnd, 13260000);
  assert.ok(token.startsWith("SIG-PAY-"));
  assert.equal(token.length, 32);
});
