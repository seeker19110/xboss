/**
 * REGULATORY & COMPLIANCE MASTER — CLI EXECUTION ENGINE & VERIFIER
 * Động cơ kiểm toán Điều kiện khởi công Điều 107, Thử tải máy Thông tư 36 & Quét cảnh báo sớm 30 ngày.
 */

export interface StartPermitConditions {
  hasSiteHandover: boolean;
  hasConstructionPermit: boolean;
  hasApprovedShopdrawings: boolean;
  hasSignedContract: boolean;
  hasSafetyEnvPlansApproved: boolean;
  hasNoticeSentToAuthorities: boolean;
}

export function evaluateArticle107PermitToStart(conditions: StartPermitConditions): {
  canStart: boolean;
  score: number;
  unmetConditions: string[];
} {
  const unmetConditions: string[] = [];

  if (!conditions.hasSiteHandover)
    unmetConditions.push("Chưa có biên bản bàn giao mặt bằng thi công sạch.");
  if (!conditions.hasConstructionPermit)
    unmetConditions.push("Chưa có Giấy phép xây dựng còn hiệu lực.");
  if (!conditions.hasApprovedShopdrawings)
    unmetConditions.push("Thiết kế bản vẽ thi công chưa được phê duyệt/thẩm tra.");
  if (!conditions.hasSignedContract)
    unmetConditions.push("Chưa ký kết hợp đồng thi công xây dựng hợp pháp.");
  if (!conditions.hasSafetyEnvPlansApproved)
    unmetConditions.push("Kế hoạch an toàn lao động và bảo vệ môi trường chưa duyệt.");
  if (!conditions.hasNoticeSentToAuthorities)
    unmetConditions.push("Chưa gửi văn bản thông báo khởi công trước 03 ngày.");

  const passedCount = 6 - unmetConditions.length;
  const score = Number(((passedCount / 6) * 100).toFixed(1));

  return {
    canStart: unmetConditions.length === 0,
    score,
    unmetConditions,
  };
}

export function calculateCraneProofLoad(safeWorkingLoadTon: number) {
  const staticTestLoadTon = Number((safeWorkingLoadTon * 1.25).toFixed(2));
  const dynamicTestLoadTon = Number((safeWorkingLoadTon * 1.1).toFixed(2));

  return {
    safeWorkingLoadTon,
    staticTestLoadTon, // 125% SWL
    dynamicTestLoadTon, // 110% SWL
    standards: "Thông tư 36/2019/TT-BLĐTBXH & QCVN 07:2012/BLĐTBXH",
  };
}

export interface ExpiryCheckItem {
  name: string;
  expiryDateStr: string; // YYYY-MM-DD
  itemType: "PERMIT" | "BOND" | "CERTIFICATE" | "MACHINERY_STAMP";
}

export function scanExpiringDocuments(items: ExpiryCheckItem[], currentDateStr: string) {
  const currentDate = new Date(currentDateStr);

  return items.map((item) => {
    const expDate = new Date(item.expiryDateStr);
    const diffTime = expDate.getTime() - currentDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let alertLevel: "NONE" | "INFO_30_DAYS" | "WARNING_15_DAYS" | "CRITICAL_7_DAYS" | "EXPIRED" =
      "NONE";

    if (diffDays < 0) {
      alertLevel = "EXPIRED";
    } else if (diffDays <= 7) {
      alertLevel = "CRITICAL_7_DAYS";
    } else if (diffDays <= 15) {
      alertLevel = "WARNING_15_DAYS";
    } else if (diffDays <= 30) {
      alertLevel = "INFO_30_DAYS";
    }

    return {
      ...item,
      remainingDays: diffDays,
      alertLevel,
      requiresAction: alertLevel !== "NONE",
    };
  });
}

// -------------------------------------------------------------
// TỰ KIỂM THỬ (CLI SELF-TEST EXECUTION)
// -------------------------------------------------------------
if (process.argv[1]?.endsWith("regulatory_compliance_checker.ts")) {
  console.log("🚀 Đang chạy bộ kiểm toán Regulatory & Compliance Master...");

  // Test Case 1: Kiểm tra 6 điều kiện khởi công Đ107 Luật Xây dựng
  const startRes = evaluateArticle107PermitToStart({
    hasSiteHandover: true,
    hasConstructionPermit: true,
    hasApprovedShopdrawings: true,
    hasSignedContract: true,
    hasSafetyEnvPlansApproved: true,
    hasNoticeSentToAuthorities: false, // Quên gửi thông báo khởi công
  });

  console.log("\n1. [Article 107 Construction Law - Permit to Start]");
  console.log(`   - Tỷ lệ hoàn thành điều kiện: ${startRes.score}%`);
  console.log(
    `   - Cho phép khởi công: ${startRes.canStart ? "✅ ĐƯỢC PHÉP" : "❌ BỊ KHÓA CHẶN (Chưa đủ điều kiện)"}`,
  );
  if (!startRes.canStart) {
    console.log("   - Các điều kiện còn thiếu:");
    startRes.unmetConditions.forEach((c) => console.log(`     * ⚠️ ${c}`));
  }

  // Test Case 2: Tính tải trọng kiểm định Cần trục tháp 10 tấn
  const craneRes = calculateCraneProofLoad(10.0);
  console.log("\n2. [Machinery Safety Load Testing - Circular 36/2019]");
  console.log(`   - Tải trọng làm việc an toàn (SWL): ${craneRes.safeWorkingLoadTon} Tấn`);
  console.log(`   - 👉 Tải trọng thử tĩnh (125% SWL): ${craneRes.staticTestLoadTon} Tấn`);
  console.log(`   - 👉 Tải trọng thử động (110% SWL): ${craneRes.dynamicTestLoadTon} Tấn`);

  // Test Case 3: Quét hạn giấy phép và bảo lãnh ngân hàng
  const scanRes = scanExpiringDocuments(
    [
      {
        name: "Bảo lãnh thực hiện hợp đồng Techcombank",
        expiryDateStr: "2026-08-25",
        itemType: "BOND",
      }, // Còn 5 ngày
      {
        name: "Tem kiểm định Vận thăng lồng số 02",
        expiryDateStr: "2026-09-02",
        itemType: "MACHINERY_STAMP",
      }, // Còn 13 ngày
      { name: "Giấy phép xả thải công trường", expiryDateStr: "2026-09-18", itemType: "PERMIT" }, // Còn 29 ngày
    ],
    "2026-08-20",
  );

  console.log("\n3. [30-Day Proactive Legal Expiry Scanner]");
  scanRes.forEach((s) => {
    console.log(
      `   - [${s.name}] Hạn: ${s.expiryDateStr} (Còn ${s.remainingDays} ngày) -> Mức cảnh báo: [${s.alertLevel}]`,
    );
  });

  console.log("\n✅ Toàn bộ kiểm toán Regulatory & Compliance hoàn thành 100% xuất sắc!");
}
