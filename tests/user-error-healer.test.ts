import { test } from "node:test";
import assert from "node:assert/strict";
import {
  healVietnameseEncoding,
  removeVietnameseAccents,
  healDateString,
  healMoneyValue,
  healBoqCode,
  levenshteinDistance,
  stringSimilarity,
  fuzzyMatchDictionary,
  reconcileTaskState,
  healExcelRowData,
  fieldLevel3WayMerge,
  healExcelFormulaError,
  detectInputAnomalies,
  parseComplexFieldCommandWithContext,
  createTimeTravelSnapshot,
  reconstructMatrixHierarchy,
} from "@/lib/nen/user-error-healer";

test("1. healVietnameseEncoding: Chuyển đổi sạch TCVN3, VNI và dọn sạch ký tự tàng hình", () => {
  const tcvn3Text = "B\xB8ng ti\xCA ti\xBA n \u0111\xF4";
  const healedTcvn3 = healVietnameseEncoding(tcvn3Text);
  assert.ok(healedTcvn3.length > 0);

  const hiddenChars = "D\u1EF1 \u00E1n\u200B TT\u00A0 AVIO\uFEFF";
  const cleaned = healVietnameseEncoding(hiddenChars);
  assert.strictEqual(cleaned, "Dự án TT AVIO");

  const nfd = "tổ đội".normalize("NFD");
  const nfc = healVietnameseEncoding(nfd);
  assert.strictEqual(nfc, "tổ đội");
});

test("2. removeVietnameseAccents: Bỏ dấu chính xác cho tìm kiếm mờ", () => {
  const text = "Ống thoát nước uPVC D110 và Máng cáp điện";
  const unaccented = removeVietnameseAccents(text);
  assert.strictEqual(unaccented, "ong thoat nuoc upvc d110 va mang cap dien");
});

test("3. healDateString: Chuyển đổi mọi định dạng ngày kỳ quặc sang ISO YYYY-MM-DD", () => {
  assert.strictEqual(healDateString(46254), "2026-08-20");
  assert.strictEqual(healDateString(45321), "2024-01-30");
  assert.strictEqual(healDateString("20/08/2026"), "2026-08-20");
  assert.strictEqual(healDateString("5/8/2026"), "2026-08-05");
  assert.strictEqual(healDateString("20.08.2026"), "2026-08-20");
  assert.strictEqual(healDateString("08/20/2026"), "2026-08-20");
  assert.strictEqual(healDateString("2026-08-20"), "2026-08-20");

  const d = new Date(Date.UTC(2026, 7, 20));
  assert.strictEqual(healDateString(d), "2026-08-20");

  assert.strictEqual(healDateString("khong_phai_ngay"), null);
  assert.strictEqual(healDateString(null), null);
});

test("4. healMoneyValue: Chuẩn hóa tiền tệ không sai lệch xu và xử lý từ viết tắt", () => {
  const m1 = healMoneyValue("12.500.000 đ");
  assert.ok(m1 !== null);
  assert.strictEqual(m1.numericValue, 12500000);
  assert.strictEqual(m1.valueBigIntUnits, 1250000000n);

  const m2 = healMoneyValue("12.5 tr");
  assert.ok(m2 !== null);
  assert.strictEqual(m2.numericValue, 12500000);

  const m3 = healMoneyValue("1.2 ty");
  assert.ok(m3 !== null);
  assert.strictEqual(m3.numericValue, 1200000000);

  const m4 = healMoneyValue("500k");
  assert.ok(m4 !== null);
  assert.strictEqual(m4.numericValue, 500000);

  const m5 = healMoneyValue("- 250.000 VND");
  assert.ok(m5 !== null);
  assert.strictEqual(m5.numericValue, -250000);

  const m6 = healMoneyValue(5000000);
  assert.ok(m6 !== null);
  assert.strictEqual(m6.numericValue, 5000000);

  assert.strictEqual(healMoneyValue(""), null);
  assert.strictEqual(healMoneyValue(null), null);
});

test("5. healBoqCode: Chuẩn hóa mọi biến thể mã hiệu BOQ", () => {
  assert.strictEqual(healBoqCode(" a1,01 "), "A1.01");
  assert.strictEqual(healBoqCode("A1-01"), "A1.01");
  assert.strictEqual(healBoqCode("a1_01"), "A1.01");
  assert.strictEqual(healBoqCode("A1 . 01"), "A1.01");
  assert.strictEqual(healBoqCode("a1..01..02"), "A1.01.02");
});

test("6. levenshteinDistance & stringSimilarity: Tính toán tương đồng chuỗi chính xác", () => {
  const dist = levenshteinDistance("ong thoat nuoc", "ong thoat nuc");
  assert.strictEqual(dist, 1);

  const sim1 = stringSimilarity("ong thoat nuoc upvc d110", "ong upvc d110");
  assert.ok(sim1 >= 0.6);

  const sim2 = stringSimilarity("hoan toan khac", "khong lien quan");
  assert.ok(sim2 < 0.5);
});

test("7. fuzzyMatchDictionary: Ghép nối mờ chính xác với từ điển chuyên ngành", () => {
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

  const res1 = fuzzyMatchDictionary("ong nhua tien phong 110", dictionary);
  assert.ok(res1.match !== null);
  assert.strictEqual(res1.match?.key, "UPVC_D110");
  assert.ok(res1.confidence >= 0.65);

  const res2 = fuzzyMatchDictionary("ong gjo ton lanh", dictionary);
  assert.ok(res2.match !== null);
  assert.strictEqual(res2.match?.key, "HVAC_DUCT");

  const res3 = fuzzyMatchDictionary("mon an nha hang", dictionary);
  assert.strictEqual(res3.match, null);
});

test("8. reconcileTaskState: Tự động nắn chỉnh tiến độ và bảo vệ bất biến trạng thái", () => {
  const r1 = reconcileTaskState({
    currentStatus: "chuan_bi",
    currentProgress: 0,
    targetStatus: "nghiem_thu",
    targetProgress: 60,
    hasEndDatePassed: false,
  });
  assert.strictEqual(r1.safeStatus, "dang_thi_cong");
  assert.strictEqual(r1.safeProgress, 0.6);
  assert.strictEqual(r1.autoCorrected, true);

  const r2 = reconcileTaskState({
    currentStatus: "nghiem_thu",
    currentProgress: 1.0,
    targetProgress: 0.8,
    isApproved: false,
  });
  assert.strictEqual(r2.safeStatus, "nghiem_thu");
  assert.strictEqual(r2.safeProgress, 1.0);
  assert.strictEqual(r2.autoCorrected, true);

  const r3 = reconcileTaskState({
    currentStatus: "dang_thi_cong",
    currentProgress: 0.5,
    hasEndDatePassed: true,
  });
  assert.strictEqual(r3.safeStatus, "tre");
  assert.strictEqual(r3.safeProgress, 0.5);

  const r4 = reconcileTaskState({
    currentStatus: "chuan_bi",
    currentProgress: 0,
    targetProgress: -0.2,
  });
  assert.strictEqual(r4.safeProgress, 0);
  assert.strictEqual(r4.autoCorrected, true);
});

test("9. healExcelRowData: Tự động ánh xạ header bẩn và làm sạch dòng dữ liệu", () => {
  const rawExcelRow = {
    "MÃ HIỆU CV": " a1,05 ",
    "Hạng mục thi công": "Lắp đặt ống nước D110\u200B",
    "Đơn vị tính": "mét",
    "Khối lượng dự toán": "150,5",
    "Đơn giá": "120.000 đ",
    "Ngày bắt đầu": 46254,
    "Hạn hoàn thành": "20/08/2026",
  };

  const healed = healExcelRowData(rawExcelRow);
  assert.strictEqual(healed.boq_code, "A1.05");
  assert.strictEqual(healed.unit, "mét");
  assert.strictEqual(healed.quantity, 150.5);
  assert.strictEqual(healed.unit_price, 120000);
  assert.strictEqual(healed.start_date, "2026-08-20");
  assert.strictEqual(healed.end_date, "2026-08-20");
});

test("10. fieldLevel3WayMerge: Hợp nhất trường độc lập bảo toàn dữ liệu đa người dùng", () => {
  const base = {
    task_name: "Lắp ống nước",
    progress: 0.5,
    note: "Ghi chú gốc",
    assigned_to: "Thợ Tâm",
  };

  const user1 = {
    task_name: "Lắp ống nước",
    progress: 0.8,
    note: "Ghi chú gốc",
    assigned_to: "Thợ Tâm",
  };

  const user2 = {
    task_name: "Lắp ống nước",
    progress: 0.5,
    note: "Đã giao thêm vật tư",
    assigned_to: "Thợ Hùng",
  };

  const res = fieldLevel3WayMerge(base, user1, user2);
  assert.strictEqual(res.merged.progress, 0.8);
  assert.strictEqual(res.merged.note, "Đã giao thêm vật tư");
  assert.strictEqual(res.merged.assigned_to, "Thợ Hùng");
});

test("11. [TẦNG CAO MỚI] healExcelFormulaError: Phục hồi công thức gãy #REF!, #VALUE!, #DIV/0!", () => {
  // Ca 1: Ô bị #REF! được phục hồi bằng tổng các ô con
  const res1 = healExcelFormulaError("#REF!", {
    siblings: [100, 250, 150],
    formulaType: "sum",
  });
  assert.strictEqual(res1.healed, true);
  assert.strictEqual(res1.value, 500);

  // Ca 2: Ô bị #DIV/0! được phục hồi bằng trung bình
  const res2 = healExcelFormulaError("#DIV/0!", {
    siblings: [10, 20, 30],
    formulaType: "avg",
  });
  assert.strictEqual(res2.healed, true);
  assert.strictEqual(res2.value, 20);

  // Ca 3: Ô bình thường không bị can thiệp
  const res3 = healExcelFormulaError(123.45);
  assert.strictEqual(res3.healed, false);
  assert.strictEqual(res3.value, 123.45);
});

test("12. [TẦNG CAO MỚI] detectInputAnomalies: Phát hiện số liệu bất thường bằng Z-Score", () => {
  const history = [50, 52, 48, 51, 49, 53, 50]; // Trung bình ~50.4

  // Ca 1: Nhập 52m -> Bình thường
  const checkNormal = detectInputAnomalies({
    field: "Khối lượng ống",
    value: 52,
    historicalValues: history,
  });
  assert.strictEqual(checkNormal.isAnomaly, false);
  assert.strictEqual(checkNormal.severity, "none");

  // Ca 2: Gõ nhầm 500m (gõ thừa số 0) -> Critical Anomaly!
  const checkOutlier = detectInputAnomalies({
    field: "Khối lượng ống",
    value: 500,
    historicalValues: history,
  });
  assert.strictEqual(checkOutlier.isAnomaly, true);
  assert.strictEqual(checkOutlier.severity, "critical");
  assert.strictEqual(checkOutlier.suggestedValue, 50); // Gợi ý giá trị median
  assert.ok(checkOutlier.zScore > 10);
});

test("13. [TẦNG CAO MỚI] parseComplexFieldCommandWithContext: Giải mã khẩu lệnh ngữ cảnh sâu", () => {
  const recentTasks = [
    { id: "TASK-101", name: "Lắp đặt ống thoát nước uPVC D110", floor: "10", zone: "1" },
    { id: "TASK-102", name: "Kéo rải cáp điện ngầm", floor: "10", zone: "2" },
  ];
  const activeUsers = [
    { id: "USR-01", name: "Thợ Minh Tâm" },
    { id: "USR-02", name: "Kỹ sư Trần Hùng" },
  ];

  const commandText =
    "Sáng nay Zone 1 tầng 10 hoàn thành 120m ống thoát nước, chuyển thợ Minh Tâm qua làm tiếp";
  const result = parseComplexFieldCommandWithContext({
    text: commandText,
    recentTasks,
    activeUsers,
  });

  assert.strictEqual(result.targetFloor, "10");
  assert.strictEqual(result.targetZone, "1");
  assert.strictEqual(result.quantity, 120);
  assert.strictEqual(result.unit, "m");
  assert.ok(result.intents.includes("update_progress"));
  assert.ok(result.intents.includes("assign_worker"));
  assert.strictEqual(result.matchedTask?.id, "TASK-101");
  assert.strictEqual(result.assignedUser?.id, "USR-01");
  assert.ok(result.confidence >= 0.7);
});

test("14. [TẦNG CAO MỚI] createTimeTravelSnapshot: Đóng gói bản chụp du hành thời gian có mã băm SHA-256", () => {
  const payload = {
    work_package_id: "WP-01",
    tasks_count: 25,
    total_budget: 1500000000,
  };

  const snapshot = createTimeTravelSnapshot("bulk_update", "WP-01", payload);
  assert.ok(snapshot.snapshotId.startsWith("SNAP-"));
  assert.strictEqual(snapshot.entityType, "bulk_update");
  assert.strictEqual(snapshot.entityId, "WP-01");
  assert.strictEqual(snapshot.payloadHash.length, 64); // 64 hex chars of SHA-256
  assert.deepStrictEqual(snapshot.data, payload);
});

test("15. [TẦNG CAO MỚI] reconstructMatrixHierarchy: Tự động tái dựng cây WBS từ bảng tính dị tật", () => {
  const rawRows = [
    { "MÃ HIỆU": "A1", "Tên công việc": "HỆ THỐNG CẤP NƯỚC" },
    { "MÃ HIỆU": "A1.01", "Tên công việc": "Lắp ống PPR D25", "Khối lượng": "100" },
    { "MÃ HIỆU": "A1.02", "Tên công việc": "Lắp ống PPR D32", "Khối lượng": "50" },
    { "MÃ HIỆU": "A2", "Tên công việc": "HỆ THỐNG THOÁT NƯỚC" },
    { "MÃ HIỆU": "A2.01", "Tên công việc": "Lắp ống uPVC D110", "Khối lượng": "80" },
  ];

  const groups = reconstructMatrixHierarchy(rawRows);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].groupCode, "A1");
  assert.strictEqual(groups[0].groupName, "HỆ THỐNG CẤP NƯỚC");
  assert.strictEqual(groups[0].tasks.length, 2);
  assert.strictEqual(groups[1].groupCode, "A2");
  assert.strictEqual(groups[1].groupName, "HỆ THỐNG THOÁT NƯỚC");
  assert.strictEqual(groups[1].tasks.length, 1);
});
