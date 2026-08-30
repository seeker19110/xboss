// tests/smart-ipc-validate-body.test.ts — Reviewer bắt lỗi V5: retentionPercent/iotWindowHours/
// claimedQty không validate biên → `Number("abc")` ra NaN chảy thẳng vào tính tiền/khoảng thời
// gian thay vì báo lỗi rõ ràng. Test thuần, không cần DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSmartIpcPostBody } from "@/lib/ky-thuat/engineering-smart-ipc";

function bodyHopLe(overrides: Record<string, unknown> = {}) {
  return {
    ipcNumber: "IPC-01",
    periodMonth: "2026-08",
    contractorName: "Nhà thầu Test",
    grossClaimedVnd: "1000000",
    ...overrides,
  };
}

test("validateSmartIpcPostBody: body hợp lệ tối thiểu → ok", () => {
  const r = validateSmartIpcPostBody(bodyHopLe());
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.value.grossClaimedVnd === "1000000");
});

test("validateSmartIpcPostBody: thiếu grossClaimedVnd → lỗi rõ ràng, không default 500 triệu", () => {
  const r = validateSmartIpcPostBody(bodyHopLe({ grossClaimedVnd: undefined }));
  assert.equal(r.ok, false);
  assert.ok(!r.ok && /grossClaimedVnd/.test(r.error));
});

test("validateSmartIpcPostBody: grossClaimedVnd không phải số → lỗi (không chảy tiếp vào parseMoney)", () => {
  const r = validateSmartIpcPostBody(bodyHopLe({ grossClaimedVnd: "một triệu đồng" }));
  assert.equal(r.ok, false);
});

test("validateSmartIpcPostBody: retentionPercent là chuỗi rác → 'abc' KHÔNG được lọt qua thành NaN", () => {
  const r = validateSmartIpcPostBody(bodyHopLe({ retentionPercent: "abc" }));
  assert.equal(r.ok, false);
  assert.ok(!r.ok && /retentionPercent/.test(r.error));
});

test("validateSmartIpcPostBody: retentionPercent ngoài khoảng 0–100 → lỗi", () => {
  assert.equal(validateSmartIpcPostBody(bodyHopLe({ retentionPercent: -1 })).ok, false);
  assert.equal(validateSmartIpcPostBody(bodyHopLe({ retentionPercent: 150 })).ok, false);
  assert.equal(validateSmartIpcPostBody(bodyHopLe({ retentionPercent: Infinity })).ok, false);
});

test("validateSmartIpcPostBody: retentionPercent hợp lệ trong khoảng → ok", () => {
  const r = validateSmartIpcPostBody(bodyHopLe({ retentionPercent: 7.25 }));
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.value.retentionPercent === 7.25);
});

test("validateSmartIpcPostBody: refs.iotWindowHours không hữu hạn hoặc <=0 → lỗi", () => {
  assert.equal(validateSmartIpcPostBody(bodyHopLe({ refs: { iotWindowHours: "xyz" } })).ok, false);
  assert.equal(validateSmartIpcPostBody(bodyHopLe({ refs: { iotWindowHours: 0 } })).ok, false);
  assert.equal(validateSmartIpcPostBody(bodyHopLe({ refs: { iotWindowHours: -2 } })).ok, false);
});

test("validateSmartIpcPostBody: refs.claimedQty âm hoặc không phải số → lỗi", () => {
  assert.equal(validateSmartIpcPostBody(bodyHopLe({ refs: { claimedQty: "nhiều" } })).ok, false);
  assert.equal(validateSmartIpcPostBody(bodyHopLe({ refs: { claimedQty: -5 } })).ok, false);
});

test("validateSmartIpcPostBody: refs đầy đủ hợp lệ → chuẩn hoá đúng kiểu", () => {
  const r = validateSmartIpcPostBody(
    bodyHopLe({
      refs: {
        scanCode: "SCAN-01",
        bbntEnvelopeId: "uuid-1",
        iotDeviceId: "uuid-2",
        iotWindowHours: 2.5,
        boqCode: "BOQ-01",
        claimedQty: 100,
      },
    }),
  );
  assert.equal(r.ok, true);
  assert.ok(
    r.ok &&
      r.value.refs.scanCode === "SCAN-01" &&
      r.value.refs.iotWindowHours === 2.5 &&
      r.value.refs.claimedQty === 100,
  );
});
