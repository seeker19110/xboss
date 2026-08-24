// tests/smart-ipc-gating.test.ts — V5: Smart IPC không còn "pass mặc định" khi thiếu dữ liệu
// gating, và tính tiền không còn dính bug parseFloat.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSmartIpcGates,
  computeSmartIpcMoney,
  processSmartIpcRelease,
  type SmartIpcGateContext,
} from "@/lib/ky-thuat/engineering-smart-ipc";

function ctxDayDu(): SmartIpcGateContext {
  return {
    gate1: { available: true, maxDeviationMm: 10, scanCode: "SCAN-1" },
    gate2: { available: true, signedCount: 3, totalCount: 3 },
    gate3: { available: true, pressureDropBar: 0, durationHours: 2.5, requiredHours: 2.0 },
    gate4: { available: true, claimedQty: 90, approvedBoqQty: 100, warehouseUsedQty: 120 },
  };
}

function ctxThieuDuLieu(): SmartIpcGateContext {
  return {
    gate1: { available: false, maxDeviationMm: null },
    gate2: { available: false, signedCount: 0, totalCount: 0 },
    gate3: { available: false, pressureDropBar: null, durationHours: null, requiredHours: 2.0 },
    gate4: { available: false, claimedQty: null, approvedBoqQty: null, warehouseUsedQty: null },
  };
}

test("Smart IPC: đủ dữ liệu thật + đạt cả 4 cổng → allGatesCleared = true", () => {
  const ev = evaluateSmartIpcGates(ctxDayDu());
  assert.equal(ev.gate1.status, "passed");
  assert.equal(ev.gate2.status, "passed");
  assert.equal(ev.gate3.status, "passed");
  assert.equal(ev.gate4.status, "passed");
  assert.equal(ev.allGatesCleared, true);
  assert.deepEqual(ev.blockedGateReasons, []);
});

test("Smart IPC: thiếu dữ liệu tham chiếu ở CẢ 4 cổng → khong_du_du_lieu, KHÔNG mặc định pass", () => {
  const ev = evaluateSmartIpcGates(ctxThieuDuLieu());
  assert.equal(ev.gate1.status, "khong_du_du_lieu");
  assert.equal(ev.gate2.status, "khong_du_du_lieu");
  assert.equal(ev.gate3.status, "khong_du_du_lieu");
  assert.equal(ev.gate4.status, "khong_du_du_lieu");
  assert.equal(ev.allGatesCleared, false);
  assert.equal(ev.blockedGateReasons.length, 4);
});

test("Smart IPC: chỉ 1 cổng thiếu dữ liệu cũng đủ để chặn giải ngân (không pass hết trừ cổng lỗi)", () => {
  const ctx = ctxDayDu();
  ctx.gate2 = { available: false, signedCount: 0, totalCount: 0 };
  const ev = evaluateSmartIpcGates(ctx);
  assert.equal(ev.gate1.status, "passed");
  assert.equal(ev.gate2.status, "khong_du_du_lieu");
  assert.equal(ev.allGatesCleared, false);
});

test("Smart IPC: BBNT có dữ liệu nhưng chưa đủ 3 bên ký → failed (không phải khong_du_du_lieu)", () => {
  const ctx = ctxDayDu();
  ctx.gate2 = { available: true, signedCount: 2, totalCount: 3 };
  const ev = evaluateSmartIpcGates(ctx);
  assert.equal(ev.gate2.status, "failed");
  assert.match(ev.gate2.reason!, /2\/3/);
});

test("Smart IPC: khối lượng xin thanh toán vượt hạn mức BOQ → gate4 failed", () => {
  const ctx = ctxDayDu();
  ctx.gate4 = { available: true, claimedQty: 150, approvedBoqQty: 100, warehouseUsedQty: 200 };
  const ev = evaluateSmartIpcGates(ctx);
  assert.equal(ev.gate4.status, "failed");
});

test("Smart IPC: không còn số tài khoản hardcode 98877665544 khi phát hành", () => {
  const result = processSmartIpcRelease(
    {
      ipcNumber: "IPC-001",
      periodMonth: "2026-08",
      contractorName: "Công ty Test",
      grossClaimedVnd: "200",
      retentionPercent: 7.25,
      refs: {},
    },
    ctxDayDu(),
  );
  const payloadStr = JSON.stringify(result.bankingPaymentPayload);
  assert.ok(!payloadStr.includes("98877665544"));
  assert.equal(result.paymentStatus, "released");
});

test("Smart IPC: thiếu dữ liệu → paymentStatus held_by_gates, payload rỗng (không trả số tiền)", () => {
  const result = processSmartIpcRelease(
    {
      ipcNumber: "IPC-002",
      periodMonth: "2026-08",
      contractorName: "Công ty Test",
      grossClaimedVnd: "200",
      refs: {},
    },
    ctxThieuDuLieu(),
  );
  assert.equal(result.paymentStatus, "held_by_gates");
  assert.equal(result.allGatesCleared, false);
  assert.deepEqual(result.bankingPaymentPayload, {});
  assert.equal(result.netPayableVnd, 0);
});

// --- Chứng minh bug float là thật (trước đây `Math.round(gross * rate)` trên parseFloat) ---

test("Tiền: computeSmartIpcMoney (bigint) khác kết quả parseFloat cũ ở ca biên gross=200, retentionPercent=7.25", () => {
  const gross = 200;
  const retentionPercent = 7.25;

  // Logic CŨ (đã xoá khỏi engineering-smart-ipc.ts, tái hiện lại để chứng minh bug có thật):
  // `Math.round(gross * retentionPercent/100)` — vừa mất độ chính xác do float (200*0.0725
  // ra 14.499999999999998 thay vì 14.5 đúng toán học), vừa làm tròn sớm về số nguyên dù cột
  // DB lưu 2 chữ số thập phân (NUMERIC(16,2)).
  const oldRetentionFloat = gross * (retentionPercent / 100);
  const oldRetentionRounded = Math.round(oldRetentionFloat);

  const money = computeSmartIpcMoney(String(gross), retentionPercent, true);

  assert.equal(
    oldRetentionFloat,
    14.499999999999998,
    "bug float có thật: 200*0.0725 không ra đúng 14.5 trên JS number",
  );
  assert.equal(oldRetentionRounded, 14, "hệ quả: làm tròn sai xuống 14 thay vì 14.5 đúng");
  assert.equal(money.retentionAmountVnd, 14.5, "lib/nen/money (bigint) tính đúng chính xác 14.5");
  assert.notEqual(
    oldRetentionRounded,
    money.retentionAmountVnd,
    "phải khác nhau — chứng minh bug float là thật, không phải suy diễn",
  );
});

test("Tiền: netPayableVnd = gross - retention khi đạt cổng, = 0 khi không đạt", () => {
  const passed = computeSmartIpcMoney("1000000", 5, true);
  assert.equal(passed.retentionAmountVnd, 50000);
  assert.equal(passed.netPayableVnd, 950000);

  const blocked = computeSmartIpcMoney("1000000", 5, false);
  assert.equal(blocked.netPayableVnd, 0);
});
