import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapDelayEventToFidicClause,
  checkNoticeCompliance,
  calculateTimeImpactAnalysis,
  generateFidicClaimDossier,
  createFidicClaim,
  listFidicClaims,
} from "@/lib/ky-thuat/engineering-fidic-claim";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M79: FIDIC Clause Mapping — Ánh xạ điều khoản & Quyền lợi EOT / Cost / Profit", () => {
  // 1. Chậm mặt bằng (Access Delay) -> Sub-Clause 2.1
  const accessClause = mapDelayEventToFidicClause("ACCESS_DELAY", "FIDIC_RED_1999");
  assert.equal(accessClause.clause, "Sub-Clause 2.1");
  assert.equal(accessClause.eotEntitlement, true);
  assert.equal(accessClause.costEntitlement, true);
  assert.equal(accessClause.profitEntitlement, true);

  // 2. Thời tiết bất lợi (Adverse Weather) -> Sub-Clause 8.4(c)
  const weatherClause = mapDelayEventToFidicClause("ADVERSE_WEATHER", "FIDIC_RED_1999");
  assert.equal(weatherClause.clause, "Sub-Clause 8.4(c)");
  assert.equal(weatherClause.eotEntitlement, true);
  assert.equal(
    weatherClause.costEntitlement,
    false,
    "Thời tiết chỉ được EOT, không được bồi thường chi phí theo FIDIC",
  );
});

test("M79: 28-Day Notice Compliance — Kiểm tra thời hạn thông báo Điều 20.1", () => {
  // Nộp trong vòng 14 ngày (Hợp lệ)
  const validNotice = checkNoticeCompliance("2026-08-01", "2026-08-15");
  assert.equal(validNotice.isCompliant, true);
  assert.equal(validNotice.daysDifference, 14);

  // Nộp sau 35 ngày (> 28 ngày -> Rủi ro Time-Bar)
  const lateNotice = checkNoticeCompliance("2026-07-01", "2026-08-05");
  assert.equal(lateNotice.isCompliant, false);
  assert.ok(lateNotice.daysDifference > 28);
  assert.ok(lateNotice.warningMessage.includes("TIME-BAR"));
});

test("M79: Time Impact Analysis (TIA) & Sinh Văn Bản Hồ Sơ Khiếu Nại FIDIC", () => {
  const events: any[] = [
    {
      title: "Chậm cấp điện nguồn trục chính",
      eventType: "EMPLOYER_VARIATION",
      startDate: "2026-08-01",
      endDate: "2026-08-20",
      isOnCriticalPath: true,
      directDelayDays: 19,
    },
    {
      title: "Chờ nghiệm thu công tác không quan trọng",
      eventType: "OTHER",
      startDate: "2026-08-05",
      endDate: "2026-08-10",
      isOnCriticalPath: false, // Ngoài đường găng
      directDelayDays: 5,
    },
  ];

  const tia = calculateTimeImpactAnalysis(events, 20000000);
  assert.equal(tia.totalCriticalDelayDays, 19);
  assert.equal(tia.eotDaysRecommended, 19);
  assert.equal(tia.prolongationCostVnd, 19 * 20000000);

  const dossier = generateFidicClaimDossier({
    claimCode: "CLM-TEST-01",
    projectName: "Sky Tower",
    contractType: "FIDIC_RED_1999",
    clauseMapping: mapDelayEventToFidicClause("EMPLOYER_VARIATION"),
    eventTitle: "Chậm cấp điện nguồn trục chính",
    eventDate: "2026-08-01",
    noticeDate: "2026-08-10",
    eotDays: tia.eotDaysRecommended,
    costVnd: tia.prolongationCostVnd,
    evidences: [
      { referenceCode: "LOG-01", description: "Nhật ký hiện trường", type: "daily_diary" },
    ],
  });

  assert.ok(dossier.includes("CLAIM FOR EXTENSION OF TIME"));
  assert.ok(dossier.includes("19 ngày"));
});

test("M79: Vòng đời FIDIC Claim trong DB", { skip: !HAS_DB }, async () => {
  const { insertId, run } = await import("@/lib/db");
  // Không hard-code projectId = 1 — DB test sạch chưa có dòng nào (quy ước chung của repo).
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('FIDIC Claim Proj')`);
  const claimCode = `CLM-DB-TEST-${projectId}`;

  const claim = await createFidicClaim({
    projectId,
    claimCode,
    contractType: "FIDIC_RED_1999",
    eventType: "ACCESS_DELAY",
    eventTitle: "Chậm giao tầng hầm B2",
    eventDate: "2026-08-01",
    noticeDate: "2026-08-15",
    eotDaysClaimed: 15,
    costClaimedVnd: 375000000,
    evidences: [
      { evidenceType: "daily_diary", referenceCode: "LOG-B2-01", description: "Bàn giao trễ" },
    ],
  });

  assert.ok(claim.id);
  assert.equal(claim.claimCode, claimCode);

  const list = await listFidicClaims(projectId);
  assert.ok(list.length >= 1);

  await run(`DELETE FROM projects WHERE id = ?`, projectId);
});
