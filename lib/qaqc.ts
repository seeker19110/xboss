// QA&QC (M3 lõi): gate nghiệm thu (checklist bắt buộc) + hold-point chuyển bước.
// Logic tách khỏi route để dùng chung cho POST approve/approvals + các route ghi tiến độ
// (dimensions/:id, dimensions/batch, tasks/:id/progress) — cùng pattern lib/boq.ts/lib/cost.ts.
import { query, queryOne } from "@/lib/db";

export type HandoverCheck = { blocked: boolean; reason?: string };

// Hold point chuyển bước: package (successor) bị khoá nếu có dependency requires_handover=TRUE
// mà predecessor CHƯA có inspection đạt lẫn biên bản chuyển bước (task_documents.doc_category
// = 'chuyen_buoc' gắn vào task thuộc package đó) — chỉ cần 1 trong 2 là đủ để mở khoá.
export async function handoverBlocked(packageId: number): Promise<HandoverCheck> {
  const deps = await query<{
    predecessorId: number;
    predecessorName: string;
    predecessorCode: string;
  }>(
    `SELECT wp.id AS "predecessorId", wp.name AS "predecessorName", wp.code AS "predecessorCode"
       FROM package_dependencies pd
       JOIN work_packages wp ON wp.id = pd.predecessor_id
      WHERE pd.successor_id = ? AND pd.requires_handover = TRUE`,
    packageId,
  );

  for (const dep of deps) {
    const inspected = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM qc_inspections
        WHERE work_package_id = ? AND status = 'passed'`,
      dep.predecessorId,
    );
    if ((inspected?.count ?? 0) > 0) continue;

    const handedOver = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM task_documents td
         JOIN tasks t ON td.task_id = t.id
        WHERE t.package_id = ? AND td.doc_category = 'chuyen_buoc'`,
      dep.predecessorId,
    );
    if ((handedOver?.count ?? 0) > 0) continue;

    return {
      blocked: true,
      reason: `Chờ biên bản chuyển bước: ${dep.predecessorCode} — ${dep.predecessorName}`,
    };
  }
  return { blocked: false };
}

// Gate nghiệm thu: task chỉ bị chặn approve nếu có ÍT NHẤT 1 checklist mẫu đang bật `required`
// áp dụng cho hệ của task mà CHƯA có inspection `passed` gắn đúng checklist đó + đúng task.
// (đã quyết 2026-07-05: gate theo cờ required của mẫu, không phải công tắc toàn dự án.)
export async function requiredInspectionMissing(taskId: number): Promise<boolean> {
  const task = await queryOne<{ disciplineId: number | null }>(
    `SELECT st.discipline_id AS "disciplineId"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE t.id = ?`,
    taskId,
  );
  if (!task) return false;

  const missing = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM qc_checklists c
      WHERE c.active = TRUE AND c.required = TRUE
        AND (c.discipline_id IS NULL OR c.discipline_id = ?)
        AND NOT EXISTS (
          SELECT 1 FROM qc_inspections i
           WHERE i.checklist_id = c.id AND i.task_id = ? AND i.status = 'passed'
        )`,
    task.disciplineId,
    taskId,
  );
  return (missing?.count ?? 0) > 0;
}

export type ChecklistItem = {
  label: string;
  type: "pass_fail" | "measure";
  unit?: string;
  designValue?: number | string;
};

export function validateChecklistItems(items: unknown): items is ChecklistItem[] {
  if (!Array.isArray(items)) return false;
  return items.every(
    (it) =>
      it &&
      typeof it === "object" &&
      typeof (it as ChecklistItem).label === "string" &&
      (it as ChecklistItem).label.trim().length > 0 &&
      ((it as ChecklistItem).type === "pass_fail" || (it as ChecklistItem).type === "measure"),
  );
}

export type InspectionResult = {
  label: string;
  pass: boolean;
  measured?: number | string;
  note?: string;
};

export function validateInspectionResults(results: unknown): results is InspectionResult[] {
  if (!Array.isArray(results)) return false;
  return results.every(
    (r) =>
      r &&
      typeof r === "object" &&
      typeof (r as InspectionResult).label === "string" &&
      typeof (r as InspectionResult).pass === "boolean",
  );
}
