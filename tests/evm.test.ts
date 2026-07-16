import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== M47 PR1 — EVM (PV/EV/AC → SPI/CPI/EAC), lib/evm.ts =====

test("plannedRatio: nội suy tuyến tính clamp 0..1, ngày KT ≤ ngày BĐ coi là mốc", async () => {
  const { plannedRatio } = await import("@/lib/evm");
  const ms = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
  // Giữa kỳ 10 ngày → 0.5
  assert.equal(plannedRatio("2026-01-01", "2026-01-11", ms("2026-01-06")), 0.5);
  // Trước BĐ → 0, sau KT → 1
  assert.equal(plannedRatio("2026-01-01", "2026-01-11", ms("2025-12-31")), 0);
  assert.equal(plannedRatio("2026-01-01", "2026-01-11", ms("2026-02-01")), 1);
  // end ≤ start (mốc 0 ngày): trước mốc 0, từ mốc trở đi 1
  assert.equal(plannedRatio("2026-01-05", "2026-01-05", ms("2026-01-04")), 0);
  assert.equal(plannedRatio("2026-01-05", "2026-01-05", ms("2026-01-05")), 1);
});

test(
  "getEvmSeries: PV/EV/AC + SPI/CPI/EAC đúng số tay — task thiếu BOQ tính trọng số trung bình",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { getEvmSeries } = await import("@/lib/evm");
    const { daysFromTodayISO } = await import("@/lib/date");

    // Dự án riêng để cô lập khỏi dữ liệu các file test khác trong DB dùng chung.
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('M47 EVM P1')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp EVM')`,
      projectId,
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'M47-EVM', 'Sheet EVM', 'm47-evm')`,
      towerId,
    );
    const wpId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'M47-WP', 'Nhóm EVM')`,
      sheetId,
    );
    // T1: đã hết hạn kế hoạch (ratio 1), tiến độ 50%, gắn BOQ 100 × 100.000 = 10.000.000
    const t1 = await insertId(
      `INSERT INTO tasks (package_id, code, name, start_date, end_date, progress_percent)
       VALUES (?, 'M47-T1', 'Task EVM 1', ?, ?, 0.5)`,
      wpId,
      daysFromTodayISO(-10),
      daysFromTodayISO(-5),
    );
    // T2: chưa tới ngày BĐ (ratio 0), tiến độ 0, KHÔNG gắn BOQ → trọng số = trung bình (10tr)
    const t2Id = await insertId(
      `INSERT INTO tasks (package_id, code, name, start_date, end_date, progress_percent)
       VALUES (?, 'M47-T2', 'Task EVM 2', ?, ?, 0)`,
      wpId,
      daysFromTodayISO(5),
      daysFromTodayISO(10),
    );
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price) VALUES ('M47-EVM-1', 'Ống gió EVM', 'm2', 100, 100000)`,
    );
    await run(
      `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
      boqId,
      t1,
    );
    // Thực chi 2.000.000 (bill gắn sheet → quy về dự án qua tower)
    await run(
      `INSERT INTO payment_bills (responsible, amount, paid_date, sheet_type_id) VALUES ('NCC EVM', 2000000, ?, ?)`,
      daysFromTodayISO(-3),
      sheetId,
    );

    const data = await getEvmSeries({ projectId });
    assert.ok(data, "phải có dữ liệu");
    const s = data!.summary;
    // BAC = 10tr (T1) + 10tr (T2 trung bình) = 20tr; PV = 10tr×1 + 10tr×0; EV = 10tr×0.5
    assert.equal(s.hasValues, true);
    assert.equal(s.valuedTasks, 1);
    assert.equal(s.totalTasks, 2);
    assert.equal(s.bac, 20_000_000);
    assert.equal(s.pv, 10_000_000);
    assert.equal(s.ev, 5_000_000);
    assert.equal(s.ac, 2_000_000);
    assert.equal(s.spi, 0.5); // 5tr / 10tr
    assert.equal(s.cpi, 2.5); // 5tr / 2tr
    assert.equal(s.sv, -5_000_000);
    assert.equal(s.cv, 3_000_000);
    // EAC = AC + (BAC−EV)/CPI = 2tr + 15tr/2.5 = 8tr; ETC = 6tr; VAC = 12tr
    assert.equal(s.eac, 8_000_000);
    assert.equal(s.etc, 6_000_000);
    assert.equal(s.vac, 12_000_000);

    // Chuỗi điểm: tại hôm nay PV/EV/AC khớp summary (range 20 ngày → step 1, có đúng điểm hôm nay)
    const todayPt = data!.series.find((p) => p.date === data!.today);
    assert.ok(todayPt, "phải có điểm tại hôm nay");
    assert.equal(todayPt!.pv, 10_000_000);
    assert.equal(todayPt!.ev, 5_000_000);
    assert.equal(todayPt!.ac, 2_000_000);
    // Điểm cuối (tương lai): EV/AC null, PV = BAC (mọi task hết hạn kế hoạch)
    const last = data!.series[data!.series.length - 1];
    assert.equal(last.ev, null);
    assert.equal(last.ac, null);
    assert.equal(last.pv, 20_000_000);

    // Baseline chốt ngày T2 về quá khứ → PV = 20tr, SPI = 0.25 (đo lệch so kế hoạch gốc)
    const blId = await insertId(`INSERT INTO baselines (name) VALUES ('BL EVM')`);
    await run(
      `INSERT INTO baseline_tasks (baseline_id, task_id, start_date, end_date, progress_percent) VALUES (?, ?, ?, ?, 0)`,
      blId,
      t2Id,
      daysFromTodayISO(-10),
      daysFromTodayISO(-5),
    );
    const dataBl = await getEvmSeries({ projectId, baselineId: blId });
    assert.equal(dataBl!.summary.pv, 20_000_000);
    assert.equal(dataBl!.summary.spi, 0.25);

    // Nguồn cash: chỉ tính cash_transactions chi của dự án
    await run(
      `INSERT INTO cash_transactions (project_id, tx_date, direction, amount) VALUES (?, ?, 'out', 3000000)`,
      projectId,
      daysFromTodayISO(-2),
    );
    const dataCash = await getEvmSeries({ projectId, source: "cash" });
    assert.equal(dataCash!.summary.ac, 3_000_000);
    // cash + lọc hệ → phải từ chối (tiền mặt không gắn hệ)
    await assert.rejects(() => getEvmSeries({ projectId, source: "cash", systemId: 1 }));
  },
);

test(
  "getEvmSeries: không task nào gắn BOQ → chỉ số tiền null, SPI vẫn tính theo trọng số đều, series rỗng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { getEvmSeries } = await import("@/lib/evm");
    const { daysFromTodayISO } = await import("@/lib/date");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('M47 EVM P2')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp EVM 2')`,
      projectId,
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'M47-EVM2', 'Sheet EVM 2', 'm47-evm2')`,
      towerId,
    );
    const wpId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'M47-WP2', 'Nhóm EVM 2')`,
      sheetId,
    );
    await run(
      `INSERT INTO tasks (package_id, code, name, start_date, end_date, progress_percent)
       VALUES (?, 'M47-T3', 'Task EVM 3', ?, ?, 0.5)`,
      wpId,
      daysFromTodayISO(-10),
      daysFromTodayISO(-5),
    );

    const data = await getEvmSeries({ projectId });
    assert.ok(data);
    const s = data!.summary;
    assert.equal(s.hasValues, false);
    assert.equal(s.bac, null);
    assert.equal(s.pv, null);
    assert.equal(s.ev, null);
    assert.equal(s.cpi, null);
    assert.equal(s.eac, null);
    assert.equal(s.ac, 0); // chưa chi gì trong dự án này
    assert.equal(s.spi, 0.5); // ratio 1, tiến độ 0.5 — trọng số đều vẫn đo được
    assert.deepEqual(data!.series, []);

    // Dự án không có task → null (API trả series rỗng + summary null)
    const emptyProject = await insertId(`INSERT INTO projects (name) VALUES ('M47 EVM P3')`);
    assert.equal(await getEvmSeries({ projectId: emptyProject }), null);
  },
);
