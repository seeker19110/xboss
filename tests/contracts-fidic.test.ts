import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapDelayEventToFidicClause,
  checkNoticeCompliance,
  calculateTimeImpactAnalysis,
  generateFidicClaimDossier,
  analyzeFidicTiaClaim,
  saveFidicTiaClaim,
  listFidicTiaClaims,
  createFidicClaim,
  listFidicClaims,
} from "@/lib/tai-chinh/contracts-fidic";

// ============================================================================
// 1. Ánh xạ điều khoản FIDIC — đây là bảng tra cứu pháp lý, sai một điều khoản
// là kỹ sư dẫn sai căn cứ khi đàm phán claim với Chủ đầu tư/Tư vấn giám sát.
// ============================================================================

test("Chậm mặt bằng (ACCESS_DELAY) được cả EOT, chi phí lẫn lợi nhuận theo Điều 2.1", () => {
  const kq = mapDelayEventToFidicClause("ACCESS_DELAY");
  assert.equal(kq.clause, "Sub-Clause 2.1");
  assert.equal(kq.eotEntitlement, true);
  assert.equal(kq.costEntitlement, true);
  assert.equal(kq.profitEntitlement, true);
  assert.equal(kq.timeBarDays, 28);
});

test("Thời tiết bất lợi (ADVERSE_WEATHER) chỉ được EOT, KHÔNG được bồi thường chi phí/lợi nhuận", () => {
  // Bất biến nghiệp vụ: nếu code lỡ trả costEntitlement=true cho thời tiết, nhà thầu sẽ
  // đòi tiền sai căn cứ Điều 8.4(c) và dễ bị Chủ đầu tư bác toàn bộ hồ sơ khiếu nại.
  const kq = mapDelayEventToFidicClause("ADVERSE_WEATHER");
  assert.equal(kq.clause, "Sub-Clause 8.4(c)");
  assert.equal(kq.eotEntitlement, true);
  assert.equal(kq.costEntitlement, false);
  assert.equal(kq.profitEntitlement, false);
});

test("Thay đổi thiết kế (EMPLOYER_VARIATION) được đủ EOT + chi phí + lợi nhuận theo Điều 13.3", () => {
  const kq = mapDelayEventToFidicClause("EMPLOYER_VARIATION", "FIDIC_YELLOW_1999");
  assert.equal(kq.clause, "Sub-Clause 13.3");
  assert.equal(kq.eotEntitlement, true);
  assert.equal(kq.costEntitlement, true);
  assert.equal(kq.profitEntitlement, true);
  assert.equal(kq.contractBook, "FIDIC_YELLOW_1999");
});

test("Điều kiện địa chất bất khả kháng (UNFORESEEABLE_PHYSICAL_CONDITIONS) được EOT+chi phí nhưng KHÔNG được lợi nhuận", () => {
  const kq = mapDelayEventToFidicClause("UNFORESEEABLE_PHYSICAL_CONDITIONS");
  assert.equal(kq.clause, "Sub-Clause 4.12");
  assert.equal(kq.costEntitlement, true);
  assert.equal(kq.profitEntitlement, false);
});

test("Bất khả kháng (FORCE_MAJEURE) theo FIDIC 2017 MỚI được bồi thường chi phí, bản 1999 thì KHÔNG", () => {
  // Đây là khác biệt cốt lõi giữa 2 bộ hợp đồng — nhầm bản hợp đồng sẽ khiến claim chi phí
  // Force Majeure bị bác dù đúng sự kiện, hoặc ngược lại chấp nhận sai một khoản không có căn cứ.
  const kq2017 = mapDelayEventToFidicClause("FORCE_MAJEURE", "FIDIC_2017");
  assert.equal(kq2017.costEntitlement, true);

  const kq1999 = mapDelayEventToFidicClause("FORCE_MAJEURE", "FIDIC_RED_1999");
  assert.equal(kq1999.costEntitlement, false);

  // Không truyền contractBook -> mặc định FIDIC_RED_1999 -> vẫn rơi vào nhánh false.
  const kqMacDinh = mapDelayEventToFidicClause("FORCE_MAJEURE");
  assert.equal(kqMacDinh.contractBook, "FIDIC_RED_1999");
  assert.equal(kqMacDinh.costEntitlement, false);
});

test("Sự kiện khiếu nại chung (OTHER, hoặc loại chưa được đặc tả riêng) rơi vào Điều 20.1 mặc định", () => {
  // Nhánh default của switch — bắt các loại sự kiện chưa (hoặc không cần) mã hoá riêng, vd
  // DRAWING_APPROVAL_DELAY/TESTING_INTERRUPTION vẫn phải có căn cứ pháp lý, không được rơi vào "undefined".
  const other = mapDelayEventToFidicClause("OTHER");
  assert.equal(other.clause, "Sub-Clause 20.1");
  assert.equal(other.costEntitlement, true);
  assert.equal(other.profitEntitlement, false);

  const drawing = mapDelayEventToFidicClause("DRAWING_APPROVAL_DELAY");
  assert.equal(drawing.clause, "Sub-Clause 20.1");

  const testing = mapDelayEventToFidicClause("TESTING_INTERRUPTION");
  assert.equal(testing.clause, "Sub-Clause 20.1");
});

// ============================================================================
// 2. Kiểm tra thời hạn thông báo (time-bar 28 ngày) — trễ hạn là mất trắng quyền
// đòi EOT/chi phí theo Điều 20.1, nên 3 mốc COMPLIANT/RISK/BREACHED phải đúng tuyệt đối.
// ============================================================================

test("Thông báo trong hạn 28 ngày (kể cả đúng biên) là COMPLIANT", () => {
  const dungBien = checkNoticeCompliance("2026-08-01", "2026-08-29"); // đúng 28 ngày
  assert.equal(dungBien.daysDifference, 28);
  assert.equal(dungBien.isCompliant, true);
  assert.equal(dungBien.status, "COMPLIANT");

  const trongHan = checkNoticeCompliance("2026-08-01", "2026-08-15");
  assert.equal(trongHan.isCompliant, true);
});

test("Thông báo nộp trước ngày xảy ra sự kiện không bị tính số ngày âm (chặn tại 0)", () => {
  // daysDiff = Math.max(0, ...) — nếu thiếu Math.max, dữ liệu nhập nhầm ngày sẽ ra số âm
  // và vô tình được coi là "compliant" bởi so sánh <=28, nhưng vẫn cần khoá đúng giá trị 0.
  const kq = checkNoticeCompliance("2026-08-20", "2026-08-01");
  assert.equal(kq.daysDifference, 0);
  assert.equal(kq.isCompliant, true);
  assert.equal(kq.status, "COMPLIANT");
});

test("Thông báo trễ 29-42 ngày là TIME_BAR_RISK (chưa hẳn mất quyền, còn cửa vận dụng 20.1c)", () => {
  const kq = checkNoticeCompliance("2026-07-01", "2026-07-30"); // 29 ngày
  assert.equal(kq.isCompliant, false);
  assert.equal(kq.status, "TIME_BAR_RISK");
  assert.ok(kq.warningMessage.includes("TIME-BAR"));
});

test("Thông báo trễ trên 42 ngày là TIME_BAR_BREACHED (rủi ro bị bác toàn bộ hồ sơ)", () => {
  const kq = checkNoticeCompliance("2026-06-01", "2026-07-20"); // 49 ngày
  assert.equal(kq.isCompliant, false);
  assert.equal(kq.status, "TIME_BAR_BREACHED");
});

// ============================================================================
// 3. Time Impact Analysis (TIA) — chỉ sự kiện NẰM TRÊN ĐƯỜNG GĂNG mới được cộng
// vào EOT/chi phí kéo dài công trường; cộng nhầm sự kiện ngoài đường găng là lỗi
// nghiêm trọng nhất của TIA (làm phồng khiếu nại, dễ bị Tư vấn giám sát bác toàn bộ).
// ============================================================================

test("Sự kiện ngoài đường găng KHÔNG được cộng vào EOT dù directDelayDays lớn", () => {
  const tia = calculateTimeImpactAnalysis([
    {
      title: "Chậm không ảnh hưởng đường găng",
      eventType: "EMPLOYER_VARIATION",
      startDate: "2026-08-01",
      endDate: "2026-08-30",
      isOnCriticalPath: false,
      directDelayDays: 29,
    },
  ]);
  assert.equal(tia.criticalEventsCount, 0);
  assert.equal(tia.totalDirectDelayDays, 29, "vẫn cộng vào tổng trễ trực tiếp để báo cáo");
  assert.equal(tia.eotDaysRecommended, 0);
  assert.equal(tia.justifiedCostClaimDays, 0);
  assert.equal(tia.eventsBreakdown[0].eotGrantedDays, 0);
});

test("Sự kiện trên đường găng nhưng KHÔNG có quyền đòi chi phí (thời tiết) vẫn được EOT, không được cộng chi phí", () => {
  const tia = calculateTimeImpactAnalysis(
    [
      {
        title: "Mưa bão vượt định mức 10 năm",
        eventType: "ADVERSE_WEATHER",
        startDate: "2026-08-01",
        endDate: "2026-08-10",
        isOnCriticalPath: true,
        directDelayDays: 9,
      },
    ],
    10_000_000,
  );
  assert.equal(tia.criticalEventsCount, 1);
  assert.equal(tia.eotDaysRecommended, 9);
  // Không được cộng đồng nào vì ADVERSE_WEATHER không có costEntitlement.
  assert.equal(tia.justifiedCostClaimDays, 0);
  assert.equal(tia.prolongationCostVnd, 0);
});

test("Nhiều sự kiện đường găng có quyền chi phí thì cộng dồn EOT + chi phí kéo dài công trường", () => {
  const tia = calculateTimeImpactAnalysis(
    [
      {
        title: "Thay đổi thiết kế trục kỹ thuật",
        eventType: "EMPLOYER_VARIATION",
        startDate: "2026-08-01",
        endDate: "2026-08-10",
        isOnCriticalPath: true,
        directDelayDays: 9,
      },
      {
        title: "Địa chất khác hồ sơ khảo sát",
        eventType: "UNFORESEEABLE_PHYSICAL_CONDITIONS",
        startDate: "2026-08-11",
        endDate: "2026-08-16",
        isOnCriticalPath: true,
        directDelayDays: 5,
      },
    ],
    20_000_000,
  );
  assert.equal(tia.totalEventsAnalyzed, 2);
  assert.equal(tia.criticalEventsCount, 2);
  assert.equal(tia.totalCriticalDelayDays, 14);
  assert.equal(tia.justifiedCostClaimDays, 14);
  assert.equal(tia.prolongationCostVnd, 14 * 20_000_000);
  assert.equal(tia.eventsBreakdown.length, 2);
  assert.equal(tia.eventsBreakdown[0].fidicClause, "Sub-Clause 13.3");
});

test("Danh sách sự kiện rỗng trả kết quả 0 tuyệt đối, không throw", () => {
  const tia = calculateTimeImpactAnalysis([]);
  assert.equal(tia.totalEventsAnalyzed, 0);
  assert.equal(tia.eotDaysRecommended, 0);
  assert.equal(tia.prolongationCostVnd, 0);
  assert.deepEqual(tia.eventsBreakdown, []);
});

test("dailyOverheadRateVnd dùng đúng giá trị mặc định 15 triệu/ngày khi không truyền", () => {
  const tia = calculateTimeImpactAnalysis([
    {
      title: "Chậm cấp điện",
      eventType: "EMPLOYER_VARIATION",
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      isOnCriticalPath: true,
      directDelayDays: 2,
    },
  ]);
  assert.equal(tia.prolongationCostVnd, 2 * 15_000_000);
});

// ============================================================================
// 4. Sinh văn bản hồ sơ khiếu nại — nhiều tầng fallback (??/||) vì hàm này được gọi
// từ 2 nguồn dữ liệu khác nhau (TIA tự động vs khiếu nại nhập tay). Thiếu field nào
// mà không có fallback đúng sẽ ra văn bản pháp lý với "undefined" gửi Chủ đầu tư.
// ============================================================================

test("Dossier dùng đủ mọi field khi input cung cấp đầy đủ", () => {
  const md = generateFidicClaimDossier({
    claimCode: "CLM-99",
    projectName: "TT AVIO Tháp A",
    contractorName: "Nhà thầu ABC",
    eventTitle: "Chậm cấp điện nguồn trục chính",
    clauseMapping: { clause: "Sub-Clause 13.3", clauseTitle: "Variation Procedure" },
    eotDays: 12,
    costVnd: 500_000_000,
    evidences: [
      { type: "daily_diary", referenceCode: "LOG-01", description: "Nhật ký hiện trường" },
      { evidenceType: "rfi_delay", referenceCode: "RFI-02", description: "Yêu cầu thông tin" },
    ],
  });
  assert.ok(md.includes("CLM-99"));
  assert.ok(md.includes("TT AVIO Tháp A"));
  assert.ok(md.includes("Nhà thầu ABC"));
  assert.ok(md.includes("Sub-Clause 13.3"));
  assert.ok(md.includes("12 ngày"));
  assert.ok(md.includes("500.000.000 VNĐ"));
  assert.ok(md.includes("[daily_diary] LOG-01"));
  assert.ok(md.includes("[rfi_delay] RFI-02"));
});

test("Dossier tự điền giá trị mặc định khi input trống hoàn toàn (không được có 'undefined' trong văn bản)", () => {
  const md = generateFidicClaimDossier({});
  assert.ok(md.includes("CLM-01"));
  assert.ok(md.includes("Dự án"));
  assert.ok(md.includes("Nhà thầu MEPF")); // contractorNameArg mặc định
  assert.ok(md.includes("FIDIC Sub-Clause 20.1"));
  assert.ok(md.includes("0 ngày"));
  assert.ok(md.includes("0 VNĐ"));
  assert.ok(!md.includes("undefined"));
});

test("Dossier ưu tiên contractorNameArg (tham số thứ 2) khi input không có contractorName", () => {
  const md = generateFidicClaimDossier({ claimCode: "CLM-02" }, "Nhà thầu Cơ Điện Miền Nam");
  assert.ok(md.includes("Nhà thầu Cơ Điện Miền Nam"));
});

test("Dossier lấy eotDays theo thứ tự ưu tiên: eotDays > totalEotDaysRequested > calculatedEotDays > 0", () => {
  // Ba tầng ?? / || khác nguồn dữ liệu — thiếu test một tầng là có thể hỏng use-case
  // tương ứng (vd hồ sơ sinh từ analyzeFidicTiaClaim chỉ có calculatedEotDays).
  const layer2 = generateFidicClaimDossier({ totalEotDaysRequested: 7 });
  assert.ok(layer2.includes("7 ngày"));

  const layer3 = generateFidicClaimDossier({ calculatedEotDays: 3 });
  assert.ok(layer3.includes("3 ngày"));

  // eotDays = 0 tường minh (không phải undefined) -> ?? phải GIỮ nguyên 0, không rơi
  // xuống tầng totalEotDaysRequested dù tầng đó có giá trị khác 0.
  const eotZero = generateFidicClaimDossier({ eotDays: 0, totalEotDaysRequested: 99 });
  assert.ok(eotZero.includes("0 ngày"));
});

test("Dossier lấy cost theo thứ tự ưu tiên: costVnd > prolongationCost > totalCostClaimVnd > totalProlongationCostVnd > 0", () => {
  const layer2 = generateFidicClaimDossier({ prolongationCost: 1_000_000 });
  assert.ok(layer2.includes("1.000.000 VNĐ"));

  const layer3 = generateFidicClaimDossier({ totalCostClaimVnd: 2_000_000 });
  assert.ok(layer3.includes("2.000.000 VNĐ"));

  const layer4 = generateFidicClaimDossier({ totalProlongationCostVnd: 3_000_000 });
  assert.ok(layer4.includes("3.000.000 VNĐ"));
});

test("Dossier không có mục chứng cứ khi evidences rỗng/không truyền — không được throw vì thiếu .map", () => {
  const md = generateFidicClaimDossier({ claimCode: "CLM-03" });
  assert.ok(md.includes("## 2. DANH MỤC CHỨNG CỨ HIỆN TRƯỜNG"));
  // Không có dòng "- [" nào phía sau mục 2 vì evidences rỗng.
  const sectionEvidences = md.split("## 2. DANH MỤC CHỨNG CỨ HIỆN TRƯỜNG")[1];
  assert.ok(!sectionEvidences.includes("- ["));
});

// ============================================================================
// 5. Autonomous FIDIC TIA Claim Engine (M94) — phần tự động hoá thư thông báo +
// tính hạn chót time-bar; sai hạn chót là nhà thầu bị lố hạn 28 ngày mà không biết.
// ============================================================================

test("Fragnet duration tính đúng số ngày lịch giữa 2 mốc, làm tròn lên tối thiểu 1 ngày", () => {
  const kq = analyzeFidicTiaClaim({
    claimCode: "CLM-TIA-01",
    delayEventTitle: "Chậm bàn giao mặt bằng tầng hầm",
    eventCategory: "EMPLOYER_DELAY",
    delayStartDate: "2026-08-01",
    delayEndDate: "2026-08-10",
    impactedTasks: [],
  });
  assert.equal(kq.fragnetDurationDays, 9);
  // impactedTasks rỗng -> EOT lấy đúng bằng fragnetDays (giá trị khởi tạo của reduce).
  assert.equal(kq.calculatedEotDays, 9);
});

test("Cùng ngày bắt đầu/kết thúc vẫn tính tối thiểu 1 ngày trễ, không được ra 0", () => {
  const kq = analyzeFidicTiaClaim({
    claimCode: "CLM-TIA-02",
    delayEventTitle: "Sự kiện trong ngày",
    eventCategory: "FORCE_MAJEURE_WEATHER",
    delayStartDate: "2026-08-01",
    delayEndDate: "2026-08-01",
    impactedTasks: [],
  });
  assert.equal(kq.fragnetDurationDays, 1);
  assert.equal(
    kq.fidicSubClause,
    "Clause 8.4(d) & Clause 20.1 (FIDIC 1999) / Clause 8.5 & 20.2 (FIDIC 2017)",
  );
});

test("Task tác động có delayDays lớn hơn fragnetDays thì lấy delayDays lớn nhất làm EOT (bám tiến độ đường găng thật)", () => {
  const kq = analyzeFidicTiaClaim({
    claimCode: "CLM-TIA-03",
    delayEventTitle: "Chậm cấp vật tư trục chính",
    eventCategory: "DESIGN_CHANGE_VARIATION",
    delayStartDate: "2026-08-01",
    delayEndDate: "2026-08-05", // fragnet = 4 ngày
    impactedTasks: [
      { taskId: 1, taskName: "Lắp ống trục A", originalDurationDays: 10, delayDays: 3 },
      { taskId: 2, taskName: "Lắp ống trục B", originalDurationDays: 8, delayDays: 15 },
    ],
  });
  assert.equal(kq.fragnetDurationDays, 4);
  assert.equal(
    kq.calculatedEotDays,
    15,
    "phải lấy max(fragnet, các task) = 15, không phải fragnet",
  );
  assert.equal(
    kq.fidicSubClause,
    "Clause 8.4(a) & Clause 20.1 (FIDIC 1999) / Clause 8.5 & 20.2 (FIDIC 2017)",
  );
  assert.equal(kq.impactedCriticalTasks.length, 2);
});

test("dailyOverheadCostVnd dùng mặc định 15 triệu khi không truyền, và nhân đúng vào chi phí kéo dài", () => {
  const kq = analyzeFidicTiaClaim({
    claimCode: "CLM-TIA-04",
    delayEventTitle: "Chậm phê duyệt bản vẽ",
    eventCategory: "UNFORESEEN_PHYSICAL",
    delayStartDate: "2026-08-01",
    delayEndDate: "2026-08-06", // 5 ngày
    impactedTasks: [],
  });
  assert.equal(kq.dailyOverheadCostVnd, 15_000_000);
  assert.equal(kq.totalProlongationCostVnd, 5 * 15_000_000);

  const kqTuyChinh = analyzeFidicTiaClaim({
    claimCode: "CLM-TIA-05",
    delayEventTitle: "Chậm phê duyệt bản vẽ (đơn giá riêng)",
    eventCategory: "UNFORESEEN_PHYSICAL",
    delayStartDate: "2026-08-01",
    delayEndDate: "2026-08-06",
    impactedTasks: [],
    dailyOverheadCostVnd: 25_000_000,
  });
  assert.equal(kqTuyChinh.dailyOverheadCostVnd, 25_000_000);
  assert.equal(kqTuyChinh.totalProlongationCostVnd, 5 * 25_000_000);
});

test("Hạn chót time-bar (timeBarDeadlineDate) đúng bằng ngày bắt đầu sự kiện cộng 28 ngày", () => {
  const kq = analyzeFidicTiaClaim({
    claimCode: "CLM-TIA-06",
    delayEventTitle: "Chậm mặt bằng",
    eventCategory: "EMPLOYER_DELAY",
    delayStartDate: "2026-01-01",
    delayEndDate: "2026-01-05",
    impactedTasks: [],
  });
  assert.equal(kq.timeBarDeadlineDate, "2026-01-29");
});

test("Mã băm Merkle bảo chứng đủ định dạng, ổn định theo input và khác nhau giữa 2 claim khác nhau", () => {
  const input1 = {
    claimCode: "CLM-TIA-07",
    delayEventTitle: "Sự kiện A",
    eventCategory: "EMPLOYER_DELAY" as const,
    delayStartDate: "2026-08-01",
    delayEndDate: "2026-08-05",
    impactedTasks: [],
  };
  const kq1 = analyzeFidicTiaClaim(input1);
  assert.match(kq1.merkleProofHash, /^MERKLE-CLAIM-[0-9A-F]{24}$/);

  const kq2 = analyzeFidicTiaClaim({ ...input1, claimCode: "CLM-TIA-08" });
  // Mã claim khác nhau (và submittedAt khác) -> băm phải khác, tránh trùng mã bảo chứng
  // giữa 2 hồ sơ khiếu nại khác nhau (mất tính duy nhất/chống giả mạo).
  assert.notEqual(kq1.merkleProofHash, kq2.merkleProofHash);

  assert.ok(kq1.noticeLetterMarkdown.includes(kq1.merkleProofHash));
  assert.ok(kq1.noticeLetterMarkdown.includes("CLM-TIA-07"));
  assert.ok(kq1.noticeLetterMarkdown.includes(kq1.timeBarDeadlineDate));
});

// ============================================================================
// 6. Bền vững hoá DB — engineering_fidic_tia_claims (M94) và engineering_fidic_claims (M79)
// ============================================================================

test(
  "saveFidicTiaClaim: lưu mới rồi ghi đè đúng theo UNIQUE(project_id, claim_code) — không tạo trùng dòng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, queryOne } = await import("@/lib/db");
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('TIA Claim Proj')`);
    const claimCode = `CLM-TIA-DB-${projectId}`;

    const kq1 = analyzeFidicTiaClaim({
      claimCode,
      delayEventTitle: "Chậm bàn giao mặt bằng",
      eventCategory: "EMPLOYER_DELAY",
      delayStartDate: "2026-08-01",
      delayEndDate: "2026-08-10",
      impactedTasks: [{ taskId: 1, taskName: "Task A", originalDurationDays: 10, delayDays: 9 }],
    });
    const saved1 = await saveFidicTiaClaim(projectId, kq1);
    assert.ok(saved1.id);

    // Gọi lại LẦN 2 với dữ liệu đổi (EOT khác) trên cùng claimCode -> phải ON CONFLICT
    // UPDATE tại chỗ, không được insert thêm dòng thứ hai (idempotent theo mã hồ sơ).
    const kq2 = analyzeFidicTiaClaim({
      claimCode,
      delayEventTitle: "Chậm bàn giao mặt bằng (cập nhật)",
      eventCategory: "EMPLOYER_DELAY",
      delayStartDate: "2026-08-01",
      delayEndDate: "2026-08-20",
      impactedTasks: [{ taskId: 1, taskName: "Task A", originalDurationDays: 10, delayDays: 19 }],
    });
    const saved2 = await saveFidicTiaClaim(projectId, kq2, 7);
    assert.equal(saved2.id, saved1.id, "cùng claim_code phải cùng 1 dòng (UPSERT)");

    const list = await listFidicTiaClaims(projectId);
    assert.equal(list.length, 1);
    assert.equal((list[0] as { calculated_eot_days: number }).calculated_eot_days, 19);

    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "listFidicTiaClaims: cách ly đúng theo project_id, không rò dữ liệu dự án khác",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('TIA Proj 1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('TIA Proj 2')`);

    const kq = analyzeFidicTiaClaim({
      claimCode: `CLM-ISO-${p1}`,
      delayEventTitle: "Sự kiện dự án 1",
      eventCategory: "EMPLOYER_DELAY",
      delayStartDate: "2026-08-01",
      delayEndDate: "2026-08-05",
      impactedTasks: [],
    });
    await saveFidicTiaClaim(p1, kq);

    const listP1 = await listFidicTiaClaims(p1);
    const listP2 = await listFidicTiaClaims(p2);
    assert.equal(listP1.length, 1);
    assert.equal(listP2.length, 0);

    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "createFidicClaim (dạng object, dùng bởi route API thật): upsert theo claim_code, không trùng dòng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('FIDIC Claim Obj Proj')`);
    const claimCode = `CLM-OBJ-${projectId}`;

    const claim1 = await createFidicClaim({
      projectId,
      claimCode,
      contractType: "FIDIC_RED_1999",
      eventTitle: "Chậm giao tầng hầm B2",
      eventDate: "2026-08-01",
      noticeDate: "2026-08-15",
      eotDaysClaimed: 15,
      costClaimedVnd: 375_000_000,
    });
    assert.ok(claim1.id);
    assert.equal(claim1.claimCode, claimCode);

    // Gọi lại lần 2, đổi eotDaysClaimed -> phải UPDATE tại chỗ theo UNIQUE claim_code,
    // không sinh thêm dòng thứ hai (bảo toàn tính idempotent khi user bấm lưu 2 lần).
    const claim2 = await createFidicClaim({
      projectId,
      claimCode,
      eventDate: "2026-08-01",
      noticeDate: "2026-08-20",
      eotDaysClaimed: 20,
      costClaimedVnd: 500_000_000,
      // eventTitle bỏ trống -> phải rơi vào fallback "Khiếu nại {claimCode}".
    });
    assert.equal(claim2.id, claim1.id);

    const list = await listFidicClaims(projectId);
    assert.equal(list.length, 1);
    assert.equal((list[0] as { eot_days_claimed: number }).eot_days_claimed, 20);
    assert.equal((list[0] as { event_title: string }).event_title, `Khiếu nại ${claimCode}`);

    // Claim khác, KHÔNG truyền eotDaysClaimed/costClaimedVnd — phải rơi về 0 (fallback
    // `|| 0`), không được ghi NULL/undefined vào cột số tiền/số ngày khiếu nại.
    const claimCodeZero = `CLM-OBJ-ZERO-${projectId}`;
    await createFidicClaim({
      projectId,
      claimCode: claimCodeZero,
      eventTitle: "Khiếu nại chưa định lượng",
      eventDate: "2026-08-01",
      noticeDate: "2026-08-10",
    });
    const zeroClaim = (await listFidicClaims(projectId)).find(
      (c) => (c as { claim_code: string }).claim_code === claimCodeZero,
    ) as { eot_days_claimed: number; cost_claimed_vnd: number };
    assert.equal(zeroClaim.eot_days_claimed, 0);
    assert.equal(zeroClaim.cost_claimed_vnd, 0);

    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "listFidicClaims: không có claim nào thì trả mảng rỗng, không throw",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const projectId = await insertId(
      `INSERT INTO projects (name) VALUES ('FIDIC Claim Empty Proj')`,
    );
    const list = await listFidicClaims(projectId);
    assert.deepEqual(list, []);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test("createFidicClaim: ghi ĐÚNG người lập vào created_by", { skip: !HAS_TEST_DB }, async () => {
  // Trước đây hàm đọc `input.userId` trong khi route (đường gọi DUY NHẤT) truyền
  // `createdBy` — nên cột created_by luôn nhận null và hồ sơ khiếu nại không biết ai lập.
  // Với hồ sơ FIDIC (chứng cứ pháp lý khi tranh chấp EOT/chi phí) thì mất dấu vết người
  // lập là mất giá trị của chính hồ sơ.
  //
  // Ghi chú lịch sử: hàm này từng có thêm một nhánh nhận 4 tham số vị trí
  // (projectId, claimCode, dossier, userId). Nhánh đó là code chết — không nơi nào gọi,
  // và câu INSERT tham chiếu 5 cột không tồn tại trong `engineering_fidic_claims` nên gọi
  // vào là ném lỗi. Đã xoá cùng đợt này; chữ ký nhờ đó bỏ được `any`.
  const { insertId, queryOne, run } = await import("@/lib/db");
  const projectId = await insertId(
    `INSERT INTO projects (name) VALUES ('FIDIC Claim created_by Proj')`,
  );
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Người lập FIDIC', ?, 'x', 'pm')`,
    `fidic-createdby-${projectId}@test.local`,
  );
  try {
    const claim = await createFidicClaim({
      projectId,
      claimCode: `CLM-CB-${projectId}`,
      eventTitle: "Chậm bàn giao mặt bằng",
      eventDate: "2026-01-10",
      noticeDate: "2026-01-20",
      eotDaysClaimed: 12,
      costClaimedVnd: 5_000_000,
      createdBy: userId,
    });
    const row = await queryOne<{ created_by: number | null }>(
      `SELECT created_by FROM engineering_fidic_claims WHERE id = ?`,
      claim.id,
    );
    assert.equal(Number(row!.created_by), userId);
  } finally {
    await run(`DELETE FROM engineering_fidic_claims WHERE project_id = ?`, projectId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  }
});
