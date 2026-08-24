// test/engineering-nextgen-apex.test.ts — Unit & Integration Tests for Next-Gen Apex Engineering Systems
import test from "node:test";
import assert from "node:assert/strict";

import {
  solve3DGenerativeRoute,
  GenerativeRoutingInput,
} from "@/lib/ky-thuat/engineering-generative-routing";

import {
  auditPrePourRebarGrid,
  PrePourRebarAuditInput,
} from "@/lib/ky-thuat/engineering-edge-vision-tracking";

import {
  processSmartIpcRelease,
  SmartIpcCalculationInput,
  type SmartIpcGateContext,
} from "@/lib/ky-thuat/engineering-smart-ipc";

import { analyzeFidicTiaClaim, FidicTiaInput } from "@/lib/ky-thuat/engineering-fidic-tia-claim";

test("1. 3D A* Generative Spatial Router — Drainage slope & Beam L/3 penetration", () => {
  const input: GenerativeRoutingInput = {
    routingCode: "ROUTE-TEST-01",
    systemType: "PLUMBING_DRAINAGE_GRAVITY",
    startPoint: { x: 1000, y: 2000, z: 3200 },
    endPoint: { x: 9000, y: 2000, z: 3000 },
    nominalSizeMm: 110,
    flowRateLps: 5.0,
    obstacles: [
      {
        id: "BEAM-01",
        name: "Dầm D500x300 Trục 3",
        type: "BEAM",
        min: { x: 4500, y: 0, z: 2800 },
        max: { x: 5500, y: 4000, z: 3300 },
        beamSpan: { startX: 0, endX: 10000, heightMm: 500 },
      },
    ],
  };

  const result = solve3DGenerativeRoute(input);

  assert.equal(result.routingCode, "ROUTE-TEST-01");
  assert.equal(result.slopePercent, 1.5);
  assert.ok(result.totalLengthM > 0, "Total length should be greater than 0");
  assert.ok(result.pressureDropPa > 0, "Pressure drop should be calculated");
  assert.equal(result.sleeveOpeningsChecked, 1, "Should pass sleeve penetration at L/3");
  assert.equal(result.status, "rerouted_with_sleeves");
  assert.ok(result.dxfSnippet.includes("._3DPOLY"));
});

test("2. 3D A* Generative Spatial Router — Detour 45 deg around non-penetrable obstacle", () => {
  const input: GenerativeRoutingInput = {
    routingCode: "ROUTE-TEST-02",
    systemType: "PLUMBING_WATER_PRESSURE",
    startPoint: { x: 1000, y: 2000, z: 3000 },
    endPoint: { x: 9000, y: 2000, z: 3000 },
    nominalSizeMm: 100,
    obstacles: [
      {
        id: "BEAM-CRITICAL",
        name: "Dầm biên chịu cắt lớn (Không cho phép khoét)",
        type: "BEAM",
        min: { x: 4500, y: 0, z: 2800 },
        max: { x: 5500, y: 4000, z: 3300 },
        beamSpan: { startX: 4000, endX: 6000, heightMm: 250 }, // Height quá nhỏ, không đủ D <= H/3
      },
    ],
  };

  const result = solve3DGenerativeRoute(input);
  assert.equal(result.routingCode, "ROUTE-TEST-02");
  assert.ok(result.fittingsSchedule.some((f) => f.type === "ELBOW_45"));
  assert.equal(result.clashCountAvoided, 1);
});

test("3. Pre-Pour Rebar CV Audit — Pass Permitted when within tolerance", () => {
  const input: PrePourRebarAuditInput = {
    auditCode: "REBAR-PASS-01",
    zoneLabel: "Zone-01",
    slabLevel: "FL-03",
    elementName: "Sàn S03 Zone 1",
    designPitchMm: 150.0,
    measuredPitchMm: 154.0, // Lệch 4mm <= 10mm
    designSpacerDensitySqm: 4.0,
    measuredSpacerDensitySqm: 4.5, // >= 4.0
  };

  const result = auditPrePourRebarGrid(input);

  assert.equal(result.circuitBreakerStatus, "PASS_PERMITTED");
  assert.equal(result.blockingReasons.length, 0);
  assert.equal(result.pitchDeviationMm, 4.0);
  assert.ok(result.merkleLeafHash.length > 20);
});

test("4. Pre-Pour Rebar CV Audit — Locked Circuit Open when pitch deviation exceeds 10mm", () => {
  const input: PrePourRebarAuditInput = {
    auditCode: "REBAR-FAIL-01",
    zoneLabel: "Zone-02",
    slabLevel: "FL-03",
    elementName: "Sàn S03 Zone 2",
    designPitchMm: 150.0,
    measuredPitchMm: 168.0, // Lệch 18mm > 10mm -> Vi phạm
    designSpacerDensitySqm: 4.0,
    measuredSpacerDensitySqm: 3.2, // Thiếu con kê -> Vi phạm
  };

  const result = auditPrePourRebarGrid(input);

  assert.equal(result.circuitBreakerStatus, "LOCKED_CIRCUIT_OPEN");
  assert.equal(result.blockingReasons.length, 2);
  assert.ok(result.blockingReasons[0].includes("Sai lệch bước thép quá mức"));
  assert.ok(result.blockingReasons[1].includes("Mật độ con kê bảo vệ không đạt"));
});

test("5. Instant Smart IPC — All 4 Gates cleared with 5% retention release", () => {
  // V5: gating không còn nhận trực tiếp từ input — phải đọc từ bối cảnh DB thật
  // (`fetchSmartIpcGatingContext`). Test thuần dựng sẵn bối cảnh "đủ dữ liệu, đạt cả 4 cổng".
  const gateCtx: SmartIpcGateContext = {
    gate1: { available: true, maxDeviationMm: 12.0, scanCode: "SCAN-01" }, // <= 15mm (Gate 1 Pass)
    gate2: { available: true, signedCount: 3, totalCount: 3 }, // (Gate 2 Pass)
    gate3: { available: true, pressureDropBar: 0.0, durationHours: 2.5, requiredHours: 2.0 }, // (Gate 3 Pass)
    gate4: { available: true, claimedQty: 100, approvedBoqQty: 100, warehouseUsedQty: 120 }, // (Gate 4 Pass)
  };
  const input: SmartIpcCalculationInput = {
    ipcNumber: "IPC-TEST-01",
    periodMonth: "2026-08",
    contractorName: "Nhà Thầu Cơ Điện Chuẩn XBoss",
    grossClaimedVnd: "1000000000",
    retentionPercent: 5.0,
    refs: {},
  };

  const result = processSmartIpcRelease(input, gateCtx);

  assert.equal(result.allGatesCleared, true);
  assert.equal(result.paymentStatus, "released");
  assert.equal(result.retentionAmountVnd, 50000000);
  assert.equal(result.netPayableVnd, 950000000);
  assert.ok(result.merkleSealHash.startsWith("SEAL-IPC-"));
  assert.equal(result.bankingPaymentPayload.amountVnd, 950000000);
});

test("6. Instant Smart IPC — Blocked when Scan-to-BIM deviation > 15mm or unsigned BBNT", () => {
  const gateCtx: SmartIpcGateContext = {
    gate1: { available: true, maxDeviationMm: 28.0, scanCode: "SCAN-02" }, // > 15mm (Gate 1 Fail)
    gate2: { available: true, signedCount: 1, totalCount: 3 }, // (Gate 2 Fail)
    gate3: { available: true, pressureDropBar: 0.0, durationHours: 2.0, requiredHours: 2.0 },
    gate4: { available: true, claimedQty: 100, approvedBoqQty: 100, warehouseUsedQty: 100 },
  };
  const input: SmartIpcCalculationInput = {
    ipcNumber: "IPC-TEST-02",
    periodMonth: "2026-08",
    contractorName: "Nhà Thầu Cơ Điện Lệch Tuyến",
    grossClaimedVnd: "500000000",
    refs: {},
  };

  const result = processSmartIpcRelease(input, gateCtx);

  assert.equal(result.allGatesCleared, false);
  assert.equal(result.paymentStatus, "held_by_gates");
  assert.equal(result.netPayableVnd, 0);
  assert.equal(result.blockedGateReasons.length, 2);
});

test("6b. Instant Smart IPC — thiếu dữ liệu tham chiếu (không phải input body) → chặn, không mặc định pass", () => {
  const gateCtx: SmartIpcGateContext = {
    gate1: { available: false, maxDeviationMm: null },
    gate2: { available: false, signedCount: 0, totalCount: 0 },
    gate3: { available: false, pressureDropBar: null, durationHours: null, requiredHours: 2.0 },
    gate4: { available: false, claimedQty: null, approvedBoqQty: null, warehouseUsedQty: null },
  };
  const input: SmartIpcCalculationInput = {
    ipcNumber: "IPC-TEST-03",
    periodMonth: "2026-08",
    contractorName: "Nhà Thầu Thiếu Hồ Sơ",
    grossClaimedVnd: "500000000",
    refs: {},
  };

  const result = processSmartIpcRelease(input, gateCtx);

  assert.equal(result.allGatesCleared, false);
  assert.equal(result.paymentStatus, "held_by_gates");
  assert.equal(result.blockedGateReasons.length, 4);
  assert.equal(result.gateStatuses.gate1, "khong_du_du_lieu");
  assert.equal(result.gateStatuses.gate2, "khong_du_du_lieu");
  assert.equal(result.gateStatuses.gate3, "khong_du_du_lieu");
  assert.equal(result.gateStatuses.gate4, "khong_du_du_lieu");
});

test("7. Autonomous FIDIC TIA Claims — CPM Fragnet EOT & 28-day Notice generator", () => {
  const input: FidicTiaInput = {
    claimCode: "CLAIM-TEST-01",
    delayEventTitle: "Bão lớn gây ngập tầng hầm và dừng thi công",
    eventCategory: "FORCE_MAJEURE_WEATHER",
    delayStartDate: "2026-08-01",
    delayEndDate: "2026-08-15",
    dailyOverheadCostVnd: 20000000,
    impactedTasks: [
      {
        taskId: 1,
        taskName: "Đổ bê tông nắp hầm",
        originalDurationDays: 14,
        delayDays: 14,
      },
    ],
  };

  const result = analyzeFidicTiaClaim(input);

  assert.equal(result.claimCode, "CLAIM-TEST-01");
  assert.equal(result.fragnetDurationDays, 14);
  assert.equal(result.calculatedEotDays, 14);
  assert.equal(result.totalProlongationCostVnd, 280000000);
  assert.equal(result.timeBarDeadlineDate, "2026-08-29");
  assert.ok(result.noticeLetterMarkdown.includes("THƯ THÔNG BÁO KHIẾU NẠI"));
  assert.ok(result.noticeLetterMarkdown.includes("Clause 8.4(d)"));
  assert.ok(result.merkleProofHash.startsWith("MERKLE-CLAIM-"));
});
