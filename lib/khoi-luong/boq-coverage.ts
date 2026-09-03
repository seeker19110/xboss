import { query, queryOne, withProjectScope } from "@/lib/db";

// Độ phủ ánh xạ BOQ (M122 PR1) — đo xem bao nhiêu task đã được gắn giá trị hợp đồng qua
// `boq_task_map`, và dòng BOQ nào có tổng tỷ trọng lệch khỏi 1.
//
// VÌ SAO CẦN ĐO TRƯỚC KHI BẬT TRỌNG SỐ: `boq_task_map` là con đường DUY NHẤT để một task có
// giá trị tiền — `tasks.boq_code` chỉ là mã định danh, không hề được join với `boq_items` ở
// bất kỳ đâu. `weight` lại luôn nhập tay, không có script nào sinh tự động. Nếu độ phủ ~0%
// thì công thức "trọng số theo giá trị" sẽ thoái hoá im lặng về đúng bình quân số task cũ
// (task chưa map được gán trọng số = trung bình task đã map, xem lib/tien-do/evm.ts), trong
// khi giao diện lại ghi "theo giá trị BOQ" — tức là nói sai. Đo trước, bật sau.
//
// CHỈ trả số ĐẾM và TỶ LỆ, tuyệt đối không trả số tiền: độ phủ hiển thị cho mọi vai trò xem
// được BOQ, còn giá trị hợp đồng chỉ dành cho vai trò có `CAN.viewPayments` (M122 §12).

export type DoPhuTheoHe = {
  he: string | null;
  tenHe: string | null;
  tong: number;
  daMap: number;
  tyLe: number;
};

export type DongWeightLech = {
  boqItemId: number;
  code: string;
  name: string;
  tongWeight: number;
  soTask: number;
};

export type DoPhuBoq = {
  tong: number;
  daMap: number;
  tyLe: number;
  theoHe: DoPhuTheoHe[];
  weightLech: DongWeightLech[];
};

/** Lệch quá mức này mới coi là bất thường — cùng ngưỡng với cảnh báo lúc PUT map
 *  (app/api/boq/[id]/map/route.ts), để hai chỗ không nói hai chuyện khác nhau. */
export const NGUONG_LECH_WEIGHT = 0.01;

// Đếm task đã map, nhóm theo hệ. Phạm vi = đúng phần người dùng đang xem: `projectId` NULL
// nghĩa là không chọn dự án nào → trả rỗng thay vì đếm chéo mọi dự án.
export async function doPhuBoq(opts: {
  projectId: number | null;
  systemCode?: string | null;
}): Promise<DoPhuBoq> {
  const { projectId, systemCode = null } = opts;
  if (projectId == null) return { tong: 0, daMap: 0, tyLe: 0, theoHe: [], weightLech: [] };

  const conds = ["tw.project_id = ?"];
  const args: unknown[] = [projectId];
  if (systemCode) {
    conds.push("d.code = ?");
    args.push(systemCode);
  }
  const where = `WHERE ${conds.join(" AND ")}`;

  // Một task map nhiều dòng BOQ vẫn chỉ đếm là MỘT task đã map (EXISTS, không JOIN) — nếu
  // JOIN thì task map 3 dòng sẽ được đếm 3 lần và độ phủ vượt 100%.
  const theoHe = await withProjectScope(projectId, () =>
    query<DoPhuTheoHe>(
      `SELECT d.code AS he, d.name AS "tenHe",
              COUNT(*)::int AS tong,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM boq_task_map m WHERE m.task_id = t.id
              ))::int AS "daMap"
         FROM tasks t
         JOIN work_packages wp ON wp.id = t.package_id
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
         LEFT JOIN systems d ON d.id = st.system_id
         ${where}
        GROUP BY d.code, d.name
        ORDER BY d.code NULLS LAST`,
      ...args,
    ),
  );
  for (const h of theoHe) h.tyLe = h.tong > 0 ? h.daMap / h.tong : 0;

  const tong = theoHe.reduce((s, h) => s + h.tong, 0);
  const daMap = theoHe.reduce((s, h) => s + h.daMap, 0);

  // Dòng BOQ có Σweight lệch khỏi 1. Chỉ cảnh báo, KHÔNG chặn: dữ liệu hiện có gần như chắc
  // chắn đã vi phạm (chưa từng có ràng buộc nào), thêm CHECK sẽ làm mọi lần ghi BOQ đổ vỡ.
  const weightLech = await withProjectScope(projectId, () =>
    query<DongWeightLech>(
      `SELECT bi.id AS "boqItemId", bi.code, bi.name,
            SUM(m.weight)::float8 AS "tongWeight",
            COUNT(*)::int AS "soTask"
       FROM boq_items bi
       JOIN boq_task_map m ON m.boq_item_id = bi.id
      WHERE bi.project_id = ?
      GROUP BY bi.id, bi.code, bi.name
     HAVING ABS(SUM(m.weight) - 1) > ?
      ORDER BY ABS(SUM(m.weight) - 1) DESC
      LIMIT 200`,
      projectId,
      NGUONG_LECH_WEIGHT,
    ),
  );

  return { tong, daMap, tyLe: tong > 0 ? daMap / tong : 0, theoHe, weightLech };
}

// Độ phủ gọn cho lớp phân tích (S-curve/SPI) — chỉ cần 3 con số, không cần chi tiết theo hệ.
// Tách riêng để 2 route biểu đồ không phải kéo cả danh sách `weightLech` mỗi lần vẽ.
export async function doPhuGon(opts: {
  projectId: number | null;
  systemCode?: string | null;
}): Promise<{ tong: number; daMap: number; tyLe: number }> {
  const { projectId, systemCode = null } = opts;
  if (projectId == null) return { tong: 0, daMap: 0, tyLe: 0 };

  const conds = ["tw.project_id = ?"];
  const args: unknown[] = [projectId];
  if (systemCode) {
    conds.push("d.code = ?");
    args.push(systemCode);
  }

  const r = await withProjectScope(projectId, () =>
    queryOne<{ tong: number; daMap: number }>(
      `SELECT COUNT(*)::int AS tong,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM boq_task_map m WHERE m.task_id = t.id
            ))::int AS "daMap"
       FROM tasks t
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
       LEFT JOIN systems d ON d.id = st.system_id
       WHERE ${conds.join(" AND ")}`,
      ...args,
    ),
  );
  const tong = r?.tong ?? 0;
  const daMap = r?.daMap ?? 0;
  return { tong, daMap, tyLe: tong > 0 ? daMap / tong : 0 };
}
