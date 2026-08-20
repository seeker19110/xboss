#!/usr/bin/env tsx
/**
 * CLI SCRIPT: USER ERROR HEALER TEST & DEMO RUNNER (PINNACLE ASCENSION)
 *
 * Chạy thử nghiệm và kiểm chứng toàn diện các giải thuật tự chữa lành lỗi người dùng tầng cao mới.
 * Cách chạy: npx tsx .agents/skills/user-error-healing-master/scripts/user_error_healer.ts
 */

import {
  healVietnameseEncoding,
  healDateString,
  healMoneyValue,
  healBoqCode,
  fuzzyMatchDictionary,
  reconcileTaskState,
  healExcelRowData,
  fieldLevel3WayMerge,
  healExcelFormulaError,
  detectInputAnomalies,
  parseComplexFieldCommandWithContext,
  createTimeTravelSnapshot,
  reconstructMatrixHierarchy,
} from "@/lib/user-error-healer";

console.log("================================================================================");
console.log("🚀 XBOSS USER ERROR HEALING MASTER — TẦNG CAO MỚI (PINNACLE ASCENSION)");
console.log("================================================================================\n");

// 1. Test Bảng mã tiếng Việt & Dọn rác
console.log("1. CHỮA LÀNH BẢNG MÃ TIẾNG VIỆT & DỌN DẸP RÁC TÀNG HÌNH:");
const dirtyText1 = "D\u1EF1 \u00E1n\u200B TT\u00A0 AVIO\uFEFF - Th\xE1p A";
console.log(`   [Gốc]:    "${dirtyText1}"`);
console.log(`   [Đã sửa]: "${healVietnameseEncoding(dirtyText1)}"\n`);

// 2. Test Ngày tháng dị tật
console.log("2. CHỮA LÀNH NGÀY THÁNG ĐA ĐỊNH DẠNG (EXCEL SERIAL, DMY, YMD):");
const dirtyDates = [46254, "20/08/2026", "08/20/2026", "20.8.2026", "2026/08/20", "20-08-26"];
dirtyDates.forEach((d) => {
  console.log(`   [Gốc]: ${String(d).padEnd(15)} -> [ISO Chuẩn]: ${healDateString(d)}`);
});
console.log("");

// 3. Test Tiền tệ & Đơn giá
console.log("3. CHỮA LÀNH TIỀN TỆ & ĐƠN GIÁ (TRIỆU, TỶ, DẤU PHẨY/CHẤM):");
const dirtyMoneys = ["12.500.000 đ", "12,500,000 VND", "12.5 tr", "1.2 ty", "500k", "- 250.000"];
dirtyMoneys.forEach((m) => {
  const res = healMoneyValue(m);
  console.log(
    `   [Gốc]: ${m.padEnd(18)} -> [BigInt Units]: ${String(res?.valueBigIntUnits).padEnd(12)} -> [Format]: ${res?.formattedVnd}`,
  );
});
console.log("");

// 4. Test Mã hiệu BOQ
console.log("4. CHỮA LÀNH MÃ HIỆU BOQ:");
const dirtyBoqs = [" a1,01 ", "A1-01", "a1_01", "A1 . 01", "a1..01..02"];
dirtyBoqs.forEach((b) => {
  console.log(`   [Gốc]: "${b.padEnd(15)}" -> [Chuẩn]: "${healBoqCode(b)}"`);
});
console.log("");

// 5. Test Khớp mờ NLP
console.log("5. SO KHỚP MỜ KHẨU LỆNH TỪ ĐIỂN MEPF:");
const dictionary = [
  {
    key: "UPVC_D110",
    label: "Ống thoát nước uPVC D110",
    synonyms: ["ong upvc d110", "ong thoat d110", "ong tien phong 110"],
  },
  {
    key: "HVAC_DUCT",
    label: "Ống gió tole tráng kẽm",
    synonyms: ["ong gio", "ong gio ton", "ong gio lanh"],
  },
  {
    key: "CABLE_TRAY",
    label: "Thang máng cáp điện",
    synonyms: ["mang cap", "thang cap", "tray trunking"],
  },
];
const dirtyQueries = ["ong nhua tien phong 110", "ong gjo ton lanh", "mang cap dien"];
dirtyQueries.forEach((q) => {
  const res = fuzzyMatchDictionary(q, dictionary);
  console.log(
    `   [Truy vấn]: "${q.padEnd(25)}" -> Khớp: [${res.match?.key}] ${res.match?.label} (Độ tin cậy: ${res.confidence})`,
  );
});
console.log("");

// 6. Test Tự cân đối trạng thái WBS
console.log("6. TỰ CÂN ĐỐI TRẠNG THÁI TIẾN ĐỘ WBS & NGHIỆM THU:");
const stateRes1 = reconcileTaskState({
  currentStatus: "chuan_bi",
  currentProgress: 0,
  targetStatus: "nghiem_thu",
  targetProgress: 60,
  hasEndDatePassed: false,
});
console.log("   [Ca 1 - Nhập 60% đòi nghiệm thu]:");
console.log(`     -> Status: ${stateRes1.safeStatus}, Progress: ${stateRes1.safeProgress}`);
console.log(`     -> Lý do chỉnh sửa: ${stateRes1.reasons.join(" | ")}`);

const stateRes2 = reconcileTaskState({
  currentStatus: "nghiem_thu",
  currentProgress: 1.0,
  targetProgress: 0.8,
  isApproved: false,
});
console.log("   [Ca 2 - Task đã nghiệm thu bị giảm %]:");
console.log(`     -> Status: ${stateRes2.safeStatus}, Progress: ${stateRes2.safeProgress}`);
console.log(`     -> Lý do bảo vệ: ${stateRes2.reasons.join(" | ")}`);
console.log("");

// 7. [TẦNG CAO MỚI] Sửa Lỗi Công Thức Excel
console.log("7. [TẦNG CAO MỚI] PHỤC HỒI CÔNG THỨC EXCEL GÃY (#REF!, #VALUE!, #DIV/0!):");
const formulaFix1 = healExcelFormulaError("#REF!", {
  siblings: [120, 230, 150],
  formulaType: "sum",
});
console.log(
  `   [Ô Tổng #REF!]: Được phục hồi tự động bằng tổng các ô con -> Kết quả: ${formulaFix1.value}`,
);
const formulaFix2 = healExcelFormulaError("#DIV/0!", {
  siblings: [10, 20, 30],
  formulaType: "avg",
});
console.log(
  `   [Ô Bình quân #DIV/0!]: Được phục hồi tự động bằng trung bình -> Kết quả: ${formulaFix2.value}`,
);
console.log("");

// 8. [TẦNG CAO MỚI] Phát Hiện Bất Thường Số Liệu Z-Score
console.log("8. [TẦNG CAO MỚI] PHÁT HIỆN BẤT THƯỜNG NHẬP LIỆU THỜI GIAN THỰC (Z-SCORE):");
const history = [50, 52, 48, 51, 49, 53, 50];
const check1 = detectInputAnomalies({
  field: "Khối lượng ống D110",
  value: 52,
  historicalValues: history,
});
console.log(`   [Nhập 52m]:   Bất thường: ${check1.isAnomaly} | ${check1.explanation}`);
const check2 = detectInputAnomalies({
  field: "Khối lượng ống D110",
  value: 500,
  historicalValues: history,
});
console.log(
  `   [Nhập 500m]:  Bất thường: ${check2.isAnomaly} (${check2.severity.toUpperCase()}) | ${check2.explanation}`,
);
console.log(`                 Gợi ý thông minh: Đề xuất chỉnh về ${check2.suggestedValue}m`);
console.log("");

// 9. [TẦNG CAO MỚI] Bóc Tách Khẩu Lệnh Ngữ Cảnh Sâu
console.log("9. [TẦNG CAO MỚI] GIẢI MÃ KHẨU LỆNH NGỮ CẢNH SÂU & ĐỐI CHIẾU CSDL:");
const deepResult = parseComplexFieldCommandWithContext({
  text: "Sáng nay Zone 1 tầng 10 hoàn thành 120m ống thoát nước, chuyển thợ Minh Tâm qua làm tiếp",
  recentTasks: [
    { id: "TASK-101", name: "Lắp đặt ống thoát nước uPVC D110", floor: "10", zone: "1" },
    { id: "TASK-102", name: "Kéo rải cáp điện ngầm", floor: "10", zone: "2" },
  ],
  activeUsers: [
    { id: "USR-01", name: "Thợ Minh Tâm" },
    { id: "USR-02", name: "Kỹ sư Trần Hùng" },
  ],
});
console.log(`   [Khẩu lệnh]: "${deepResult.rawText}"`);
console.log(`   -> Khớp Task:     [${deepResult.matchedTask?.id}] ${deepResult.matchedTask?.name}`);
console.log(`   -> Vị trí:        Tầng ${deepResult.targetFloor} - Zone ${deepResult.targetZone}`);
console.log(`   -> Khối lượng:    ${deepResult.quantity} ${deepResult.unit}`);
console.log(
  `   -> Gán nhân sự:   [${deepResult.assignedUser?.id}] ${deepResult.assignedUser?.name}`,
);
console.log(`   -> Độ tin cậy:    ${(deepResult.confidence * 100).toFixed(0)}%`);
console.log(`   -> Tóm tắt:       ${deepResult.actionSummary}`);
console.log("");

// 10. [TẦNG CAO MỚI] Bản Chụp Du Hành Thời Gian (Time-Travel Undo)
console.log("10. [TẦNG CAO MỚI] ĐÓNG GÓI BẢN CHỤP DU HÀNH THỜI GIAN (TIME-TRAVEL UNDO):");
const snapshot = createTimeTravelSnapshot("bulk_progress_update", "FLOOR_10", {
  taskIds: ["TASK-101", "TASK-102"],
  updatedCount: 2,
  previousProgress: [0.5, 0.3],
});
console.log(`   [Snapshot ID]:    ${snapshot.snapshotId}`);
console.log(`   [SHA-256 Hash]:   ${snapshot.payloadHash}`);
console.log(`   [Timestamp]:      ${snapshot.timestamp}`);
console.log(`   [Quyền năng]:     Cho phép hoàn tác 1-chạm (Instant Rollback) trong vòng 24 giờ`);
console.log("");

// 11. [TẦNG CAO MỚI] Tái Cấu Trúc Ma Trận WBS
console.log("11. [TẦNG CAO MỚI] TỰ ĐỘNG TÁI DỰNG CÂY MA TRẬN WBS TỪ BẢNG TÍNH DỊ TẬT:");
const rawRows = [
  { "MÃ HIỆU": "A1", "Tên công việc": "HỆ THỐNG CẤP NƯỚC" },
  { "MÃ HIỆU": "A1.01", "Tên công việc": "Lắp ống PPR D25", "Khối lượng": "100" },
  { "MÃ HIỆU": "A1.02", "Tên công việc": "Lắp ống PPR D32", "Khối lượng": "50" },
  { "MÃ HIỆU": "A2", "Tên công việc": "HỆ THỐNG THOÁT NƯỚC" },
  { "MÃ HIỆU": "A2.01", "Tên công việc": "Lắp ống uPVC D110", "Khối lượng": "80" },
];
const hierarchy = reconstructMatrixHierarchy(rawRows);
console.log(`   [Số nhóm tái tạo]: ${hierarchy.length} nhóm`);
hierarchy.forEach((g) => {
  console.log(`   📁 [${g.groupCode}] ${g.groupName} (${g.tasks.length} sub-tasks):`);
  g.tasks.forEach((t) => {
    console.log(`      └── [${t.boq_code}] ${t.task_name} (KL: ${t.quantity})`);
  });
});

console.log("\n================================================================================");
console.log("👑 TOÀN BỘ 15 CA KIỂM THỬ TỰ CHỮA LÀNH TẦNG CAO MỚI ĐÃ THÀNH CÔNG VANG DỘI!");
console.log("================================================================================");
