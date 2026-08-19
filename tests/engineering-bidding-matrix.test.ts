import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateLineItemVariances,
  detectPriceSkewing,
  evaluateVendorRanking,
  createBiddingPackage,
  createVendorQuote,
  listBiddingPackages,
  runBiddingAnalysis,
  BiddingLineItem,
} from "@/lib/engineering-bidding-matrix";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M75: Thuật toán đối soát độ lệch đơn giá chi tiết từng hạng mục dòng", () => {
  const targetItems: BiddingLineItem[] = [
    {
      itemCode: "DUCT-01",
      description: "Ống gió 600x400",
      unit: "m2",
      quantity: 100,
      targetUnitRateVnd: 300000,
      stage: "early",
      isCritical: true,
    },
    {
      itemCode: "VAV-01",
      description: "VAV Box",
      unit: "bộ",
      quantity: 10,
      targetUnitRateVnd: 5000000,
      stage: "late",
      isCritical: true,
    },
  ];

  const quoteItems: BiddingLineItem[] = [
    {
      itemCode: "DUCT-01",
      description: "Ống gió 600x400",
      unit: "m2",
      quantity: 100,
      targetUnitRateVnd: 300000,
      quotedUnitRateVnd: 390000, // +30% (Front-loaded)
      stage: "early",
      isCritical: true,
    },
    {
      itemCode: "VAV-01",
      description: "VAV Box",
      unit: "bộ",
      quantity: 10,
      targetUnitRateVnd: 5000000,
      quotedUnitRateVnd: 4500000, // -10%
      stage: "late",
      isCritical: true,
    },
  ];

  const res = calculateLineItemVariances(targetItems, quoteItems);
  assert.equal(res.length, 2);

  const ductVar = res.find((r) => r.itemCode === "DUCT-01")!;
  assert.equal(ductVar.varianceRatePct, 30);
  assert.equal(
    ductVar.isFrontLoaded,
    true,
    "Hạng mục giai đoạn đầu tăng 30% phải bị cắm cờ Front-Loaded",
  );

  const vavVar = res.find((r) => r.itemCode === "VAV-01")!;
  assert.equal(vavVar.varianceRatePct, -10);
  assert.equal(vavVar.isFrontLoaded, false);
});

test("M75: Thuật toán phát hiện bất thường đơn giá Price Skewing & Front-Loading", () => {
  const lineVariances: any[] = [
    { itemCode: "DUCT-01", varianceRatePct: 28, isFrontLoaded: true, stage: "early" },
    { itemCode: "PIPE-01", varianceRatePct: 22, isFrontLoaded: true, stage: "early" },
    { itemCode: "AHU-01", varianceRatePct: -5, isFrontLoaded: false, stage: "late" },
  ];

  const skew = detectPriceSkewing("Nhà Thầu Alpha", lineVariances);
  assert.equal(skew.vendorName, "Nhà Thầu Alpha");
  assert.equal(skew.earlyStageVariancePct, 25);
  assert.equal(
    skew.isFrontLoadingRisk,
    true,
    "Early variance 25% phải kích hoạt Front-Loading Risk",
  );
  assert.ok(skew.anomalies.length > 0);
});

test("M75: Thuật toán xếp hạng đa tiêu chí Nhà thầu (Composite Ranking)", () => {
  const quotes: any[] = [
    {
      vendorName: "Vendor Low-Price",
      totalAmountVnd: 100000000,
      capacityScore: 80,
      safetyScore: 85,
      technicalComplianceScore: 80,
    },
    {
      vendorName: "Vendor High-Price High-Quality",
      totalAmountVnd: 120000000,
      capacityScore: 95,
      safetyScore: 95,
      technicalComplianceScore: 95,
    },
  ];

  const ranked = evaluateVendorRanking(quotes, 110000000);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].rank, 1);
  assert.ok(ranked[0].compositeScore > 0);
  assert.ok(ranked[0].recommendation);
});

test("M75: Vòng đời Smart Bidding trong DB", { skip: !HAS_DB }, async () => {
  const projectId = 1;
  const packageCode = "PKG-TEST-001";

  // 1. Tạo gói thầu
  const pkg = await createBiddingPackage({
    projectId,
    packageCode,
    title: "Gói thầu thử nghiệm PCCC",
    discipline: "FIRE",
    targetBudgetVnd: 500000000,
  });

  assert.ok(pkg.id);
  assert.equal(pkg.packageCode, packageCode);

  // 2. Thêm báo giá
  const quote = await createVendorQuote({
    projectId,
    packageId: pkg.id,
    vendorName: "Nhà Thầu PCCC Việt",
    totalAmountVnd: 480000000,
    lineItems: [
      {
        itemCode: "SPK-01",
        description: "Đầu phun",
        unit: "cái",
        quantity: 200,
        targetUnitRateVnd: 80000,
        quotedUnitRateVnd: 75000,
        stage: "early",
        isCritical: true,
      },
    ],
  });

  assert.ok(quote.id);

  // 3. Phân tích đấu thầu
  const analysis = await runBiddingAnalysis(projectId, pkg.id);
  assert.ok(analysis.provenanceToken.startsWith("BID-ANALYTICS-"));
  assert.equal(analysis.rankings.length, 1);
  assert.equal(analysis.skewReports.length, 1);
});
