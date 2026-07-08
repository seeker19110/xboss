import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// PUT /api/boq/:id/map — ghi đè toàn bộ map task ↔ dòng BOQ + weight (Admin/PM).
// Weight LUÔN nhập tay (không tự chia đều) — chỉ cảnh báo khi Σweight ≠ 1, không chặn cứng.
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

  if (entries.length > 0) {
    const existingTasks = await query<{ id: number }>(
      `SELECT id FROM tasks WHERE id IN (${entries.map(() => "?").join(",")})`,
      ...entries.map((e) => e.taskId),
    );
    const validIds = new Set(existingTasks.map((t) => t.id));
    const missing = entries.filter((e) => !validIds.has(e.taskId));
    if (missing.length > 0)
      return NextResponse.json(
        { error: `Task không tồn tại: ${missing.map((e) => e.taskId).join(", ")}` },
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

  const sumWeight = entries.reduce((s, e) => s + e.weight, 0);
  const warning =
    entries.length > 0 && Math.abs(sumWeight - 1) > 0.01
      ? `Tổng weight (${sumWeight.toFixed(4)}) khác 1 — kiểm tra lại tỷ trọng phân bổ.`
      : null;

  return NextResponse.json({ ok: true, sumWeight, warning });
}
