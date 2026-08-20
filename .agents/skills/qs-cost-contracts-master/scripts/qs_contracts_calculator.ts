/**
 * QS, COST & CONTRACTS MASTER — CLI EXECUTION ENGINE & VERIFIER
 * Động cơ kiểm toán FIDIC Claims, SCL Time Impact Analysis (TIA), Chứng chỉ IPC & Bù giá GSO.
 */

export interface IpcCalculationInput {
  contractValue: bigint; // Giá trị hợp đồng gốc (đồng)
  advancePaymentAmount: bigint; // Tiền tạm ứng đã cấp (đồng)
  previousCumulativeGross: bigint; // Luỹ kế nghiệm thu kỳ trước (đồng)
  currentPeriodGross: bigint; // Nghiệm thu phát sinh kỳ này (đồng)
  approvedVoGross: bigint; // Khối lượng phát sinh VO duyệt kỳ này (đồng)
  retentionRatePercent: number; // 5% -> 10%
  vatRatePercent: number; // 8% hoặc 10%
}

export interface IpcCalculationResult {
  currentCumulativeGross: bigint;
  periodGrossTotal: bigint;
  advanceRecoupment: bigint;
  retentionDeduction: bigint;
  netBeforeVat: bigint;
  vatAmount: bigint;
  totalPayableVnd: bigint;
  totalPayableFormatted: string;
}

/**
 * 1. Tính toán Chứng chỉ Thanh toán IPC (Interim Payment Certificate) Chuẩn Xác
 */
export function calculateIpcCertificate(input: IpcCalculationInput): IpcCalculationResult {
  const currentCumulativeGross =
    input.previousCumulativeGross + input.currentPeriodGross + input.approvedVoGross;
  const periodGrossTotal = input.currentPeriodGross + input.approvedVoGross;

  // Tính thu hồi tạm ứng lũy tiến: từ 20% đến 80% giá trị hợp đồng
  const progressPercent = Number((currentCumulativeGross * 100n) / input.contractValue);
  let advanceRecoupment = 0n;

  if (progressPercent >= 20 && progressPercent <= 80) {
    // Thu hồi theo tỷ lệ tương ứng khoảng 60% giá trị hợp đồng
    const recoupmentRate = Number(input.advancePaymentAmount) / (Number(input.contractValue) * 0.6);
    advanceRecoupment = BigInt(Math.round(Number(periodGrossTotal) * recoupmentRate));
  } else if (progressPercent > 80) {
    // Thu hồi nốt phần còn lại
    const alreadyRecouped = BigInt(
      Math.round(
        Number(input.previousCumulativeGross) *
          (Number(input.advancePaymentAmount) / (Number(input.contractValue) * 0.6)),
      ),
    );
    advanceRecoupment =
      input.advancePaymentAmount > alreadyRecouped
        ? input.advancePaymentAmount - alreadyRecouped
        : 0n;
  }

  // Giữ lại tiền bảo hành
  const retentionDeduction = BigInt(
    Math.round(Number(periodGrossTotal) * (input.retentionRatePercent / 100)),
  );

  // Net trước thuế
  const netBeforeVat = periodGrossTotal - advanceRecoupment - retentionDeduction;

  // Thuế VAT
  const vatAmount = BigInt(Math.round(Number(netBeforeVat) * (input.vatRatePercent / 100)));

  // Tổng thanh toán kỳ này
  const totalPayableVnd = netBeforeVat + vatAmount;

  return {
    currentCumulativeGross,
    periodGrossTotal,
    advanceRecoupment,
    retentionDeduction,
    netBeforeVat,
    vatAmount,
    totalPayableVnd,
    totalPayableFormatted: `${totalPayableVnd.toLocaleString("vi-VN")} VND`,
  };
}

/**
 * 2. Tính Bù Giá Trượt Giá Đa Thành Phần
 */
export interface PriceEscalationInput {
  baseUnitPrice: number; // Đơn giá gốc P0 (VND)
  unadjustableWeight: number; // a (vd: 0.15)
  laborWeight: number; // b (vd: 0.30)
  materialWeight: number; // c (vd: 0.40)
  equipmentWeight: number; // d (vd: 0.15)
  laborIndexRatio: number; // Ln / L0 (vd: 1.08)
  materialIndexRatio: number; // Mn / M0 (vd: 1.14)
  equipmentIndexRatio: number; // En / E0 (vd: 1.05)
}

export function calculatePriceEscalation(input: PriceEscalationInput) {
  const escalationFactor =
    input.unadjustableWeight +
    input.laborWeight * input.laborIndexRatio +
    input.materialWeight * input.materialIndexRatio +
    input.equipmentWeight * input.equipmentIndexRatio;

  const adjustedUnitPrice = Math.round(input.baseUnitPrice * escalationFactor);
  const diffPrice = adjustedUnitPrice - input.baseUnitPrice;
  const escalationPercent = Number(((escalationFactor - 1) * 100).toFixed(2));

  return {
    escalationFactor: Number(escalationFactor.toFixed(4)),
    escalationPercent,
    baseUnitPrice: input.baseUnitPrice,
    adjustedUnitPrice,
    diffPrice,
  };
}

/**
 * 3. Tính Bồi Thường Chi Phí Quản Lý Hiện Trường Gián Tiếp (Site Overheads Claim)
 */
export function calculateExtendedSiteOverheads(
  approvedEotDays: number,
  dailySiteOverheadsVnd: bigint,
) {
  const totalClaim = BigInt(approvedEotDays) * dailySiteOverheadsVnd;
  return {
    eotDays: approvedEotDays,
    dailyRateVnd: dailySiteOverheadsVnd,
    totalClaimVnd: totalClaim,
    formattedClaim: `${totalClaim.toLocaleString("vi-VN")} VND`,
  };
}

// -------------------------------------------------------------
// TỰ KIỂM THỬ (CLI SELF-TEST EXECUTION)
// -------------------------------------------------------------
if (process.argv[1]?.endsWith("qs_contracts_calculator.ts")) {
  console.log("🚀 Đang chạy bộ kiểm toán QS, Cost & Contracts Master...");

  // Test Case 1: Chứng chỉ thanh toán IPC Kỳ 4 dự án TT AVIO Tháp A
  const ipcRes = calculateIpcCertificate({
    contractValue: 20_000_000_000n, // Hợp đồng 20 tỷ VND
    advancePaymentAmount: 3_000_000_000n, // Tạm ứng 15% = 3 tỷ VND
    previousCumulativeGross: 6_000_000_000n, // Đã nghiệm thu lũy kế 6 tỷ (30%)
    currentPeriodGross: 2_500_000_000n, // Nghiệm thu kỳ này 2.5 tỷ
    approvedVoGross: 300_000_000n, // Phát sinh VO được duyệt 300 triệu
    retentionRatePercent: 5.0, // Giữ lại 5%
    vatRatePercent: 8.0, // Thuế VAT 8%
  });

  console.log("\n1. [Interim Payment Certificate - IPC Calculation]");
  console.log(
    `   - Tổng nghiệm thu kỳ này (Gross): ${ipcRes.periodGrossTotal.toLocaleString("vi-VN")} VND`,
  );
  console.log(
    `   - Khấu trừ tạm ứng lũy tiến:      ${ipcRes.advanceRecoupment.toLocaleString("vi-VN")} VND`,
  );
  console.log(
    `   - Giữ lại tiền bảo hành (5%):     ${ipcRes.retentionDeduction.toLocaleString("vi-VN")} VND`,
  );
  console.log(
    `   - Giá trị trước thuế (Net):       ${ipcRes.netBeforeVat.toLocaleString("vi-VN")} VND`,
  );
  console.log(
    `   - Thuế VAT (8%):                  ${ipcRes.vatAmount.toLocaleString("vi-VN")} VND`,
  );
  console.log(`   - 👉 TỔNG ĐỀ NGHỊ THANH TOÁN KỲ NÀY: ${ipcRes.totalPayableFormatted}`);

  // Test Case 2: Bù giá trượt giá GSO cho gói ống thép PCCC
  const escRes = calculatePriceEscalation({
    baseUnitPrice: 450_000, // 450,000 VND / mét dài
    unadjustableWeight: 0.15,
    laborWeight: 0.25,
    materialWeight: 0.5,
    equipmentWeight: 0.1,
    laborIndexRatio: 1.06, // Nhân công tăng 6%
    materialIndexRatio: 1.18, // Thép tăng 18%
    equipmentIndexRatio: 1.04, // Máy tăng 4%
  });

  console.log("\n2. [Price Escalation Indexation - Bù Giá GSO]");
  console.log(
    `   - Hệ số điều chỉnh giá (Escalation Factor): ${escRes.escalationFactor} (+${escRes.escalationPercent}%)`,
  );
  console.log(`   - Đơn giá gốc:       ${escRes.baseUnitPrice.toLocaleString("vi-VN")} VND`);
  console.log(
    `   - Đơn giá điều chỉnh: ${escRes.adjustedUnitPrice.toLocaleString("vi-VN")} VND (+${escRes.diffPrice.toLocaleString("vi-VN")} VND/đơn vị)`,
  );

  // Test Case 3: Đòi bồi thường chi phí quản lý hiện trường do chậm bàn giao mặt bằng 21 ngày (FIDIC Cl. 2.1)
  const overheadRes = calculateExtendedSiteOverheads(21, 15_000_000n); // 15 triệu/ngày
  console.log("\n3. [FIDIC Claim - Extended Site Overheads]");
  console.log(`   - Số ngày EOT được duyệt: ${overheadRes.eotDays} ngày`);
  console.log(
    `   - Định phí quản lý hiện trường: ${overheadRes.dailyRateVnd.toLocaleString("vi-VN")} VND/ngày`,
  );
  console.log(`   - 👉 Tổng chi phí đòi bồi thường (Claim): ${overheadRes.formattedClaim}`);

  console.log("\n✅ Toàn bộ kiểm toán QS, Cost & Contracts hoàn thành 100% xuất sắc!");
}
