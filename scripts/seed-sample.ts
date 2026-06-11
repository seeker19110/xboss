// Dữ liệu mẫu mô phỏng cấu trúc Excel AVIO Tháp A (chạy khi chưa có file Excel thật).
import "./env";
import { run, insertId, todayISO } from "../lib/db";
import type { StatusSlug } from "../lib/status";

const SHEETS = [
  { code: "OGTĐ", name: "Ống gió trục đứng", responsible: "Mr. Thừa", prefix: "A", floors: 8, subs: 6, dims: ["1300x700 X3-X4", "1000x600 X5-X6", "800x500 Y2-Y3"] },
  { code: "OGHL", name: "Ống gió hành lang", responsible: "Mr. Thừa", prefix: "H", floors: 8, subs: 5, dims: ["600x300", "500x250", "400x200"] },
  { code: "OGCH", name: "Ống gió căn hộ", responsible: "Mr. Thừa", prefix: "OGCH", floors: 6, subs: 4, dims: ["CH 01", "CH 02", "CH 03", "CH 04"] },
  { code: "ODNN Zone 1", name: "Ống đồng nước ngưng Zone 1", responsible: "Mr. Hải", prefix: "A", floors: 6, subs: 4, dims: ["CH 01", "CH 05", "CH 12", "CH 22"] },
  { code: "ODNN Zone 2", name: "Ống đồng nước ngưng Zone 2", responsible: "Mr. Thắng", prefix: "A", floors: 6, subs: 4, dims: ["CH 23", "CH 28", "CH 33", "CH 38"] },
];

const SUB_NAMES = [
  "Lắp đặt support / ty treo", "Nẹp TDC + gioăng nối ống", "Lắp đặt ống gió / ống đồng",
  "Bọc bảo ôn cách nhiệt", "Test kín / áp lực", "Nghiệm thu nội bộ",
];

function isoDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

function deriveStatus(progress: number, endDate: string): StatusSlug {
  if (progress >= 1) return "hoan_thanh";
  if (endDate < todayISO()) return "tre";
  if (progress > 0) return "dang_thi_cong";
  return "chuan_bi";
}

async function main() {
  console.log("🌱 Seeding dữ liệu mẫu AVIO Tháp A...");

  // Reset (theo thứ tự FK).
  for (const t of ["notifications", "progress_dimensions", "task_history", "tasks", "work_packages", "sheet_types", "towers", "projects"]) {
    await run(`DELETE FROM ${t}`);
  }

  const projectId = await insertId(`INSERT INTO projects (name, code, investor, contractor) VALUES (?, ?, ?, ?)`,
    "TT AVIO Tháp A", "AVIO-A", "AVIO", "MEP Co.");
  const towerId = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, ?)`, projectId, "Tháp A");

  let totalWp = 0, totalTask = 0, totalDim = 0;
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  for (const s of SHEETS) {
    const stId = await insertId(`INSERT INTO sheet_types (tower_id, code, name, responsible) VALUES (?, ?, ?, ?)`,
      towerId, s.code, s.name, s.responsible);

    for (let f = 1; f <= s.floors; f++) {
      const wpCode = `${s.prefix}${f}`;
      const wpId = await insertId(
        `INSERT INTO work_packages (sheet_type_id, code, seq_no, floor_label, name, start_date, end_date, duration_days, status, progress)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        stId, wpCode, String(f), `${f}F`, `${s.name} tầng ${f}F`,
        isoDays(-60 + f * 5), isoDays(-60 + f * 5 + 20), 20, "chuan_bi", 0);
      totalWp++;

      let wpSum = 0;
      for (let k = 1; k <= s.subs; k++) {
        const base = Math.max(0, 1 - f / (s.floors + 1) - rnd() * 0.3);
        const progress = Math.min(1, Math.round(base * 4) / 4);
        const end = isoDays(-40 + f * 6 + k * 2);
        const status = deriveStatus(progress, end);
        const taskId = await insertId(
          `INSERT INTO tasks (package_id, code, seq_no, name, status, start_date, end_date, duration_days, progress_percent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          wpId, `${wpCode},${String(k).padStart(2, "0")}`, `${f}.${String(k).padStart(2, "0")}`,
          pick(SUB_NAMES, k - 1), status, isoDays(-40 + f * 6 + k * 2 - 5), end, 5, progress);
        totalTask++;
        wpSum += progress;

        const completed = Math.round(progress * s.dims.length);
        for (let di = 0; di < s.dims.length; di++) {
          await run(`INSERT INTO progress_dimensions (task_id, dimension_label, installed, value) VALUES (?, ?, ?, ?)`,
            taskId, s.dims[di], di < completed ? 1 : 0, di < completed ? 1 : 0);
          totalDim++;
        }
      }
      const wpProgress = Math.round((wpSum / s.subs) * 100) / 100;
      await run(`UPDATE work_packages SET progress = ?, status = ? WHERE id = ?`,
        wpProgress, deriveStatus(wpProgress, isoDays(-60 + f * 5 + 20)), wpId);
    }
  }

  console.log(`✅ ${SHEETS.length} sheet types, ${totalWp} work packages, ${totalTask} tasks, ${totalDim} dimensions.`);
  process.exit(0);
}

main().catch((err) => { console.error("❌ Seed lỗi:", err); process.exit(1); });
