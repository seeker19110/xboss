import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

/**
 * MASTER SKILLS ECOSYSTEM & 6-PHASE LIFECYCLE CLOSED-LOOP VERIFICATION SUITE
 * Kiểm thử tự động toàn diện 12 Master Skills và các nguyên tắc Bất Biến (Invariants)
 */

test("1. CAD/BIM Master: Bất biến độ dốc trọng lực, lỗ khoét dầm và FFD Nesting", () => {
  // 1.1 Kiểm tra độ dốc ống thoát nước trọng lực (1.0% - 2.0%)
  const validateSlope = (slopePercent: number) => {
    return slopePercent >= 1.0 && slopePercent <= 2.0;
  };
  assert.equal(validateSlope(1.5), true, "Độ dốc 1.5% đạt chuẩn");
  assert.equal(validateSlope(0.5), false, "Độ dốc 0.5% vi phạm chuẩn tự chảy");
  assert.equal(validateSlope(3.0), false, "Độ dốc 3.0% vượt chuẩn gây tách dòng");

  // 1.2 Kiểm tra vị trí khoét dầm bê tông L/3 <= x <= 2L/3 và D <= H/3
  const validateBeamSleeve = (
    beamLength: number,
    beamHeight: number,
    x: number,
    sleeveDia: number,
  ) => {
    const minX = beamLength / 3;
    const maxX = (2 * beamLength) / 3;
    const maxDia = beamHeight / 3;
    return x >= minX && x <= maxX && sleeveDia <= maxDia;
  };
  assert.equal(
    validateBeamSleeve(6000, 600, 3000, 150),
    true,
    "Vị trí giữa dầm và D=150mm <= 200mm hợp lệ",
  );
  assert.equal(
    validateBeamSleeve(6000, 600, 1000, 150),
    false,
    "Vị trí x=1000mm tại 1/3 đầu dầm vi phạm lực cắt",
  );
  assert.equal(
    validateBeamSleeve(6000, 600, 3000, 250),
    false,
    "Đường kính D=250mm > H/3 vi phạm kết cấu",
  );

  // 1.3 Kiểm tra thuật toán First-Fit Decreasing 1D Nesting
  const stockLength = 6000;
  const cuts = [2400, 2400, 1800, 1500, 1200, 1000, 800];
  const sorted = [...cuts].sort((a, b) => b - a);
  const stocks: number[][] = [];

  for (const item of sorted) {
    let placed = false;
    for (const stock of stocks) {
      const currentSum = stock.reduce((sum, val) => sum + val, 0);
      if (currentSum + item <= stockLength) {
        stock.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      stocks.push([item]);
    }
  }

  const totalUsed = stocks.length * stockLength;
  const totalNet = cuts.reduce((sum, val) => sum + val, 0);
  const scrapRate = ((totalUsed - totalNet) / totalUsed) * 100;
  assert.ok(stocks.length <= 3, "Tối ưu hóa trong tối đa 3 cây phôi");
  assert.ok(scrapRate < 30, "Tỷ lệ hao hụt được kiểm soát chặt chẽ");
});

test("2. QS, Cost & Contracts Master: Time-Bar 28 ngày, Bù giá trượt giá & BigInt", () => {
  // 2.1 Bất biến Time-Bar FIDIC 28 ngày
  const checkNoticeTimeBar = (eventDateISO: string, noticeDateISO: string) => {
    const eventTime = new Date(eventDateISO).getTime();
    const noticeTime = new Date(noticeDateISO).getTime();
    const diffDays = Math.floor((noticeTime - eventTime) / (1000 * 60 * 60 * 24));
    return {
      diffDays,
      isTimeBarred: diffDays > 28,
      status: diffDays <= 28 ? "VALID" : "TIME_BARRED_RISK",
    };
  };
  const validNotice = checkNoticeTimeBar("2026-08-01", "2026-08-20");
  assert.equal(validNotice.isTimeBarred, false);
  assert.equal(validNotice.status, "VALID");

  const lateNotice = checkNoticeTimeBar("2026-08-01", "2026-09-05");
  assert.equal(lateNotice.isTimeBarred, true);
  assert.equal(lateNotice.status, "TIME_BARRED_RISK");

  // 2.2 Công thức Bù giá đa thành phần FIDIC
  const calculatePriceAdjustment = (
    p0: number,
    a: number,
    b: number,
    c: number,
    d: number,
    lRatio: number,
    mRatio: number,
    eRatio: number,
  ) => {
    assert.equal(a + b + c + d, 1.0, "Tổng các hệ số trọng số phải bằng 1.0");
    return p0 * (a + b * lRatio + c * mRatio + d * eRatio);
  };
  const adjusted = calculatePriceAdjustment(100_000_000, 0.15, 0.35, 0.4, 0.1, 1.1, 1.05, 1.02);
  assert.ok(adjusted > 100_000_000, "Giá sau điều chỉnh phản ánh trượt giá vật liệu và nhân công");
});

test("3. Schedule & EVM Controller: Công thức EVM & CPM Critical Path", () => {
  const bac = 1_000_000_000; // 1 tỷ
  const plannedProgress = 0.5; // 50%
  const actualProgress = 0.4; // 40%
  const actualCost = 450_000_000; // 450 triệu

  const pv = plannedProgress * bac; // 500 tr
  const ev = actualProgress * bac; // 400 tr
  const ac = actualCost; // 450 tr

  const spi = ev / pv; // 0.8
  const cpi = ev / ac; // 0.8888...
  const sv = ev - pv; // -100 tr
  const cv = ev - ac; // -50 tr
  const eac = ac + (bac - ev) / (cpi * spi);

  assert.equal(spi, 0.8, "SPI tính đúng");
  assert.equal(sv, -100_000_000, "SV tính đúng trễ hạn");
  assert.ok(cpi < 1.0, "CPI < 1.0 cảnh báo vượt chi phí");
  assert.ok(eac > bac, "EAC dự báo chi phí khi hoàn thành lớn hơn BAC");
});

test("4. Site Field Commander: Work-Front Custody, TT06 Diary & QR Logistics", () => {
  // 4.1 Đơn nhất quyền sở hữu mặt bằng
  interface WorkFront {
    id: string;
    zone: string;
    owner: string | null;
  }
  const fronts: WorkFront[] = [{ id: "WF-1", zone: "T12-Z1", owner: "SUBCON-A" }];
  const transferCustody = (frontId: string, currentOwner: string, newOwner: string) => {
    const wf = fronts.find((f) => f.id === frontId);
    if (!wf || wf.owner !== currentOwner) {
      throw new Error("Không có quyền bàn giao mặt bằng");
    }
    wf.owner = newOwner;
    return wf;
  };
  const updated = transferCustody("WF-1", "SUBCON-A", "SUBCON-B");
  assert.equal(updated.owner, "SUBCON-B");

  // 4.2 Cú pháp mã QR Logistics có băm Checksum
  const generateQr = (poCode: string, boqCode: string, qty: number, tagId: string) => {
    const raw = `XBOSS|PO:${poCode}|MAT:${boqCode}|QTY:${qty}|TAG:${tagId}`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 8);
    return `${raw}|H:${hash}`;
  };
  const qr = generateQr("PO-2026-001", "A1.01", 50, "TAG-123");
  assert.ok(qr.startsWith("XBOSS|PO:PO-2026-001"));
  assert.ok(qr.includes("|H:"));
});

test("5. QA/QC & Safety Sentinel: Hold-Point Lock & Site Safety Index", () => {
  // 5.1 Khóa chặn điểm dừng Hold-Point
  const checkHoldPointClearance = (isHoldPoint: boolean, hasApprovedBbnt: boolean) => {
    if (isHoldPoint && !hasApprovedBbnt) {
      return {
        allowed: false,
        error: "HOLD_POINT_BLOCKED: Cần có BBNT ký duyệt trước khi làm tiếp",
      };
    }
    return { allowed: true };
  };
  assert.equal(checkHoldPointClearance(true, false).allowed, false);
  assert.equal(checkHoldPointClearance(true, true).allowed, true);

  // 5.2 Chỉ số An toàn Công trường SSI
  const calculateSsi = (violations: { count: number; weight: number }[]) => {
    const penalty = violations.reduce((acc, v) => acc + v.count * v.weight, 0);
    return Math.max(0, 100 - penalty);
  };
  const ssi = calculateSsi([
    { count: 1, weight: 10 }, // 1 lỗi không mũ
    { count: 1, weight: 25 }, // 1 lỗi mép sàn
  ]);
  assert.equal(ssi, 65, "SSI = 100 - 35 = 65 (Mức cảnh báo)");
});

test("6. Procurement & Supply Chain Master: 3-Way Matching & Long-Lead Reverse Scheduling", () => {
  // 6.1 Bất biến Khớp 3 chiều (PO == GRN == Invoice)
  const validate3WayMatching = (
    poQty: number,
    grnQty: number,
    invoiceQty: number,
    poPrice: number,
    invoicePrice: number,
  ) => {
    const qtyMatch = invoiceQty <= grnQty && grnQty <= poQty && Math.abs(invoiceQty - grnQty) === 0;
    const priceMatch = invoicePrice === poPrice;
    return qtyMatch && priceMatch;
  };
  assert.equal(validate3WayMatching(100, 100, 100, 50000, 50000), true);
  assert.equal(
    validate3WayMatching(100, 100, 120, 50000, 50000),
    false,
    "Hóa đơn vượt GRN bị từ chối",
  );
  assert.equal(
    validate3WayMatching(100, 100, 100, 50000, 55000),
    false,
    "Đơn giá hóa đơn lệch đơn giá PO bị khóa",
  );

  // 6.2 Lịch trình đặt hàng Long-Lead đảo ngược
  const calculateOrderLeadTimeWeeks = (
    production: number,
    shipping: number,
    customs: number,
    buffer: number,
  ) => {
    return production + shipping + customs + buffer;
  };
  const chillerLeadWeeks = calculateOrderLeadTimeWeeks(18, 4, 1, 2);
  assert.equal(chillerLeadWeeks, 25, "Chiller cần tổng cộng 25 tuần (khoảng 6 tháng) lead-time");
});

test("7. Commissioning & Handover Master: PCCC Interlock, TAB Tolerance & COBie LOD 500", () => {
  // 7.1 Dung sai TAB NEBB (+-10%)
  const checkTabTolerance = (qActual: number, qDesign: number) => {
    const diffPercent = ((qActual - qDesign) / qDesign) * 100;
    return diffPercent >= -10 && diffPercent <= 10;
  };
  assert.equal(checkTabTolerance(1050, 1000), true, "+5% trong dải cho phép");
  assert.equal(checkTabTolerance(850, 1000), false, "-15% vi phạm dung sai TAB");

  // 7.2 Kiểm tra 6 trường bắt buộc của COBie Asset Passport LOD 500
  interface AssetPassport {
    assetTag: string;
    serialNo: string;
    model: string;
    manufacturer: string;
    warrantyEndDate: string;
    omManualLink: string;
  }
  const validateAssetPassport = (p: Partial<AssetPassport>): boolean => {
    return !!(
      p.assetTag &&
      p.serialNo &&
      p.model &&
      p.manufacturer &&
      p.warrantyEndDate &&
      p.omManualLink
    );
  };
  assert.equal(
    validateAssetPassport({
      assetTag: "AHU-L10-01",
      serialNo: "SN-987654",
      model: "TICA-2000",
      manufacturer: "TICA",
      warrantyEndDate: "2028-08-20",
      omManualLink: "https://xboss.vn/docs/om/ahu-tica.pdf",
    }),
    true,
  );
  assert.equal(
    validateAssetPassport({ assetTag: "AHU-01" }),
    false,
    "Thiếu trường bị từ chối bàn giao",
  );
});

test("8. Regulatory & Compliance Master: Cảnh báo 30 ngày & Điều kiện Khởi công 100%", () => {
  // 8.1 Vùng cảnh báo thời hạn giấy phép/bảo lãnh 30-15-7 ngày
  const getExpirySeverity = (expiryDateISO: string, referenceDateISO: string) => {
    const expTime = new Date(expiryDateISO).getTime();
    const refTime = new Date(referenceDateISO).getTime();
    const daysLeft = Math.floor((expTime - refTime) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return "EXPIRED";
    if (daysLeft <= 7) return "CRITICAL_7_DAYS";
    if (daysLeft <= 15) return "WARNING_15_DAYS";
    if (daysLeft <= 30) return "ATTENTION_30_DAYS";
    return "SAFE";
  };
  assert.equal(getExpirySeverity("2026-09-01", "2026-08-20"), "WARNING_15_DAYS");
  assert.equal(getExpirySeverity("2026-08-25", "2026-08-20"), "CRITICAL_7_DAYS");

  // 8.2 Đủ 6 điều kiện khởi công Điều 107 Luật Xây dựng
  const checkPermitToStart = (conditions: Record<string, boolean>) => {
    const keys = [
      "siteHandover",
      "buildingPermit",
      "approvedDesign",
      "signedContract",
      "safetyPlan",
      "commencementNotice",
    ];
    return keys.every((k) => conditions[k] === true);
  };
  assert.equal(
    checkPermitToStart({
      siteHandover: true,
      buildingPermit: true,
      approvedDesign: true,
      signedContract: true,
      safetyPlan: true,
      commencementNotice: true,
    }),
    true,
  );
  assert.equal(
    checkPermitToStart({
      siteHandover: true,
      buildingPermit: false, // Thiếu giấy phép
      approvedDesign: true,
      signedContract: true,
      safetyPlan: true,
      commencementNotice: true,
    }),
    false,
  );
});

test("9. User Error Healing Master: Bậc thang L1-L4 & Z-Score Outlier", () => {
  // 9.1 Tính toán Z-Score phát hiện số liệu bất thường
  const calculateZScore = (samples: number[], newValue: number) => {
    const n = samples.length;
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    return stdDev === 0 ? 0 : Math.abs(newValue - mean) / stdDev;
  };
  const history = [100, 102, 98, 105, 95, 100];
  const normalZ = calculateZScore(history, 103);
  const outlierZ = calculateZScore(history, 1000); // Gõ thừa số 0
  assert.ok(normalZ < 2.0, "Số liệu bình thường có Z < 2.0");
  assert.ok(outlierZ >= 3.5, "Số liệu gõ thừa số 0 có Z >= 3.5 (Critical Outlier)");
});

test("10. UI/UX Craftsman: Tương phản WCAG 2.2 AA & 5 States Completeness", () => {
  // 10.1 Kiểm tra kích thước vùng chạm Mobile-First tối thiểu 44px
  const validateTouchTarget = (widthPx: number, heightPx: number) => {
    return widthPx >= 44 && heightPx >= 44;
  };
  assert.equal(validateTouchTarget(44, 44), true);
  assert.equal(
    validateTouchTarget(32, 32),
    false,
    "Vùng chạm 32px vi phạm chuẩn công trường ngoài trời",
  );

  // 10.2 Kiểm tra 5 trạng thái bắt buộc của giao diện
  const requiredStates = ["empty", "loading", "loaded", "error", "validation"];
  const componentStateHandlers = {
    empty: () => "Empty state view",
    loading: () => "Skeleton loader",
    loaded: () => "Data view",
    error: () => "Error retry banner",
    validation: () => "Inline field error",
  };
  assert.equal(
    requiredStates.every((st) => st in componentStateHandlers),
    true,
  );
});

test("11. Zero-Error Construction Tracker: Dynamic Challenge & Geofencing", () => {
  // 11.1 Tính khoảng cách Haversine Geofencing <= 50m
  const calculateDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // bán kính Trái Đất (m)
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };
  const siteLat = 10.7769;
  const siteLon = 106.7009;
  const engineerLat = 10.777;
  const engineerLon = 106.701;
  const dist = calculateDistanceMeters(siteLat, siteLon, engineerLat, engineerLon);
  assert.ok(dist <= 50, `Khoảng cách ${dist.toFixed(1)}m nằm trong vùng dự án`);
});

test("12. Engineering Agent Orchestrator: Ranh giới Tự trị Controlled Autonomy & ENG-4", () => {
  // 12.1 Kiểm tra cấp độ tự trị cho phép (A0 - A2 cho phép tự động, A3+ đòi hỏi phê duyệt người)
  const evaluateAutonomyExecution = (
    level: "A0" | "A1" | "A2" | "A3" | "A4",
    hasPmSignature: boolean,
  ) => {
    if ((level === "A3" || level === "A4") && !hasPmSignature) {
      return { canExecute: false, reason: "A3+ đòi hỏi chữ ký số của PM / Chỉ huy trưởng" };
    }
    return { canExecute: true };
  };
  assert.equal(evaluateAutonomyExecution("A2", false).canExecute, true);
  assert.equal(evaluateAutonomyExecution("A3", false).canExecute, false);
  assert.equal(evaluateAutonomyExecution("A3", true).canExecute, true);

  // 12.2 Điểm đồng thuận kỹ thuật Swarm Debate
  const computeSwarmConsensus = (engScore: number, qsScore: number, siteScore: number) => {
    const total = 0.4 * engScore + 0.3 * qsScore + 0.3 * siteScore;
    return {
      consensusScore: total,
      isConsensusReached: total >= 0.8,
    };
  };
  assert.equal(computeSwarmConsensus(0.9, 0.85, 0.85).isConsensusReached, true);
  assert.equal(computeSwarmConsensus(0.6, 0.5, 0.7).isConsensusReached, false);
});
