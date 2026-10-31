// Bộ dữ liệu tiến độ NGẪU NHIÊN CÓ HẠT GIỐNG (tái lập được) cho các test so khớp "cách mới ≡
// cách cũ" của nhóm báo cáo/S-curve/EVM/matview (đợt tối ưu 3 G2). Cố ý phủ các ca biên mà
// tối ưu dễ làm lệch: task không lịch sử (kể cả progress NULL), new_progress/old_progress NULL,
// nhiều sự kiện cùng ngày, sự kiện 23:59:59 và 00:00:00 giờ VN, trùng changed_at, task kế thừa
// ngày nhóm (NULL), ngày KT ≤ ngày BĐ, sheet không hệ và sheet không tháp (sentinel 0 của MV).
// File test gọi helper này PHẢI import "./setup" trước (helper import lib/db lười trong hàm).

export type DuLieuNgauNhien = {
  tag: string;
  projectId: number;
  towerId: number;
  systemIds: number[]; // [hệ A, hệ B, hệ C (chỉ sheet không tháp dùng)]
  systemCodes: string[];
  sheetIds: number[]; // [S1 hệ A, S2 hệ B, S3 không hệ, S4 không tháp + hệ C]
  sheetCodes: string[];
  taskIds: number[];
  baselineId: number;
  /** Ngày VN có cặp sự kiện 23:59:59 (ngày này) và 00:00:00 (ngày kế). */
  ngayNuaDem: string;
};

// mulberry32 — PRNG 32-bit đủ tốt cho dữ liệu test, tái lập theo hạt giống.
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function taoDuLieuNgauNhien(tag: string, seed = 20261031): Promise<DuLieuNgauNhien> {
  const { insertId, run } = await import("@/lib/db");
  const { daysFromTodayISO } = await import("@/lib/nen/date");
  const rnd = prng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const PROGRESS = [0, 0.1, 0.25, 1 / 3, 0.5, 2 / 3, 0.7, 0.9, 1] as const;
  // changed_at theo giờ VN tường minh (+07) — ngày VN = phần ngày của chuỗi.
  const luc = (ngay: string, gio: string) => `${ngay} ${gio}+07`;

  const projectId = await insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, 1)`,
    `G2 ngẫu nhiên ${tag}`,
  );
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp G2 ${tag}`,
  );
  const systemCodes = ["A", "B", "C"].map((x) => `G2${x}-${tag}`);
  const systemIds: number[] = [];
  for (const code of systemCodes)
    systemIds.push(
      await insertId(`INSERT INTO systems (code, name) VALUES (?, ?)`, code, `Hệ ${code}`),
    );

  const sheetCodes = ["S1", "S2", "S3", "S4"].map((x) => `G2${x}-${tag}`);
  const sheetDefs: { tower: number | null; system: number | null }[] = [
    { tower: towerId, system: systemIds[0] },
    { tower: towerId, system: systemIds[1] },
    { tower: towerId, system: null },
    { tower: null, system: systemIds[2] },
  ];
  const sheetIds: number[] = [];
  for (let i = 0; i < sheetDefs.length; i++)
    sheetIds.push(
      await insertId(
        `INSERT INTO sheet_types (tower_id, code, name, slug, system_id) VALUES (?, ?, ?, ?, ?)`,
        sheetDefs[i].tower,
        sheetCodes[i],
        `Sheet ${sheetCodes[i]}`,
        sheetCodes[i].toLowerCase(),
        sheetDefs[i].system,
      ),
    );

  const ngayNuaDem = daysFromTodayISO(-12);
  const ngayKe = daysFromTodayISO(-11);
  const taskIds: number[] = [];
  let k = 0;
  for (const sheetId of sheetIds) {
    for (let w = 0; w < 2; w++) {
      // Nhóm thứ 2 không có ngày → task NULL ngày kế thừa NULL (không vào đường kế hoạch).
      const wpStart = w === 0 ? daysFromTodayISO(-int(60, 150)) : null;
      const wpEnd = w === 0 ? daysFromTodayISO(int(-30, 60)) : null;
      const wpId = await insertId(
        `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, start_date, end_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        sheetId,
        `WP-${tag}-${sheetId}-${w}`,
        `Nhóm ${w}`,
        `T${w + 1}`,
        wpStart,
        wpEnd,
      );
      for (let j = 0; j < 7; j++, k++) {
        const kieuNgay = k % 5;
        let start: string | null = null;
        let end: string | null = null;
        if (kieuNgay === 1 || kieuNgay === 3) {
          start = daysFromTodayISO(-int(10, 160));
          end = daysFromTodayISO(int(-60, 90));
        } else if (kieuNgay === 2) {
          start = daysFromTodayISO(-int(0, 40)); // ngày KT ≤ ngày BĐ
          end = start;
        } else if (kieuNgay === 4) {
          const s = -int(20, 80);
          start = daysFromTodayISO(s);
          end = daysFromTodayISO(s - int(1, 10));
        } // kieuNgay 0: NULL → kế thừa nhóm
        const coLichSu = k % 4 !== 0;
        const progress = !coLichSu && k % 8 === 0 ? null : pick(PROGRESS);
        const taskId = await insertId(
          `INSERT INTO tasks (package_id, code, name, status, progress_percent, start_date, end_date)
           VALUES (?, ?, ?, 'dang_thi_cong', ?, ?, ?)`,
          wpId,
          `G2-${tag}-${k}`,
          `Task G2 ${k}`,
          progress,
          start,
          end,
        );
        taskIds.push(taskId);
        if (!coLichSu) continue;

        const soSuKien = int(1, 7);
        for (let e = 0; e < soSuKien; e++) {
          const ngay = daysFromTodayISO(-int(0, 170));
          const gio = `${String(int(0, 23)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:00`;
          const oldP = e === 0 && k % 3 === 0 ? null : pick(PROGRESS);
          const newP = k % 7 === 0 && e === soSuKien - 1 ? null : pick(PROGRESS);
          await run(
            `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at) VALUES (?, ?, ?, ?)`,
            taskId,
            oldP,
            newP,
            luc(ngay, gio),
          );
          // Nhiều sự kiện cùng ngày.
          if (e === 0 && k % 2 === 0)
            await run(
              `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at) VALUES (?, ?, ?, ?)`,
              taskId,
              newP,
              pick(PROGRESS),
              luc(ngay, "23:30:00"),
            );
        }
        // Cặp sát nửa đêm VN: 23:59:59 ngày N và 00:00:00 ngày N+1.
        if (k % 3 === 1) {
          await run(
            `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at) VALUES (?, 0.2, 0.4, ?)`,
            taskId,
            luc(ngayNuaDem, "23:59:59"),
          );
          await run(
            `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at) VALUES (?, 0.4, 0.8, ?)`,
            taskId,
            luc(ngayKe, "00:00:00"),
          );
        }
        // Trùng changed_at hoàn toàn (2 dòng cùng mốc) — tie-break theo id.
        if (k % 6 === 5) {
          const moc = luc(daysFromTodayISO(-int(1, 30)), "09:15:00");
          await run(
            `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at) VALUES (?, 0.3, 0.6, ?)`,
            taskId,
            moc,
          );
          await run(
            `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at) VALUES (?, 0.6, 0.65, ?)`,
            taskId,
            moc,
          );
        }
      }
    }
  }

  // Giá trị BOQ cho ~1/3 task + thực chi để EVM có PV/EV/AC thật.
  for (let i = 0; i < taskIds.length; i += 3) {
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price) VALUES (?, ?, 'm', ?, ?)`,
      `G2-BOQ-${tag}-${i}`,
      `BOQ ${i}`,
      int(1, 500),
      `${int(1000, 900000)}.${String(int(0, 99)).padStart(2, "0")}`,
    );
    await run(
      `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, ?)`,
      boqId,
      taskIds[i],
      pick([1, 0.5, 0.25]),
    );
  }
  for (let i = 0; i < 6; i++)
    await run(
      `INSERT INTO payment_bills (responsible, amount, paid_date, sheet_type_id, project_id)
       VALUES ('NCC G2', ?, ?, ?, ?)`,
      `${int(1000, 9000000)}.${String(int(0, 99)).padStart(2, "0")}`,
      daysFromTodayISO(-int(0, 120)),
      sheetIds[i % 3],
      projectId,
    );

  // Baseline: nửa số task có ngày chốt khác (vài dòng NULL ngày).
  const baselineId = await insertId(
    `INSERT INTO baselines (name, project_id) VALUES (?, ?)`,
    `Baseline G2 ${tag}`,
    projectId,
  );
  for (let i = 0; i < taskIds.length; i += 2) {
    const s = -int(30, 170);
    await run(
      `INSERT INTO baseline_tasks (baseline_id, task_id, start_date, end_date) VALUES (?, ?, ?, ?)`,
      baselineId,
      taskIds[i],
      i % 10 === 0 ? null : daysFromTodayISO(s),
      daysFromTodayISO(s + int(-5, 120)),
    );
  }

  return {
    tag,
    projectId,
    towerId,
    systemIds,
    systemCodes,
    sheetIds,
    sheetCodes,
    taskIds,
    baselineId,
    ngayNuaDem,
  };
}

/** Dọn toàn bộ dữ liệu do `taoDuLieuNgauNhien` tạo (gọi trong finally/after). */
export async function donDuLieuNgauNhien(d: Partial<DuLieuNgauNhien>): Promise<void> {
  const { run } = await import("@/lib/db");
  const sheetIds = d.sheetIds ?? [];
  if (d.baselineId) {
    await run(`DELETE FROM baseline_tasks WHERE baseline_id = ?`, d.baselineId);
    await run(`DELETE FROM baselines WHERE id = ?`, d.baselineId);
  }
  for (const sheetId of sheetIds) {
    await run(`DELETE FROM payment_bills WHERE sheet_type_id = ?`, sheetId);
    const ids = `SELECT t.id FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
                  WHERE wp.sheet_type_id = ?`;
    await run(`DELETE FROM boq_task_map WHERE task_id IN (${ids})`, sheetId);
    await run(`DELETE FROM task_history WHERE task_id IN (${ids})`, sheetId);
    await run(`DELETE FROM tasks WHERE id IN (${ids})`, sheetId);
    await run(`DELETE FROM work_packages WHERE sheet_type_id = ?`, sheetId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, sheetId);
  }
  if (d.tag) await run(`DELETE FROM boq_items WHERE code LIKE ?`, `G2-BOQ-${d.tag}-%`);
  for (const id of d.systemIds ?? []) await run(`DELETE FROM systems WHERE id = ?`, id);
  if (d.towerId) await run(`DELETE FROM towers WHERE id = ?`, d.towerId);
  if (d.projectId) await run(`DELETE FROM projects WHERE id = ?`, d.projectId);
}
