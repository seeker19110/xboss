import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";

// QUALITY-FINAL-1 / S10c — EVM và báo cáo lưu (cost_by_month) exact (A3-AC01/AC05, Q-AC04):
// summary EVM tính bằng bigint (EV = giá trị × % không qua float, EAC = AC + (BAC−EV)×AC/EV
// exact, SPI/CPI chia bigint rồi mới ra number); báo cáo tiền giữ chuỗi canonical, sort exact,
// Excel ghi text khi vượt 15 chữ số có nghĩa. Route handler thật, header v1 / legacy.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };
const MAX_DONG = "9999999999999.99";

const don = { projects: [] as number[], users: [] as number[], boq: [] as number[] };

async function dungCay() {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10c EVM "));
  don.projects.push(projectId);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp S10c')`,
    projectId,
  );
  const ma = uniq("s10c-evm-");
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet S10c', ?)`,
    towerId,
    ma,
    ma,
  );
  const wpId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, 'Nhóm S10c')`,
    sheetId,
    uniq("WP-"),
  );
  return { projectId, sheetId, wpId };
}

async function dangNhapPm(projectId: number) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S10c PM', ?, 'hash-test-s10c', 'pm', 1)`,
    `s10c-${uniq("pm")}@test.local`,
  );
  don.users.push(id);
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  await dangNhapDuAn({ id, passwordHash: u!.password_hash }, projectId);
  return id;
}

/** 10 phiếu trần + 1 phiếu 0,03 (gắn sheet → quy về dự án) — AC/thực chi 99.999.999.999.999,93. */
async function chenPhieuChiLon(sheetId: number, ngay: string) {
  const { run } = await import("@/lib/db");
  for (let i = 0; i < 11; i++)
    await run(
      `INSERT INTO payment_bills (responsible, amount, paid_date, sheet_type_id)
       VALUES ('NCC S10c', ?::numeric, ?, ?)`,
      i < 10 ? MAX_DONG : "0.03",
      ngay,
      sheetId,
    );
}

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  for (const b of don.boq) {
    await run(`DELETE FROM boq_task_map WHERE boq_item_id = ?`, b);
    await run(`DELETE FROM boq_items WHERE id = ?`, b);
  }
  for (const p of don.projects) {
    await run(
      `DELETE FROM payment_bills WHERE sheet_type_id IN
         (SELECT st.id FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?)`,
      p,
    );
    await run(`DELETE FROM saved_reports WHERE project_id = ?`, p);
    await run(`DELETE FROM user_projects WHERE project_id = ?`, p);
    await run(
      `DELETE FROM tasks WHERE package_id IN (SELECT wp.id FROM work_packages wp
         JOIN sheet_types st ON st.id = wp.sheet_type_id JOIN towers tw ON tw.id = st.tower_id
        WHERE tw.project_id = ?)`,
      p,
    );
    await run(
      `DELETE FROM work_packages WHERE sheet_type_id IN
         (SELECT st.id FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?)`,
      p,
    );
    await run(
      `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM towers WHERE project_id = ?`, p);
    await run(`DELETE FROM projects WHERE id = ?`, p);
  }
  for (const u of don.users) await run(`DELETE FROM saved_reports WHERE owner_id = ?`, u);
  for (const u of don.users) await run(`DELETE FROM users WHERE id = ?`, u);
  dangXuat();
});

test("tyLeTuThapPhan / plannedRatioExact: hữu tỉ exact, khớp plannedRatio", async () => {
  const { tyLeTuThapPhan, plannedRatioExact, plannedRatio } = await import("@/lib/tien-do/evm");
  assert.deepEqual(tyLeTuThapPhan("0.1"), { num: 1n, den: 10n });
  assert.deepEqual(tyLeTuThapPhan("1"), { num: 1n, den: 1n });
  assert.deepEqual(tyLeTuThapPhan(null), { num: 0n, den: 1n });
  assert.throws(() => tyLeTuThapPhan("1e-05"), TypeError);
  const ms = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
  const r = plannedRatioExact("2026-01-01", "2026-01-11", ms("2026-01-06"));
  assert.equal(
    Number(r.num) / Number(r.den),
    plannedRatio("2026-01-01", "2026-01-11", ms("2026-01-06")),
  );
  assert.deepEqual(plannedRatioExact("2026-01-01", "2026-01-11", ms("2025-12-01")).num, 0n);
  const sau = plannedRatioExact("2026-01-01", "2026-01-11", ms("2026-03-01"));
  assert.equal(sau.num, sau.den);
  assert.deepEqual(plannedRatioExact("2026-01-05", "2026-01-05", ms("2026-01-05")), {
    num: 1n,
    den: 1n,
  });
});

test("dashboard/evm v1: BAC ~10^16 đồng, % 0,1 → EV/EAC/ETC/VAC exact; legacy 422", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { daysFromTodayISO } = await import("@/lib/nen/date");
  const { GET } = await import("@/app/api/dashboard/evm/route");
  const { projectId, sheetId, wpId } = await dungCay();
  // Task đã hết kỳ kế hoạch (tỷ lệ 1), tiến độ 10%, giá trị 1000 × 9.999.999.999.999,99.
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, start_date, end_date, progress_percent)
     VALUES (?, ?, 'Task S10c', ?, ?, 0.1)`,
    wpId,
    uniq("T-"),
    daysFromTodayISO(-10),
    daysFromTodayISO(-5),
  );
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id)
     VALUES (?, 'BOQ S10c', 'm', 1000, ?::numeric, ?)`,
    uniq("BOQ-EVM-"),
    MAX_DONG,
    projectId,
  );
  don.boq.push(boqId);
  await run(
    `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
    boqId,
    taskId,
  );
  await chenPhieuChiLon(sheetId, daysFromTodayISO(-3));
  await dangNhapPm(projectId);

  const res = await GET(new NextRequest("http://localhost/api/dashboard/evm", { headers: V1 }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const body = (await res.json()) as {
    moneyFormat?: string;
    summary: Record<string, unknown>;
    series: { ac: unknown }[];
  };
  assert.equal(body.moneyFormat, "decimal-string-v1");
  const s = body.summary;
  // Float cũ: round(Number(999999999999999000n) × 0,1) = 99999999999999904 xu (lệch 4 xu).
  assert.equal(s.bac, "9999999999999990.00");
  assert.equal(s.pv, "9999999999999990.00");
  assert.equal(s.ev, "999999999999999.00");
  assert.equal(s.ac, "99999999999999.93");
  assert.equal(s.sv, "-8999999999999991.00");
  assert.equal(s.cv, "899999999999999.07");
  // EAC = AC + (BAC − EV) × AC / EV, làm tròn xu ties xa 0.
  assert.equal(s.eac, "999999999999999.30");
  assert.equal(s.etc, "899999999999999.37");
  assert.equal(s.vac, "8999999999999990.70");
  assert.equal(s.spi, 0.1);
  assert.equal(s.cpi, 10);
  assert.equal(typeof s.valuedTasks, "number");
  // Điểm vẽ vẫn là number (đồng nguyên, hình học).
  assert.ok(body.series.every((p) => p.ac === null || typeof p.ac === "number"));

  const legacy = await GET(new NextRequest("http://localhost/api/dashboard/evm"));
  assert.equal(legacy.status, 422);
  assert.equal(((await legacy.json()) as { code: string }).code, "money_precision_unsupported");
});

test(
  "saved-reports cost_by_month: thực chi > 2^53 xu exact (v1), sort exact, Excel text, legacy 422",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const { GET } = await import("@/app/api/saved-reports/[id]/data/route");
    const { projectId, sheetId } = await dungCay();
    // Tháng 3: 99.999.999.999.999,92; tháng 4: ,93 — chỉ lệch 1 xu, Number() coi là BẰNG nhau nên
    // sort giảm dần kiểu cũ giữ nguyên thứ tự tháng (3 trước 4); sort exact phải đưa tháng 4 lên đầu.
    const { run } = await import("@/lib/db");
    for (let i = 0; i < 11; i++)
      await run(
        `INSERT INTO payment_bills (responsible, amount, paid_date, sheet_type_id)
       VALUES ('NCC S10c', ?::numeric, '2026-03-15', ?)`,
        i < 10 ? MAX_DONG : "0.02",
        sheetId,
      );
    await chenPhieuChiLon(sheetId, "2026-04-15");
    const ownerId = await dangNhapPm(projectId);
    const reportId = await insertId(
      `INSERT INTO saved_reports (owner_id, name, source, config, project_id)
     VALUES (?, 'Chi phí S10c', 'cost_by_month', ?::jsonb, ?)`,
      ownerId,
      JSON.stringify({ sort: { column: "actual", dir: "desc" } }),
      projectId,
    );
    const thamSo = { params: Promise.resolve({ id: String(reportId) }) };

    const res = await GET(
      new NextRequest(`http://localhost/api/saved-reports/${reportId}/data`, { headers: V1 }),
      thamSo,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      moneyFormat?: string;
      rows: { month: string; committed: unknown; actual: unknown }[];
    };
    assert.equal(body.moneyFormat, "decimal-string-v1");
    assert.deepEqual(
      body.rows.map((r) => [r.month, r.actual, r.committed]),
      [
        ["2026-04", "99999999999999.93", "0.00"],
        ["2026-03", "99999999999999.92", "0.00"],
      ],
    );

    const legacy = await GET(
      new NextRequest(`http://localhost/api/saved-reports/${reportId}/data`),
      thamSo,
    );
    assert.equal(legacy.status, 422);

    const xl = await GET(
      new NextRequest(`http://localhost/api/saved-reports/${reportId}/data?export=excel`),
      thamSo,
    );
    assert.equal(xl.status, 200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await xl.arrayBuffer()) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    // Cột "Thực chi" (cột 3) vượt 15 chữ số có nghĩa → CẢ cột text canonical; "Cam kết" vẫn số.
    assert.equal(ws.getRow(2).getCell(3).value, "99999999999999.93");
    assert.equal(ws.getRow(3).getCell(3).value, "99999999999999.92");
    assert.equal(ws.getRow(2).getCell(2).value, 0);
    assert.match(String(ws.getRow(4).getCell(1).value), /văn bản/);
  },
);
