import { query, withProjectScope } from "@/lib/db";
import { sortFloorsDesc } from "@/lib/nen/floors";
import { diemGiongTen } from "@/lib/nen/van-ban";

// Ánh xạ BOQ ↔ task THEO TẦNG (M124 việc 1).
//
// VÌ SAO KHÔNG MAP TỰ ĐỘNG THEO MÃ: sổ đăng ký `boq_codes` cấm hai dòng khác bảng cùng giữ một
// mã, nên `tasks.boq_code` và `boq_items.code` KHÔNG BAO GIỜ trùng nhau (xem ghi chú đầu
// `lib/khoi-luong/boq-coverage.ts`). Đường khả thi duy nhất để thêm nhanh hàng chục task vào một
// dòng BOQ là: lọc theo TẦNG (`work_packages.floor_label`) trong các sheet CÙNG HỆ với dòng BOQ,
// rồi xếp theo độ giống tên để người dùng tick — máy gợi ý, người quyết.

export type TaskTheoTang = {
  id: number;
  code: string;
  name: string;
  sheetName: string;
  pkgCode: string;
  pkgName: string;
  progressPercent: number;
  /** Task này đã nằm trong map của MỘT dòng BOQ nào đó (có thể là dòng khác) — vẫn cho tick,
   *  chỉ cảnh báo, vì một task hoàn toàn có thể chia tỷ trọng cho nhiều dòng BOQ. */
  daMapDongKhac: boolean;
  diemGiong: number;
};

/** Danh sách tầng có nhóm công việc cùng hệ với dòng BOQ, sắp giảm dần (RF → hầm).
 *  `systemId` null = dòng BOQ chưa gán hệ ⇒ không lọc hệ, trả tầng của mọi hệ. */
export async function cacTangCuaHe(projectId: number, systemId: number | null): Promise<string[]> {
  const rows = await withProjectScope(projectId, () =>
    query<{ floorLabel: string }>(
      `SELECT DISTINCT wp.floor_label AS "floorLabel"
         FROM work_packages wp
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
        WHERE tw.project_id = ?
          AND wp.floor_label IS NOT NULL
          AND (?::int IS NULL OR st.system_id = ?)`,
      projectId,
      systemId,
      systemId,
    ),
  );
  return rows.map((r) => r.floorLabel).sort(sortFloorsDesc);
}

/** Task của các nhóm thuộc đúng tầng + đúng hệ, xếp theo độ giống tên dòng BOQ giảm dần. */
export async function taskTheoTang(opts: {
  projectId: number;
  systemId: number | null;
  floorLabel: string;
  tenDongBoq: string;
}): Promise<TaskTheoTang[]> {
  const { projectId, systemId, floorLabel, tenDongBoq } = opts;
  const rows = await withProjectScope(projectId, () =>
    query<Omit<TaskTheoTang, "diemGiong">>(
      `SELECT t.id, t.code, t.name,
              st.name AS "sheetName", wp.code AS "pkgCode", wp.name AS "pkgName",
              t.progress_percent AS "progressPercent",
              EXISTS (SELECT 1 FROM boq_task_map m WHERE m.task_id = t.id) AS "daMapDongKhac"
         FROM tasks t
         JOIN work_packages wp ON wp.id = t.package_id
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
        WHERE tw.project_id = ?
          AND wp.floor_label = ?
          AND (?::int IS NULL OR st.system_id = ?)`,
      projectId,
      floorLabel,
      systemId,
      systemId,
    ),
  );

  // Điểm giống tính ở JS (không trong SQL): công thức token-Jaccard dùng chung với client và
  // không có index nào giúp được ở đây — số task một tầng chỉ cỡ trăm dòng.
  return rows
    .map((r) => ({ ...r, diemGiong: diemGiongTen(tenDongBoq, r.name) }))
    .sort(
      (a, b) =>
        b.diemGiong - a.diemGiong ||
        a.sheetName.localeCompare(b.sheetName) ||
        a.pkgCode.localeCompare(b.pkgCode) ||
        a.code.localeCompare(b.code),
    );
}
