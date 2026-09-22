import { query, run } from "@/lib/db";

// Lịch sử thay đổi từng dòng BOQ (M124 việc 3, bảng `boq_item_history`). Bảng mới không có
// `project_id` (nó thuộc về 1 dòng `boq_items` — đã được scope theo dự án ở nơi gọi, vd
// PATCH /api/boq/:id đã SELECT ... WHERE id = ? AND project_id = ? trước khi tới đây) và
// `boq_items` cũng không bật RLS (chỉ vài bảng CAD/BIM lân cận có), nên không cần
// `withProjectScope` ở đây — khác `boq-coverage.ts` vốn đọc thẳng `tasks`/`work_packages`
// (có RLS) theo `projectId`.

export type ThayDoiBoq = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

export type DongLichSuBoq = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: number | null;
  changedByName: string | null;
  changedAt: string;
};

// Ghi 1 lô thay đổi cho 1 dòng BOQ trong 1 câu INSERT nhiều VALUES. Mảng rỗng ⇒ no-op (không
// văng lỗi vì "INSERT ... VALUES" rỗng), để nơi gọi khỏi phải tự kiểm tra trước.
export async function ghiLichSuBoq(
  boqItemId: number,
  thayDoi: ThayDoiBoq[],
  userId: number | null,
): Promise<void> {
  if (thayDoi.length === 0) return;
  const values: unknown[] = [];
  const placeholders = thayDoi
    .map((t) => {
      values.push(boqItemId, t.field, t.oldValue, t.newValue, userId);
      return "(?, ?, ?, ?, ?)";
    })
    .join(", ");
  await run(
    `INSERT INTO boq_item_history (boq_item_id, field, old_value, new_value, changed_by)
     VALUES ${placeholders}`,
    ...values,
  );
}

// Đọc lịch sử 1 dòng BOQ, mới nhất trước, join tên người đổi.
export async function lichSuBoq(boqItemId: number, limit = 100): Promise<DongLichSuBoq[]> {
  return query<DongLichSuBoq>(
    `SELECT h.field, h.old_value AS "oldValue", h.new_value AS "newValue",
            h.changed_by AS "changedBy", u.name AS "changedByName",
            h.changed_at AS "changedAt"
       FROM boq_item_history h
       LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.boq_item_id = ?
      ORDER BY h.changed_at DESC
      LIMIT ?`,
    boqItemId,
    limit,
  );
}
