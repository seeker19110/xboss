// lib/dich-vu/cad-boq-snapshot.ts — Ảnh chụp KL BOQ hợp đồng theo hạng mục bóc tách của plugin
// AutoCAD (M101 §6.3 dòng cuối, PR4). Tầng dịch vụ (ADR-0008) vì phối hợp HAI miền: map mã BOQ
// theo dự án (`ky-thuat/cad`) và sổ khối lượng hợp đồng (`khoi-luong` — bảng `boq_items`).
//
// CHỈ ĐỌC. Không có hàm ghi nào trong tệp này và route dùng nó chỉ export GET: đường ghi sổ khối
// lượng duy nhất vẫn là upload có kiểm định (M101 §6.4 — "nếu sau này muốn ghi thật, mở đặc tả
// riêng có duyệt 2 bước như nghiệm thu").
//
// TIỀN: đặc tả M101 §7 FR5 chốt PR này KHÔNG đụng cột tiền — truy vấn dưới chỉ lấy KHỐI LƯỢNG
// (`qty_contract`), tuyệt đối không SELECT `unit_price`/`sub_unit_price`, nên không phát sinh
// phép tính tiền nào trên float JS (quy ước M45, `lib/nen/money.ts`).
import { query, withProjectScope } from "@/lib/db";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";
import { layMapBoqTheoDuAn } from "@/lib/ky-thuat/cad/boq-map";

export type DongDoiChieuBoq = {
  /** Id hạng mục trong rule pack (`takeoff.items[].id`). */
  takeoffItemId: string;
  /** Mã BOQ đã gán cho hạng mục này ở dự án đang xét. */
  boqCode: string;
  /** Tên/đơn vị lấy từ dòng BOQ trên hệ thống; null = chưa có dòng BOQ nào mang mã đó. */
  ten: string | null;
  donVi: string | null;
  /** KL hợp đồng của dòng BOQ; null = chưa khớp được dòng nào (KHÔNG suy ra 0 — hai việc khác nhau). */
  qtyContract: number | null;
};

export type SnapshotBoq = {
  projectId: number;
  rulePackVersion: string;
  /** Thời điểm chụp (ISO) — Excel `Doi-chieu` in ra để QS biết số liệu này của lúc nào. */
  chupLuc: string;
  dong: DongDoiChieuBoq[];
};

type DongThoBoq = {
  code: string;
  name: string;
  unit: string;
  qtyContract: number | null;
};

/**
 * KL BOQ hợp đồng theo từng hạng mục bóc tách ĐÃ ĐƯỢC GÁN MÃ ở dự án này.
 *
 * Hạng mục chưa gán mã không có gì để đối chiếu nên không xuất hiện — sheet `Doi-chieu` chỉ so
 * những cặp đã được QS/PM chốt là "cùng một công tác".
 *
 * Khớp mã KHÔNG phân biệt hoa/thường (`lower()`) để bám đúng ràng buộc duy nhất của
 * `boq_items` (`uniq_boq_items_code_lower`) — nếu khớp phân biệt hoa/thường thì mã nhập lệch một
 * chữ hoa sẽ im lặng thành "không có dòng BOQ", đúng lớp lỗi "sai mà trông như thiếu dữ liệu".
 * Ràng buộc đó cũng bảo đảm mỗi mã tối đa một dòng nên không cần gộp SUM.
 */
export async function laySnapshotBoqTheoDuAn(projectId: number): Promise<SnapshotBoq> {
  const map = await layMapBoqTheoDuAn(projectId);
  const chupLuc = new Date().toISOString();
  const rulePackVersion = getCurrentRulePack().version;
  if (map.length === 0) return { projectId, rulePackVersion, chupLuc, dong: [] };

  const maCanTim = [...new Set(map.map((m) => m.boqCode.toLowerCase()))];
  const placeholders = maCanTim.map(() => "?").join(",");
  // Lọc `project_id = ?` ở tầng app (RLS chỉ là phòng tuyến thứ hai — `boq_items` chưa nằm trong
  // nhóm bảng bật RLS của 0069/0092): mã BOQ duy nhất TOÀN HỆ THỐNG nên thiếu điều kiện này là
  // đọc được KL hợp đồng của dự án khác chỉ bằng cách gán mã của họ vào map dự án mình.
  const rows = await withProjectScope(projectId, () =>
    query<DongThoBoq>(
      `SELECT code, name, unit, qty_contract AS "qtyContract"
         FROM boq_items
        WHERE project_id = ? AND lower(code) IN (${placeholders})`,
      projectId,
      ...maCanTim,
    ),
  );
  const theoMa = new Map(rows.map((r) => [r.code.toLowerCase(), r]));

  return {
    projectId,
    rulePackVersion,
    chupLuc,
    dong: map.map((m) => {
      const bi = theoMa.get(m.boqCode.toLowerCase());
      return {
        takeoffItemId: m.takeoffItemId,
        boqCode: m.boqCode,
        ten: bi?.name ?? null,
        donVi: bi?.unit ?? null,
        qtyContract: bi ? Number(bi.qtyContract ?? 0) : null,
      };
    }),
  };
}
