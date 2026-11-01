import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Perf G3/P2 — tìm task/nhóm qua tập ứng viên có index phải cho KẾT QUẢ GIỐNG HỆT câu SQL
// cũ (chép làm oracle bên dưới): cùng tập, cùng thứ tự, cùng giới hạn 15/10, cách ly dự án.

const skip = !HAS_TEST_DB;

const ORACLE_TASK = `SELECT 'task' AS kind, t.id, t.code, t.name, t.boq_code AS "boqCode",
              t.status, t.progress_percent AS progress,
              wp.floor_label AS "floorLabel", st.code AS "sheetType", st.slug AS "sheetSlug"
         FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         LEFT JOIN systems sys ON sys.id = st.system_id JOIN towers tw ON tw.id = st.tower_id
        WHERE (lower(t.code) LIKE ?
           OR lower(t.boq_code) LIKE ?
           OR to_tsvector('simple', xboss_unaccent(coalesce(t.code,'') || ' ' || coalesce(t.boq_code,'') || ' ' || coalesce(t.name,''))) @@ plainto_tsquery('simple', xboss_unaccent(?))
           OR lower(sys.code) LIKE ?
           OR lower(sys.name) LIKE ?) AND tw.project_id = ?
        ORDER BY st.id, t.code LIMIT 15`;
const ORACLE_PKG = `SELECT 'package' AS kind, wp.id, wp.code, wp.name, wp.boq_code AS "boqCode",
              wp.status, wp.progress, wp.floor_label AS "floorLabel",
              st.code AS "sheetType", st.slug AS "sheetSlug"
         FROM work_packages wp
         JOIN sheet_types st ON wp.sheet_type_id = st.id
         LEFT JOIN systems sys ON sys.id = st.system_id JOIN towers tw ON tw.id = st.tower_id
        WHERE (lower(wp.code) LIKE ?
           OR lower(wp.boq_code) LIKE ?
           OR to_tsvector('simple', xboss_unaccent(coalesce(wp.code,'') || ' ' || coalesce(wp.boq_code,'') || ' ' || coalesce(wp.name,''))) @@ plainto_tsquery('simple', xboss_unaccent(?))
           OR lower(sys.code) LIKE ?
           OR lower(sys.name) LIKE ?) AND tw.project_id = ?
        ORDER BY st.id, wp.code LIMIT 10`;

test(
  "searchTasksAndPackages: giống hệt câu SQL cũ, nhiều dự án, có/không dấu, mã, BOQ, hệ",
  { skip },
  async () => {
    const { query, insertId, run } = await import("@/lib/db");
    const { searchTasksAndPackages } = await import("@/lib/tien-do/search");

    await run(`DELETE FROM systems WHERE code = 'zqsys'`);
    const sysId = await insertId(
      `INSERT INTO systems (code, name) VALUES ('zqsys', 'Hệ Zqtest điện')`,
    );

    const projects: number[] = [];
    const towers: number[] = [];
    for (const n of ["A", "B"]) {
      const pid = await insertId(`INSERT INTO projects (name) VALUES (?)`, `zq-search-${n}`);
      projects.push(pid);
      towers.push(await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'T')`, pid));
    }
    const rnd = Math.random().toString(36).slice(2, 6);
    for (let i = 0; i < 2; i++) {
      // sheet i=0 gắn hệ zqsys (khớp theo hệ), sheet i=1 không có hệ
      for (let p = 0; p < 2; p++) {
        const st = await insertId(
          `INSERT INTO sheet_types (tower_id, code, name, slug, system_id) VALUES (?, ?, 'S', ?, ?)`,
          towers[p],
          `ZQ${i}`,
          `zq-${rnd}-${i}-${p}`,
          i === 0 ? sysId : null,
        );
        for (let w = 0; w < 3; w++) {
          const wp = await insertId(
            `INSERT INTO work_packages (sheet_type_id, code, name, boq_code) VALUES (?, ?, ?, ?)`,
            st,
            `ZQ${i}W${w}`,
            w === 0 ? "Nghiệm thu ống gió" : `Nhóm khác ${w}`,
            w === 1 ? `ZQBOQ-${i}-${p}` : null,
          );
          for (let k = 0; k < 20; k++) {
            await insertId(
              `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, ?, ?, ?)`,
              wp,
              `ZQ${i}W${w},${String(k).padStart(2, "0")}`,
              k % 5 === 0 ? "Nghiệm thu thiết bị" : `Việc ${k}`,
              k % 7 === 0 ? `ZQTB-${i}-${p}-${w}-${k}` : null,
            );
          }
        }
      }
    }

    const terms = [
      "zq0w1",
      "ZQ1W2,0",
      "zqboq",
      "zqtb-0",
      "nghiem thu",
      "NGHIỆM THU",
      "zqsys",
      "zqtest",
      "hệ zqtest",
      "zq",
      "zq0w",
      "khong-ton-tai",
    ];
    try {
      for (const pid of projects) {
        for (const q of terms) {
          const prefix = `${q.toLowerCase()}%`;
          const fts = q.replace(/[^\p{L}\p{N}\s]/gu, " ").trim() || q;
          const args = [prefix, prefix, fts, prefix, prefix, pid];
          const wantT = await query(ORACLE_TASK, ...args);
          const wantP = await query(ORACLE_PKG, ...args);
          for (const forceLegacy of [false, true]) {
            const got = await searchTasksAndPackages(pid, q, { forceLegacy });
            assert.deepEqual(got.tasks, wantT, `tasks q=${q} legacy=${forceLegacy}`);
            assert.deepEqual(got.packages, wantP, `packages q=${q} legacy=${forceLegacy}`);
          }
          // Cách ly dự án: không có task nào thuộc dự án kia.
          const got = await searchTasksAndPackages(pid, q);
          const other = await query<{ n: number }>(
            `SELECT count(*)::int AS n FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
               JOIN sheet_types st ON st.id = wp.sheet_type_id JOIN towers tw ON tw.id = st.tower_id
              WHERE t.id = ANY(?::int[]) AND tw.project_id <> ?`,
            got.tasks.map((h) => h.id),
            pid,
          );
          assert.equal(other[0].n, 0);
        }
      }
      // Sanity: có kết quả thật (tránh so khớp rỗng với rỗng).
      const s = await searchTasksAndPackages(projects[0], "nghiem thu");
      assert.equal(s.tasks.length, 15);
      assert.ok(s.packages.length > 0);
    } finally {
      await run(
        `DELETE FROM tasks WHERE package_id IN (SELECT wp.id FROM work_packages wp JOIN sheet_types st ON st.id = wp.sheet_type_id WHERE st.tower_id = ANY(?::int[]))`,
        towers,
      );
      await run(
        `DELETE FROM work_packages WHERE sheet_type_id IN (SELECT id FROM sheet_types WHERE tower_id = ANY(?::int[]))`,
        towers,
      );
      await run(`DELETE FROM sheet_types WHERE tower_id = ANY(?::int[])`, towers);
      await run(`DELETE FROM towers WHERE id = ANY(?::int[])`, towers);
      await run(`DELETE FROM projects WHERE id = ANY(?::int[])`, projects);
      await run(`DELETE FROM systems WHERE id = ?`, sysId);
    }
  },
);
