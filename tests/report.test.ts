import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportToTelegramText,
  reportToHtml,
  weeklyToTelegramText,
  weeklyToHtml,
  reconstructProgressAtDate,
  type DailyReport,
  type WeeklyReport,
} from "@/lib/report";

// ===== Test thuần: reconstructProgressAtDate (tái dựng % tại 1 mốc ngày, M36 PR3) =====

test("reconstructProgressAtDate: task chưa có sự kiện history nào → dùng % hiện tại", () => {
  const tasks = [{ id: 1, progress: 0.7 }];
  const result = reconstructProgressAtDate(tasks, [], "2026-07-01");
  assert.equal(result.get(1), 0.7);
});

test("reconstructProgressAtDate: mọi sự kiện đều SAU mốc → dùng old_progress của sự kiện đầu tiên", () => {
  const tasks = [{ id: 1, progress: 0.9 }];
  const history = [
    { taskId: 1, oldProgress: 0.1, newProgress: 0.5, day: "2026-07-05" },
    { taskId: 1, oldProgress: 0.5, newProgress: 0.9, day: "2026-07-08" },
  ];
  // Mốc trước cả sự kiện đầu tiên → % tại mốc = old_progress của sự kiện đầu (0.1).
  const result = reconstructProgressAtDate(tasks, history, "2026-07-01");
  assert.equal(result.get(1), 0.1);
});

test("reconstructProgressAtDate: có sự kiện TRƯỚC mốc → dùng new_progress của sự kiện gần mốc nhất", () => {
  const tasks = [{ id: 1, progress: 0.9 }];
  const history = [
    { taskId: 1, oldProgress: 0, newProgress: 0.3, day: "2026-06-25" },
    { taskId: 1, oldProgress: 0.3, newProgress: 0.6, day: "2026-06-30" },
    { taskId: 1, oldProgress: 0.6, newProgress: 0.9, day: "2026-07-05" }, // sau mốc — bỏ qua
  ];
  const result = reconstructProgressAtDate(tasks, history, "2026-07-01");
  assert.equal(result.get(1), 0.6); // sự kiện 06-30 là gần mốc nhất trước/tại mốc
});

test("reconstructProgressAtDate: nhiều task độc lập, mỗi task tự tái dựng theo history riêng", () => {
  const tasks = [
    { id: 1, progress: 1 },
    { id: 2, progress: 0.2 },
  ];
  const history = [{ taskId: 1, oldProgress: 0.5, newProgress: 1, day: "2026-06-20" }];
  const result = reconstructProgressAtDate(tasks, history, "2026-07-01");
  assert.equal(result.get(1), 1); // task 1: sự kiện trước mốc → new_progress
  assert.equal(result.get(2), 0.2); // task 2: không có history → % hiện tại
});

// ===== Test thuần: định dạng báo cáo (Telegram/HTML) — không chạm DB =====

function fakeDailyReport(overrides: Partial<DailyReport> = {}): DailyReport {
  return {
    date: "2026-07-06",
    projectName: "TT AVIO Tháp A",
    totalDelayed: 1,
    newDelayed: [],
    topDelayed: [
      {
        code: "A1,01",
        name: 'Lắp ống <script>alert(1)</script> & "test"',
        status: "tre",
        endDate: "2026-07-01",
        progressPercent: 0.5,
        floorLabel: "5F",
        sheetType: "OGTD",
      },
    ],
    dueSoon: [],
    kpi: [{ sheetType: "OGTD", total: 10, avgProgress: 0.6, delayed: 1 }],
    ...overrides,
  };
}

function fakeWeeklyReport(overrides: Partial<WeeklyReport> = {}): WeeklyReport {
  return {
    date: "2026-07-06",
    weekFrom: "2026-06-29",
    projectName: "TT AVIO Tháp A",
    kpi: [
      { sheetType: "OGTD", total: 10, avgProgress: 0.6, avgProgressPrev: 0.5, delayed: 1 },
      { sheetType: "OGCH", total: 5, avgProgress: 0.3, avgProgressPrev: 0.3, delayed: 0 },
      { sheetType: "OGHL", total: 5, avgProgress: 0.2, avgProgressPrev: 0.4, delayed: 0 },
    ],
    completed: [
      { code: "A1,02", name: "Task xong", sheetType: "OGTD", floorLabel: "3F", day: "2026-07-03" },
    ],
    newDelayed: [],
    topDelayed: [],
    totalDelayed: 0,
    ...overrides,
  };
}

test("reportToTelegramText: escape HTML/script trong tên task, hiện đúng số liệu KPI", () => {
  const text = reportToTelegramText(fakeDailyReport());
  assert.ok(text.includes("2026-07-06"));
  assert.ok(text.includes("Tổng cộng <b>1</b>"));
  // Tên task chứa thẻ script phải bị escape, không lọt nguyên văn vào output.
  assert.ok(!text.includes("<script>alert(1)</script>"));
  assert.ok(text.includes("&lt;script&gt;"));
  assert.ok(text.includes("60%")); // avgProgress 0.6 → 60%
  assert.ok(text.includes("⚠ 1 tầng trễ"));
});

test("reportToTelegramText: hệ không trễ hiện '✓ không trễ' thay vì cảnh báo", () => {
  const text = reportToTelegramText(
    fakeDailyReport({ kpi: [{ sheetType: "OGCH", total: 5, avgProgress: 1, delayed: 0 }] }),
  );
  assert.ok(text.includes("✓ không trễ"));
  assert.ok(!text.includes("⚠"));
});

test("reportToTelegramText: cắt an toàn trong giới hạn 4000 ký tự (Telegram)", () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    code: `X,${i}`,
    name: `Task rất dài ${"a".repeat(100)} số ${i}`,
    status: "tre",
    endDate: "2026-07-01",
    progressPercent: 0.1,
    floorLabel: null,
    sheetType: "OGTD",
  }));
  const text = reportToTelegramText(fakeDailyReport({ topDelayed: many, dueSoon: many }));
  assert.ok(text.length <= 4000);
});

test("reportToHtml: escape ký tự đặc biệt trong tên/dự án, có đủ bảng KPI + trễ", () => {
  const html = reportToHtml(fakeDailyReport());
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("TT AVIO Tháp A"));
  assert.ok(html.includes("<table"));
});

test("weeklyToTelegramText: mũi tên xu hướng đúng chiều tăng/giảm/đứng yên", () => {
  const text = weeklyToTelegramText(fakeWeeklyReport());
  assert.match(text, /OGTD.*▲ \+10%/); // 0.5 → 0.6 = +10%
  assert.match(text, /OGCH.*—/); // không đổi
  assert.match(text, /OGHL.*▼ -20%/); // 0.4 → 0.2 = -20%
  assert.ok(text.includes("Hoàn thành trong tuần: 1"));
});

test("weeklyToHtml: hiện đủ bảng tiến độ theo hệ + hoàn thành + trễ mới", () => {
  const html = weeklyToHtml(fakeWeeklyReport());
  assert.ok(html.includes("Task xong"));
  assert.ok(html.includes("Tiến độ theo hệ"));
  assert.ok(html.includes("<table"));
});

// ===== Test tích hợp buildDailyReport/buildWeeklyReport (cần TEST_DATABASE_URL) =====

// Mã hệ duy nhất mỗi lần chạy — buildDailyReport/buildWeeklyReport truy vấn TOÀN BỘ
// DB (không lọc theo project), gom nhóm theo st.code; nếu 2 lần chạy test (hoặc chạy
// song song) cùng dùng mã "TESTRPT" cố định, KPI của lần này có thể lẫn dữ liệu rác
// còn sót của lần trước (đặc biệt khi 1 test trước đó assert lỗi giữa chừng, bỏ qua
// bước dọn dẹp cuối). Sinh mã ngẫu nhiên để mỗi lần chạy luôn cô lập.
function uniqueCode(prefix: string): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function seedProject(sheetCode: string) {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test report')`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp T')`,
    projectId,
  );
  const stId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet test')`,
    towerId,
    sheetCode,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'R1', 'Nhóm test')`,
    stId,
  );
  return { projectId, towerId, stId, pkgId };
}

async function cleanupProject(ids: { projectId: number; towerId: number; stId: number }) {
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM task_history WHERE task_id IN (SELECT t.id FROM tasks t JOIN work_packages wp ON t.package_id = wp.id WHERE wp.sheet_type_id = ?)`,
    ids.stId,
  );
  await run(
    `DELETE FROM tasks WHERE package_id IN (SELECT id FROM work_packages WHERE sheet_type_id = ?)`,
    ids.stId,
  );
  await run(`DELETE FROM work_packages WHERE sheet_type_id = ?`, ids.stId);
  await run(`DELETE FROM sheet_types WHERE id = ?`, ids.stId);
  await run(`DELETE FROM towers WHERE id = ?`, ids.towerId);
  await run(`DELETE FROM projects WHERE id = ?`, ids.projectId);
}

test(
  "buildDailyReport: nhận diện đúng task trễ (end_date quá khứ, chưa xong), mới quá hạn hôm qua, sắp đến hạn",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/db");
    const { buildDailyReport } = await import("@/lib/report");

    const sheetCode = uniqueCode("TESTRPTD");
    const ids = await seedProject(sheetCode);
    const yesterday = daysFromTodayISO(-1);
    const longAgo = daysFromTodayISO(-30);
    const soon = daysFromTodayISO(2);

    // Task trễ lâu (không phải mới quá hạn hôm qua).
    const tOld = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, 'R1,01', 'Task trễ lâu', ?, 0.4, 'tre')`,
      ids.pkgId,
      longAgo,
    );
    // Task mới quá hạn (end_date = hôm qua).
    const tNew = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, 'R1,02', 'Task mới quá hạn', ?, 0.2, 'tre')`,
      ids.pkgId,
      yesterday,
    );
    // Task sắp đến hạn, tiến độ <70%.
    const tSoon = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, 'R1,03', 'Task sắp đến hạn', ?, 0.5, 'dang_thi_cong')`,
      ids.pkgId,
      soon,
    );
    // Task đã nghiệm thu dù end_date quá khứ → KHÔNG được tính trễ.
    const tDone = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, 'R1,04', 'Task đã nghiệm thu', ?, 1, 'nghiem_thu')`,
      ids.pkgId,
      longAgo,
    );

    const report = await buildDailyReport();

    // topDelayed chỉ lấy top 15 trễ nhất TOÀN HỆ THỐNG (không lọc theo sheet) — không
    // dùng để assert chắc chắn 1 task cụ thể có mặt (có thể bị đẩy khỏi top 15 nếu DB
    // có nhiều task trễ khác), chỉ assert phần chắc chắn đúng trong mọi trường hợp:
    // task đã nghiệm thu không bao giờ xuất hiện dù end_date quá khứ.
    assert.ok(!report.topDelayed.some((r) => r.code === "R1,04" && r.sheetType === sheetCode));

    // newDelayed lấy từ danh sách trễ ĐẦY ĐỦ (không cắt top-N) nên an toàn để kiểm
    // đúng/sai theo điều kiện end_date = hôm qua, không lo lẫn dữ liệu khác.
    const newForThisSheet = report.newDelayed.filter((r) => r.sheetType === sheetCode);
    assert.deepEqual(
      newForThisSheet.map((r) => r.code),
      ["R1,02"],
    );

    const dueSoonCodes = report.dueSoon.filter((r) => r.sheetType === sheetCode).map((r) => r.code);
    assert.deepEqual(dueSoonCodes, ["R1,03"]);

    // KPI gom nhóm theo st.id nên tách biệt tuyệt đối với sheet của test khác (mã ngẫu nhiên).
    const kpiRow = report.kpi.find((k) => k.sheetType === sheetCode);
    assert.ok(kpiRow);
    assert.equal(kpiRow!.total, 4);
    // delayed đếm theo TẦNG (quyết 2026-07-11), không theo task: R1,01 + R1,02 cùng thuộc
    // work_package 'R1' (floor_label rỗng) nên chỉ tính 1 tầng trễ dù có 2 task trễ
    // (R1,04 đã nghiệm thu không tính).
    assert.equal(kpiRow!.delayed, 1);

    await run(`DELETE FROM tasks WHERE id IN (?, ?, ?, ?)`, tOld, tNew, tSoon, tDone);
    await cleanupProject(ids);
  },
);

test(
  "buildWeeklyReport: task đạt 100% trong tuần xuất hiện ở 'completed', tái dựng % 7 ngày trước từ task_history",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/db");
    const { buildWeeklyReport } = await import("@/lib/report");

    const sheetCode = uniqueCode("TESTRPTW");
    const ids = await seedProject(sheetCode);
    const threeDaysAgo = daysFromTodayISO(-3);

    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, progress_percent, status)
       VALUES (?, 'R1,10', 'Task hoàn thành trong tuần', 1, 'hoan_thanh')`,
      ids.pkgId,
    );
    // Sự kiện history: từ 40% lên 100% 3 ngày trước (trong tuần qua).
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at)
       VALUES (?, 0.4, 1, (? || 'T09:00:00Z')::timestamptz)`,
      taskId,
      threeDaysAgo,
    );

    const report = await buildWeeklyReport();
    const completedCodes = report.completed.map((r) => r.code);
    assert.ok(completedCodes.includes("R1,10"));

    // KPI gom nhóm theo st.id (sheet mã ngẫu nhiên riêng của test này) nên không lẫn
    // dữ liệu sheet khác dù chạy cùng lúc/để sót dữ liệu từ lần chạy trước.
    const kpiRow = report.kpi.find((k) => k.sheetType === sheetCode);
    assert.ok(kpiRow);
    assert.equal(kpiRow!.avgProgress, 1); // hiện tại 100%
    assert.equal(kpiRow!.avgProgressPrev, 0.4); // 7 ngày trước tái dựng từ history

    await run(`DELETE FROM task_history WHERE task_id = ?`, taskId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await cleanupProject(ids);
  },
);
