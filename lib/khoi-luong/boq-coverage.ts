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
  /** Số công việc có ghi mã BOQ. Mã đó KHÔNG nối công việc với dòng BOQ nào — xem ghi chú
   *  ở đầu file. Đo để UI nói thẳng ra, vì cột "Mã BOQ" trên lưới rất dễ bị hiểu ngược. */
  coMaBoq: number;
};

/** Lệch quá mức này mới coi là bất thường — cùng ngưỡng với cảnh báo lúc PUT map
 *  (app/api/boq/[id]/map/route.ts), để hai chỗ không nói hai chuyện khác nhau. */
export const NGUONG_LECH_WEIGHT = 0.01;

/**
 * Luật tổng tỷ trọng của MỘT dòng BOQ, tách thành hàm thuần để route chỉ còn là ranh giới HTTP
 * (ADR-0008) và để luật này test được mà không cần dựng phiên/DB.
 *
 * Hai chiều lệch KHÔNG đối xứng:
 *  - Σ > 1 → chặn. Khối lượng thực hiện = qty_contract × Σ(weight × progress); Σweight > 1 nghĩa
 *    là dòng BOQ có thể thanh toán vượt khối lượng hợp đồng. Không có ca dùng hợp lệ.
 *  - Σ < 1 → chỉ cảnh báo. Đó là trạng thái bình thường khi PM đang map dần từng công việc.
 * Dung sai hai chiều dùng chung NGUONG_LECH_WEIGHT để cảnh báo và chặn không nói hai chuyện khác nhau.
 */
export function kiemTraTongTyTrong(weights: number[]): {
  tong: number;
  loi: string | null;
  canhBao: string | null;
} {
  const tong = weights.reduce((s, w) => s + w, 0);
  if (tong - 1 > NGUONG_LECH_WEIGHT)
    return {
      tong,
      loi: `Tổng tỷ trọng (${tong.toFixed(4)}) vượt 1 — khối lượng thực hiện sẽ vượt khối lượng hợp đồng. Giảm tỷ trọng các công việc trước khi lưu.`,
      canhBao: null,
    };
  if (weights.length > 0 && 1 - tong > NGUONG_LECH_WEIGHT)
    return {
      tong,
      loi: null,
      canhBao: `Tổng tỷ trọng (${tong.toFixed(4)}) chưa đủ 1 — dòng BOQ này mới gắn được một phần khối lượng.`,
    };
  return { tong, loi: null, canhBao: null };
}

// Đếm task đã map, nhóm theo hệ. Phạm vi = đúng phần người dùng đang xem: `projectId` NULL
// nghĩa là không chọn dự án nào → trả rỗng thay vì đếm chéo mọi dự án.
export async function doPhuBoq(opts: {
  projectId: number | null;
  systemCode?: string | null;
}): Promise<DoPhuBoq> {
  const { projectId, systemCode = null } = opts;
  if (projectId == null)
    return {
      tong: 0,
      daMap: 0,
      tyLe: 0,
      theoHe: [],
      weightLech: [],
      coMaBoq: 0,
    };

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

  // Đếm công việc CÓ ghi mã BOQ. Cố ý KHÔNG đối chiếu mã đó với `boq_items.code`: sổ đăng ký
  // `boq_codes` (PK (org_id, code), trigger trên cả 4 bảng) cấm hai dòng khác bảng cùng giữ một
  // mã, nên một task và một dòng BOQ KHÔNG BAO GIỜ mang cùng mã được. Nói cách khác cột
  // `tasks.boq_code` về bản chất không thể là con trỏ tới dòng BOQ — đối chiếu kiểu "mã mồ côi"
  // sẽ báo động 100% số task và chẳng nói lên điều gì. Đường duy nhất nối công việc với giá trị
  // hợp đồng là `boq_task_map`; con số này chỉ để UI cảnh tỉnh người đang nhầm hai thứ đó.
  const coMa = await withProjectScope(projectId, () =>
    queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n
         FROM tasks t
         JOIN work_packages wp ON wp.id = t.package_id
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
         LEFT JOIN systems d ON d.id = st.system_id
         ${where} AND t.boq_code IS NOT NULL`,
      ...args,
    ),
  );

  return {
    tong,
    daMap,
    tyLe: tong > 0 ? daMap / tong : 0,
    theoHe,
    weightLech,
    coMaBoq: Number(coMa?.n ?? 0),
  };
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
