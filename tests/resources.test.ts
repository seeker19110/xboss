import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp M59 PR1 (cần Postgres riêng: đặt TEST_DATABASE_URL) =====
// Dựng 2 dự án × tháp/sheet/nhóm/task để kiểm:
//  - workloadByWeek: đếm đúng số task chồng lịch từng tuần, kế thừa ngày nhóm qua COALESCE,
//    loại task hoan_thanh/nghiem_thu, chỉ tính assigned_to != NULL, scope theo dự án.
//  - manpowerByWeek: cộng đúng 2 kiểu chấm (headcount gộp + đếm người present), scope dự án.
//  - assignmentConflicts: bắt đúng ngưỡng minTasks, sắp theo mức chồng, subcon chỉ thấy mình.
//  - 2 dự án không lẫn số liệu.

test(
  "lib/resources: workload/manpower/conflicts scope đúng dự án, cộng đúng, subcon chỉ thấy mình",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne, todayISO } = await import("@/lib/db");
    const { addDaysISO } = await import("@/lib/date");
    const { workloadByWeek, manpowerByWeek, assignmentConflicts } = await import("@/lib/resources");

    const ketCau = await queryOne<{ id: number }>(`SELECT id FROM systems WHERE code = 'ket_cau'`);
    const xayTo = await queryOne<{ id: number }>(`SELECT id FROM systems WHERE code = 'xay_to'`);
    assert.ok(ketCau && xayTo, "cần systems seed sẵn ket_cau/xay_to");

    // Neo mọi ngày quanh 1 thứ Hai cố định để đối chiếu tuần bằng tay không lệ thuộc "hôm nay".
    const today = todayISO();
    // Tìm thứ Hai của tuần chứa hôm nay (JS getUTCDay: 0=CN..1=T2).
    const dow = new Date(today + "T00:00:00Z").getUTCDay();
    const monday = addDaysISO(today, dow === 0 ? -6 : 1 - dow); // thứ Hai tuần này
    const w0 = monday; // tuần 0
    const w1 = addDaysISO(monday, 7); // tuần 1
    const from = addDaysISO(monday, -7);
    const to = addDaysISO(monday, 21);

    // 2 user thao tác (engineer) + 1 subcon.
    const uA = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('RES User A', ?, 'x', 'engineer') RETURNING id`,
      `res-a-${Date.now()}@t.local`,
    );
    const uB = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('RES User B', ?, 'x', 'engineer') RETURNING id`,
      `res-b-${Date.now()}@t.local`,
    );
    const uSub = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('RES Sub', ?, 'x', 'subcon') RETURNING id`,
      `res-sub-${Date.now()}@t.local`,
    );

    // Dự án 1: tháp → sheet (ket_cau) → 1 nhóm (mang ngày để test kế thừa) + tasks.
    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('RES Proj 1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('RES Proj 2')`);
    const tw1 = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'RES Tháp 1')`,
      p1,
    );
    const tw2 = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'RES Tháp 2')`,
      p2,
    );
    const st1 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug, system_id) VALUES (?, 'RES-1', 'RES sheet 1', 'res-1', ?)`,
      tw1,
      ketCau!.id,
    );
    const st2 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug, system_id) VALUES (?, 'RES-2', 'RES sheet 2', 'res-2', ?)`,
      tw2,
      xayTo!.id,
    );
    // Nhóm P1: có ngày w0..w1+6 để task kế thừa ngày khi task để NULL.
    const wp1 = await insertId(
      `INSERT INTO work_packages (code, name, sheet_type_id, floor_label, start_date, end_date, progress)
       VALUES ('RES-1-1', 'Nhóm P1', ?, '1F', ?, ?, 0)`,
      st1,
      w0,
      addDaysISO(w1, 6),
    );
    const wp2 = await insertId(
      `INSERT INTO work_packages (code, name, sheet_type_id, floor_label, start_date, end_date, progress)
       VALUES ('RES-2-1', 'Nhóm P2', ?, '2F', ?, ?, 0)`,
      st2,
      w0,
      addDaysISO(w0, 6),
    );

    const mkTask = async (
      code: string,
      pkg: number,
      assignee: number | null,
      start: string | null,
      end: string | null,
      status = "dang_thi_cong",
    ) =>
      insertId(
        `INSERT INTO tasks (code, name, package_id, status, start_date, end_date, progress_percent, assigned_to)
         VALUES (?, ?, ?, ?, ?, ?, 0.2, ?) RETURNING id`,
        code,
        code,
        pkg,
        status,
        start,
        end,
        assignee,
      );

    // Dự án 1, tuần 0: uA có 3 task chồng lịch (w0..w0+6), uB có 1 task w0.
    const tA1 = await mkTask("RES-A1", wp1, uA, w0, addDaysISO(w0, 6));
    const tA2 = await mkTask("RES-A2", wp1, uA, w0, addDaysISO(w0, 4));
    const tA3 = await mkTask("RES-A3", wp1, uA, addDaysISO(w0, 1), addDaysISO(w0, 5));
    const tB1 = await mkTask("RES-B1", wp1, uB, w0, addDaysISO(w0, 3));
    // uA: 1 task kế thừa ngày NHÓM (start/end NULL → nhóm w0..w1+6) → chạy cả w0 lẫn w1.
    const tA4 = await mkTask("RES-A4", wp1, uA, null, null);
    // Task đã hoàn thành → KHÔNG tính vào workload.
    const tDone = await mkTask("RES-DONE", wp1, uA, w0, addDaysISO(w0, 6), "hoan_thanh");
    // Task chưa gán (assigned_to NULL) → KHÔNG tính.
    const tUnassigned = await mkTask("RES-UN", wp1, null, w0, addDaysISO(w0, 6));
    // Subcon: 1 task tuần 0 dự án 1.
    const tSub = await mkTask("RES-SUB", wp1, uSub, w0, addDaysISO(w0, 6));

    // Dự án 2: uB có 1 task tuần 0 (không được lẫn vào dự án 1).
    const tP2 = await mkTask("RES-P2", wp2, uB, w0, addDaysISO(w0, 6));

    // Chấm công dự án 1 tuần 0: 1 tổ.
    const crew1 = await insertId(
      `INSERT INTO crews (project_id, name, system_id) VALUES (?, 'RES Tổ 1', ?)`,
      p1,
      ketCau!.id,
    );
    const per1 = await insertId(
      `INSERT INTO personnel (project_id, full_name) VALUES (?, 'RES NV1')`,
      p1,
    );
    const per2 = await insertId(
      `INSERT INTO personnel (project_id, full_name) VALUES (?, 'RES NV2')`,
      p1,
    );
    // Chấm gộp theo tổ: headcount 8 (personnel_id NULL).
    const att1 = await insertId(
      `INSERT INTO attendance (project_id, work_date, crew_id, personnel_id, headcount, present)
       VALUES (?, ?, ?, NULL, 8, TRUE) RETURNING id`,
      p1,
      addDaysISO(w0, 1),
      crew1,
    );
    // Chấm từng người: 2 người, 1 present + 1 vắng → +1.
    const att2 = await insertId(
      `INSERT INTO attendance (project_id, work_date, crew_id, personnel_id, present)
       VALUES (?, ?, ?, ?, TRUE) RETURNING id`,
      p1,
      addDaysISO(w0, 2),
      crew1,
      per1,
    );
    const att3 = await insertId(
      `INSERT INTO attendance (project_id, work_date, crew_id, personnel_id, present)
       VALUES (?, ?, ?, ?, FALSE) RETURNING id`,
      p1,
      addDaysISO(w0, 2),
      crew1,
      per2,
    );
    // Chấm công dự án 2 (không được lẫn): headcount 100.
    const crew2 = await insertId(
      `INSERT INTO crews (project_id, name, system_id) VALUES (?, 'RES Tổ 2', ?)`,
      p2,
      xayTo!.id,
    );
    const att4 = await insertId(
      `INSERT INTO attendance (project_id, work_date, crew_id, personnel_id, headcount, present)
       VALUES (?, ?, ?, NULL, 100, TRUE) RETURNING id`,
      p2,
      addDaysISO(w0, 1),
      crew2,
    );

    try {
      // ── workloadByWeek dự án 1 ──
      const wl1 = await workloadByWeek({ projectId: p1, from, to });
      // Tuần 0, uA: tA1,tA2,tA3,tA4 (không tDone/tUnassigned) = 4 task.
      const uAw0 = wl1.find((r) => r.week === w0 && r.userId === uA);
      assert.equal(uAw0?.taskCount, 4, "uA tuần 0 phải 4 task chồng lịch");
      // Tuần 0, uB: chỉ tB1 (task dự án 2 không lẫn) = 1.
      const uBw0 = wl1.find((r) => r.week === w0 && r.userId === uB);
      assert.equal(uBw0?.taskCount, 1, "uB tuần 0 dự án 1 chỉ 1 task");
      // Tuần 1, uA: chỉ tA4 (kế thừa ngày nhóm chạy tới w1+6) = 1.
      const uAw1 = wl1.find((r) => r.week === w1 && r.userId === uA);
      assert.equal(uAw1?.taskCount, 1, "uA tuần 1 chỉ task kế thừa ngày nhóm");
      // systemCode gán đúng (ket_cau).
      assert.equal(uAw0?.systemCode, "ket_cau");

      // ── scope dự án: dự án 2 chỉ có uB ──
      const wl2 = await workloadByWeek({ projectId: p2, from, to });
      assert.ok(
        wl2.every((r) => r.userId === uB),
        "dự án 2 chỉ uB",
      );
      assert.ok(!wl2.some((r) => r.userId === uA), "uA không lẫn sang dự án 2");

      // ── subcon chỉ thấy tải của mình ──
      const wlSub = await workloadByWeek({ projectId: p1, from, to, subconUserId: uSub });
      assert.ok(wlSub.length > 0 && wlSub.every((r) => r.userId === uSub), "subcon chỉ thấy mình");

      // ── manpowerByWeek dự án 1: 8 (headcount gộp) + 1 (present cá nhân) = 9 ──
      const mp1 = await manpowerByWeek({ projectId: p1, from, to });
      const mpw0 = mp1.find((r) => r.week === w0 && r.crewId === crew1);
      assert.equal(mpw0?.manpower, 9, "manpower = headcount gộp 8 + 1 người present");
      // Dự án 2 không lẫn.
      assert.ok(!mp1.some((r) => r.crewId === crew2), "tổ dự án 2 không lẫn vào dự án 1");
      const mp2 = await manpowerByWeek({ projectId: p2, from, to });
      assert.equal(mp2.find((r) => r.crewId === crew2)?.manpower, 100);

      // ── assignmentConflicts: minTasks=2 → uA có đỉnh chồng (tA1,tA2,tA3,tA4 giao nhau ở w0) ──
      const conf = await assignmentConflicts({ projectId: p1, minTasks: 2 });
      const cA = conf.find((c) => c.userId === uA);
      assert.ok(cA, "uA phải bị bắt gán chồng");
      assert.ok(cA!.overlappingTaskCount >= 4, "đỉnh chồng uA ≥ 4");
      // uB chỉ 1 task → không đủ ngưỡng 2.
      assert.ok(!conf.some((c) => c.userId === uB), "uB 1 task không bị bắt");
      // Sắp theo overlappingTaskCount DESC.
      for (let i = 1; i < conf.length; i++)
        assert.ok(conf[i - 1].overlappingTaskCount >= conf[i].overlappingTaskCount);
      // Task rows có sheetSlug để điều hướng.
      assert.ok(cA!.tasks.every((t) => t.sheetSlug === "res-1"));

      // ── subcon chỉ thấy xung đột của mình (nếu đủ ngưỡng) — uSub 1 task, ngưỡng 1 ──
      const confSub = await assignmentConflicts({ projectId: p1, minTasks: 1, subconUserId: uSub });
      assert.ok(
        confSub.every((c) => c.userId === uSub),
        "conflicts subcon chỉ của mình",
      );

      // ── minTasks cao: ngưỡng 10 → không ai đạt ──
      const confHigh = await assignmentConflicts({ projectId: p1, minTasks: 10 });
      assert.equal(confHigh.length, 0);
    } finally {
      await run(`DELETE FROM attendance WHERE id IN (?, ?, ?, ?)`, att1, att2, att3, att4);
      await run(`DELETE FROM crew_members WHERE crew_id IN (?, ?)`, crew1, crew2);
      await run(`DELETE FROM crews WHERE id IN (?, ?)`, crew1, crew2);
      await run(`DELETE FROM personnel WHERE id IN (?, ?)`, per1, per2);
      await run(
        `DELETE FROM tasks WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        tA1,
        tA2,
        tA3,
        tA4,
        tB1,
        tDone,
        tUnassigned,
        tSub,
        tP2,
      );
      await run(`DELETE FROM work_packages WHERE id IN (?, ?)`, wp1, wp2);
      await run(`DELETE FROM sheet_types WHERE id IN (?, ?)`, st1, st2);
      await run(`DELETE FROM towers WHERE id IN (?, ?)`, tw1, tw2);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
      await run(`DELETE FROM users WHERE id IN (?, ?, ?)`, uA, uB, uSub);
    }
  },
);
