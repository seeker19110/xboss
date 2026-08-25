// lib/ky-thuat/cad/boq-map.ts — Map "hạng mục bóc tách của rule pack" → "Mã BOQ" THEO DỰ ÁN
// (M101 §6.3, PR4). Bảng `cad_takeoff_boq_map` (migration 0140), có RLS theo project_id nên mọi
// truy vấn ở đây bọc `withProjectScope` — thiếu GUC là policy chặn sạch, không phải trả nhầm.
//
// Ranh giới miền: tệp này CHỈ biết bảng map + rule pack (miền kỹ thuật). Việc ghép map với KL
// hợp đồng trong `boq_items` (miền khối lượng) nằm ở `lib/dich-vu/cad-boq-snapshot.ts` — phối
// hợp 2 miền thì lên tầng dịch vụ (ADR-0008), không kéo `khoi-luong` vào đây.
import { query, run, withProjectScope } from "@/lib/db";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";

/** Một dòng map: hạng mục bóc tách ↔ mã BOQ của dự án. */
export type MaBoqTheoItem = { takeoffItemId: string; boqCode: string };

/** Trần độ dài mã BOQ khi nhập tay trên web — đủ rộng cho mọi mã thật, chặn dán nhầm cả đoạn. */
export const MAX_DAI_MA_BOQ = 64;

/** Id các hạng mục bóc tách của rule pack đang phát hành (nguồn kiểm id hợp lệ khi ghi). */
export function danhSachItemBocTach(): { id: string; name: string; group: string; unit: string }[] {
  return getCurrentRulePack().takeoff.items.map((i) => ({
    id: i.id,
    name: i.name,
    group: i.group,
    unit: i.unit,
  }));
}

/** Map của một dự án, sắp theo `takeoff_item_id` để kết quả (và ETag suy từ nó) ổn định. */
export async function layMapBoqTheoDuAn(projectId: number): Promise<MaBoqTheoItem[]> {
  return withProjectScope(projectId, () =>
    query<MaBoqTheoItem>(
      `SELECT takeoff_item_id AS "takeoffItemId", boq_code AS "boqCode"
         FROM cad_takeoff_boq_map
        WHERE project_id = ?
        ORDER BY takeoff_item_id`,
      projectId,
    ),
  );
}

export type KetQuaGhiMap = { ok: true; soGan: number; soGo: number } | { ok: false; loi: string };

/**
 * Ghi map của một dự án. Mã rỗng = GỠ dòng map (không lưu mã rỗng làm rác).
 *
 * Idempotent: upsert theo `(project_id, takeoff_item_id)` qua `ON CONFLICT` — bấm lưu hai lần
 * hoặc gửi lại khi mạng chập chờn không đẻ dòng thứ hai. Chỉ nhận id hạng mục CÓ THẬT trong rule
 * pack đang phát hành: id lạ (client tự bịa/rule pack cũ) bị từ chối cả lô thay vì ghi rác vào DB.
 */
export async function ghiMapBoqTheoDuAn(
  projectId: number,
  userId: number,
  items: MaBoqTheoItem[],
): Promise<KetQuaGhiMap> {
  const hopLe = new Set(danhSachItemBocTach().map((i) => i.id));
  const daThay = new Set<string>();
  const chuanHoa: MaBoqTheoItem[] = [];
  for (const item of items) {
    const id = String(item?.takeoffItemId ?? "").trim();
    const ma = String(item?.boqCode ?? "").trim();
    if (!hopLe.has(id)) {
      return {
        ok: false,
        loi: `Hạng mục bóc tách "${id}" không có trong rule pack đang phát hành`,
      };
    }
    if (daThay.has(id)) return { ok: false, loi: `Hạng mục "${id}" gửi trùng hai lần` };
    if (ma.length > MAX_DAI_MA_BOQ) {
      return { ok: false, loi: `Mã BOQ của "${id}" dài quá ${MAX_DAI_MA_BOQ} ký tự` };
    }
    daThay.add(id);
    chuanHoa.push({ takeoffItemId: id, boqCode: ma });
  }

  let soGan = 0;
  let soGo = 0;
  // readOnly: false — đây là đường GHI; withProjectScope mặc định mở transaction READ ONLY.
  await withProjectScope(
    projectId,
    async () => {
      for (const { takeoffItemId, boqCode } of chuanHoa) {
        if (boqCode === "") {
          const kq = await run(
            `DELETE FROM cad_takeoff_boq_map WHERE project_id = ? AND takeoff_item_id = ?`,
            projectId,
            takeoffItemId,
          );
          soGo += kq.changes;
        } else {
          await run(
            `INSERT INTO cad_takeoff_boq_map (project_id, takeoff_item_id, boq_code, updated_by)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (project_id, takeoff_item_id)
             DO UPDATE SET boq_code = EXCLUDED.boq_code, updated_by = EXCLUDED.updated_by,
                           updated_at = NOW()`,
            projectId,
            takeoffItemId,
            boqCode,
            userId,
          );
          soGan++;
        }
      }
    },
    { readOnly: false },
  );
  return { ok: true, soGan, soGo };
}

/**
 * Gán mã BOQ của dự án vào danh sách hạng mục của rule pack (thuần — test đơn vị được).
 *
 * KHÔNG sửa tại chỗ: `getCurrentRulePack()` trả về đúng đối tượng JSON đã import (singleton dùng
 * chung cho mọi request) — sửa tại chỗ là rò mã BOQ của dự án này sang request của dự án khác.
 * Hạng mục không có trong map giữ nguyên `boqCode` gốc của rule pack.
 */
export function ganMaBoqVaoItems<T extends { id: string; boqCode: string }>(
  items: readonly T[],
  map: readonly MaBoqTheoItem[],
): T[] {
  const theoId = new Map(map.map((m) => [m.takeoffItemId, m.boqCode]));
  return items.map((i) => {
    const ma = theoId.get(i.id);
    return ma ? ({ ...i, boqCode: ma } as T) : i;
  });
}
