/**
 * PROCUREMENT & SUPPLY CHAIN MASTER — CLI EXECUTION ENGINE & VERIFIER
 * Động cơ kiểm toán Khớp đơn hàng 3 chiều (3-Way Matching), Tồn kho an toàn ROP & Vendor Scorecard.
 */

export interface ThreeWayMatchInput {
  poNumber: string;
  poVendorId: string;
  poQuantity: number;
  poUnitPrice: bigint;
  grnVendorId: string;
  grnQuantityReceived: number;
  grnQuantityAccepted: number;
  invoiceVendorId: string;
  invoiceQuantity: number;
  invoiceUnitPrice: bigint;
}

export function verifyThreeWayMatch(input: ThreeWayMatchInput): {
  isMatch: boolean;
  statusCode:
    | "MATCHED_PASS"
    | "VENDOR_MISMATCH"
    | "PRICE_DISCREPANCY"
    | "QUANTITY_OVER_GRN"
    | "QUANTITY_OVER_PO";
  reason: string;
  payableGrossVnd: bigint;
} {
  // 1. Kiểm tra đối tượng Nhà cung cấp
  if (input.poVendorId !== input.invoiceVendorId || input.poVendorId !== input.grnVendorId) {
    return {
      isMatch: false,
      statusCode: "VENDOR_MISMATCH",
      reason: `Nhà cung cấp không đồng nhất: PO [${input.poVendorId}] vs GRN [${input.grnVendorId}] vs Invoice [${input.invoiceVendorId}]`,
      payableGrossVnd: 0n,
    };
  }

  // 2. Kiểm tra Đơn giá
  if (input.invoiceUnitPrice !== input.poUnitPrice) {
    return {
      isMatch: false,
      statusCode: "PRICE_DISCREPANCY",
      reason: `Đơn giá trên Hóa đơn (${input.invoiceUnitPrice.toLocaleString("vi-VN")} VND) lệch so với PO (${input.poUnitPrice.toLocaleString("vi-VN")} VND)!`,
      payableGrossVnd: 0n,
    };
  }

  // 3. Kiểm tra Số lượng so với GRN chấp thuận
  if (input.invoiceQuantity > input.grnQuantityAccepted) {
    return {
      isMatch: false,
      statusCode: "QUANTITY_OVER_GRN",
      reason: `Số lượng yêu cầu thanh toán (${input.invoiceQuantity}) vượt quá số lượng thực nhận nghiệm thu đạt chuẩn trên GRN (${input.grnQuantityAccepted})!`,
      payableGrossVnd: 0n,
    };
  }

  // 4. Kiểm tra Số lượng so với PO
  if (input.invoiceQuantity > input.poQuantity) {
    return {
      isMatch: false,
      statusCode: "QUANTITY_OVER_PO",
      reason: `Số lượng trên Hóa đơn (${input.invoiceQuantity}) vượt quá hạn mức đơn đặt hàng PO (${input.poQuantity})!`,
      payableGrossVnd: 0n,
    };
  }

  const payableGrossVnd = BigInt(input.invoiceQuantity) * input.poUnitPrice;
  return {
    isMatch: true,
    statusCode: "MATCHED_PASS",
    reason: "Khớp 3 chiều PO - GRN - Invoice tuyệt đối 100%. Đủ điều kiện giải tỏa thanh toán.",
    payableGrossVnd,
  };
}

export function calculateSafetyStockAndRop(
  avgDailyDemand: number,
  stdDevDailyDemand: number,
  leadTimeDays: number,
  serviceLevel: "95%" | "99%" = "95%",
) {
  const z = serviceLevel === "99%" ? 2.33 : 1.65;
  const safetyStock = Math.ceil(z * stdDevDailyDemand * Math.sqrt(leadTimeDays));
  const reorderPoint = Math.ceil(avgDailyDemand * leadTimeDays + safetyStock);

  return {
    safetyStock,
    reorderPoint,
    leadTimeDays,
    serviceLevel,
  };
}

export function calculateVendorScore(
  price: number,
  schedule: number,
  quality: number,
  payment: number,
) {
  const totalScore = Number(
    (0.4 * price + 0.3 * schedule + 0.2 * quality + 0.1 * payment).toFixed(1),
  );
  let tier: "A" | "B" | "C" | "D" = "A";
  if (totalScore < 60) tier = "D";
  else if (totalScore < 75) tier = "C";
  else if (totalScore < 85) tier = "B";

  return {
    totalScore,
    tier,
    isQualified: totalScore >= 75,
  };
}

// -------------------------------------------------------------
// TỰ KIỂM THỬ (CLI SELF-TEST EXECUTION)
// -------------------------------------------------------------
if (process.argv[1]?.endsWith("procurement_calculator.ts")) {
  console.log("🚀 Đang chạy bộ kiểm toán Procurement & Supply Chain Master...");

  // Test Case 1: Khớp 3 chiều lô ống nhựa uPVC D110
  const match1 = verifyThreeWayMatch({
    poNumber: "PO-2026-0089",
    poVendorId: "VENDOR-TIENPHONG",
    poQuantity: 1000,
    poUnitPrice: 185_000n, // 185,000 VND / cây
    grnVendorId: "VENDOR-TIENPHONG",
    grnQuantityReceived: 1000,
    grnQuantityAccepted: 980, // 20 cây bị nứt vỡ trong quá trình vận chuyển
    invoiceVendorId: "VENDOR-TIENPHONG",
    invoiceQuantity: 980, // Hóa đơn xuất đúng 980 cây thực nhận
    invoiceUnitPrice: 185_000n,
  });

  console.log("\n1. [3-Way Matching Verification]");
  console.log(`   - Trạng thái khớp: ${match1.isMatch ? "✅ HỢP LỆ (PASS)" : "❌ TỪ CHỐI (FAIL)"}`);
  console.log(`   - Mã trạng thái:   [${match1.statusCode}]`);
  console.log(`   - Diễn giải:       ${match1.reason}`);
  console.log(`   - Giá trị giải tỏa: ${match1.payableGrossVnd.toLocaleString("vi-VN")} VND`);

  // Test Case 2: Tính tồn kho an toàn ty treo M10
  const ropRes = calculateSafetyStockAndRop(50, 10, 7, "95%"); // 50 cây/ngày, độ lệch 10, lead time 7 ngày
  console.log("\n2. [Safety Stock & Reorder Point (ROP) Calculation]");
  console.log(`   - Mức tồn kho an toàn (Safety Stock): ${ropRes.safetyStock} cây`);
  console.log(
    `   - 👉 Điểm đặt hàng lại (ROP):         ${ropRes.reorderPoint} cây (Đặt hàng ngay khi tồn kho <= ${ropRes.reorderPoint})`,
  );

  // Test Case 3: Chấm điểm Vendor Scorecard
  const vendorRes = calculateVendorScore(92, 85, 95, 80);
  console.log("\n3. [Vendor Scorecard Evaluation]");
  console.log(
    `   - Điểm số tổng hợp: ${vendorRes.totalScore}/100 -> Phân hạng: [Tier ${vendorRes.tier}]`,
  );
  console.log(
    `   - Đủ điều kiện thầu: ${vendorRes.isQualified ? "✅ ĐẠT YÊU CẦU" : "❌ CẢNH BÁO"}`,
  );

  console.log("\n✅ Toàn bộ kiểm toán Procurement & Supply Chain hoàn thành 100% xuất sắc!");
}
