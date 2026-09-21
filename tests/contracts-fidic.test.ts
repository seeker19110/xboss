import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeFidicTiaClaim,
  saveFidicTiaClaim,
  listFidicTiaClaims,
} from "@/lib/tai-chinh/contracts-fidic";

// (Mục 1-4: FIDIC Clause Mapping, Time-Bar Compliance Checker, Time Impact Analysis, Dossier
// Generator — thuộc tính năng "FIDIC 28-day EOT Claims Dossier" (M79, /engineering/fidic-claims)
// đã bị xoá cùng route/UI 2026-09-21, xem PROGRESS.md. Chỉ còn TIA Claim Engine (M94) dưới đây.)

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
// 6. Bền vững hoá DB — engineering_fidic_tia_claims (M94)
// ============================================================================

test(
  "saveFidicTiaClaim: lưu mới rồi ghi đè đúng theo UNIQUE(project_id, claim_code) — không tạo trùng dòng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, queryOne } = await import("@/lib/db");
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('TIA Claim Proj')`);
    const claimCode = `CLM-TIA-DB-${projectId}`;
    // Id thật của DB (không hằng số cứng) — created_by REFERENCES users(id), gán hằng số như
    // `7` XANH khi chạy riêng file này nhưng ĐỎ khi chạy cả bộ vì file test khác có thể đã
    // xoá đúng user đó (xem PLAN.md Đợt 6 Việc D + PROGRESS.md "Đợt 5 chiến dịch coverage").
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Người lập TIA Claim', ?, 'x', 'pm')`,
      `tia-claim-${projectId}@test.local`,
    );

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
    const saved2 = await saveFidicTiaClaim(projectId, kq2, userId);
    assert.equal(saved2.id, saved1.id, "cùng claim_code phải cùng 1 dòng (UPSERT)");

    const list = await listFidicTiaClaims(projectId);
    assert.equal(list.length, 1);
    assert.equal((list[0] as { calculated_eot_days: number }).calculated_eot_days, 19);

    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
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

// (createFidicClaim/listFidicClaims — engineering_fidic_claims (M79) — đã bị xoá cùng
// route/UI /engineering/fidic-claims 2026-09-21, xem PROGRESS.md.)
