import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { kiemTraTongTyTrong } from "@/lib/khoi-luong/boq-coverage";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";

export const dynamic = "force-dynamic";

// PUT /api/boq/:id/map — ghi đè toàn bộ map task ↔ dòng BOQ + weight (Admin/PM).
// Weight LUÔN nhập tay (không tự chia đều). Hai chiều lệch KHÔNG đối xứng nhau:
//   - Σweight > 1 → CHẶN (422). Σ(weight × progress) là đường duy nhất sinh khối lượng thực
//     hiện (boqExecutedQty), và khối lượng đó chảy thẳng vào gợi ý IPC — Σweight > 1 nghĩa là
//     nghiệm thu/thanh toán được nhiều hơn khối lượng hợp đồng, luôn sai, không có ca dùng hợp lệ.
//   - Σweight < 1 → chỉ CẢNH BÁO. Đây là trạng thái bình thường lúc PM đang map dần từng task;
//     chặn cứng sẽ không cho lưu nửa chừng.
// Dữ liệu CŨ vi phạm vẫn nằm nguyên trong DB (không migration nào dọn) — vì vậy boqExecutedQty
// còn kẹp trần qty_contract một lần nữa ở tầng đọc; hai lớp này cố ý chồng nhau.
// body: { map: [{ taskId, weight }] }
export async function PUT(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Không có quyền sửa map (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const item =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM boq_items WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!item) return NextResponse.json({ error: "Không tìm thấy dòng BOQ" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const rawMap: unknown[] = Array.isArray(body?.map) ? body.map : [];

  const entries: { taskId: number; weight: number }[] = [];
  const seen = new Set<number>();
  for (const e of rawMap) {
    const taskId = Number((e as { taskId?: unknown })?.taskId);
    const weight = Number((e as { weight?: unknown })?.weight);
    if (!Number.isInteger(taskId) || taskId <= 0)
      return NextResponse.json({ error: "taskId không hợp lệ" }, { status: 422 });
    if (!Number.isFinite(weight) || weight <= 0)
      return NextResponse.json({ error: "weight phải là số dương" }, { status: 422 });
    if (seen.has(taskId))
      return NextResponse.json({ error: `Task ${taskId} bị lặp trong map` }, { status: 422 });
    seen.add(taskId);
    entries.push({ taskId, weight });
  }

  // Chặn TRƯỚC khi ghi — task phải thuộc cùng dự án với dòng BOQ, nếu không tiến độ
  // dự án khác có thể đi vào khối lượng thực hiện và gợi ý IPC.
  const { tong: sumWeight, loi, canhBao } = kiemTraTongTyTrong(entries.map((e) => e.weight));
  if (loi) return NextResponse.json({ error: loi }, { status: 422 });

  if (entries.length > 0) {
    const existingTasks = await query<{ id: number }>(
      `SELECT t.id FROM tasks t
         JOIN work_packages wp ON wp.id = t.package_id
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
        WHERE t.id IN (${entries.map(() => "?").join(",")}) AND tw.project_id = ?`,
      ...entries.map((e) => e.taskId),
      projectId,
    );
    const validIds = new Set(existingTasks.map((t) => t.id));
    const missing = entries.filter((e) => !validIds.has(e.taskId));
    if (missing.length > 0)
      return NextResponse.json(
        {
          error: `Task không tồn tại hoặc không thuộc dự án hiện hành: ${missing.map((e) => e.taskId).join(", ")}`,
        },
        { status: 422 },
      );
  }

  await withTransaction(async () => {
    await run(`DELETE FROM boq_task_map WHERE boq_item_id = ?`, id);
    for (const e of entries) {
      await run(
        `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, ?)`,
        id,
        e.taskId,
        e.weight,
      );
    }
  });

  return NextResponse.json({ ok: true, sumWeight, warning: canhBao });
}
