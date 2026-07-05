import { NextRequest, NextResponse } from "next/server";
import { query, run, withTransaction } from "@/lib/db";
import { recomputeTask } from "@/lib/recompute";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/auth";
import { handoverBlocked } from "@/lib/qaqc";

export const dynamic = "force-dynamic";

const MAX_IDS = 1000;

// PATCH /api/dimensions/batch  body: { ids: number[], installed: boolean }
// Tick/bỏ-tick nhiều ô dimension theo vùng chọn trên lưới tracking. recompute
// gộp một lần mỗi task (tránh tính lại trùng khi cả vùng cùng task). Atomic.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  // Vai trò chỉ-xem (BCH/CĐT/Viewer) không được tick ô tiến độ.
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền cập nhật tiến độ" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? [
        ...new Set(
          body.ids.map((x: unknown) => parseInt(String(x))).filter((n: number) => !isNaN(n)),
        ),
      ]
    : [];
  if (!ids.length) return NextResponse.json({ error: "Không có dimension" }, { status: 400 });
  if (ids.length > MAX_IDS)
    return NextResponse.json({ error: `Tối đa ${MAX_IDS} ô mỗi lần` }, { status: 422 });
  const installed = body.installed ? 1 : 0;

  // Lấy task_id + package_id của từng dimension để kiểm quyền + gộp recompute + hold point.
  const placeholders = ids.map(() => "?").join(", ");
  const dims = await query<{ id: number; task_id: number; package_id: number }>(
    `SELECT pd.id, pd.task_id, t.package_id
       FROM progress_dimensions pd JOIN tasks t ON t.id = pd.task_id
      WHERE pd.id IN (${placeholders})`,
    ...ids,
  );
  if (!dims.length)
    return NextResponse.json({ error: "Không tìm thấy dimension" }, { status: 404 });

  const taskIds = [...new Set(dims.map((d) => d.task_id))];
  for (const tid of taskIds) {
    if (!(await canTouchTask(user, tid)))
      return NextResponse.json(
        { error: "Bạn chỉ được cập nhật task được giao cho mình" },
        { status: 403 },
      );
  }

  // Hold point chuyển bước (M3): chỉ chặn khi TICK — kiểm từng package liên quan (dedup).
  if (installed) {
    const packageIds = [...new Set(dims.map((d) => d.package_id))];
    for (const pid of packageIds) {
      const gate = await handoverBlocked(pid);
      if (gate.blocked) return NextResponse.json({ error: gate.reason }, { status: 409 });
    }
  }

  const dimIds = dims.map((d) => d.id);
  await withTransaction(async () => {
    const ph = dimIds.map(() => "?").join(", ");
    await run(
      `UPDATE progress_dimensions SET installed = ?, value = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${ph})`,
      installed,
      installed,
      ...dimIds,
    );
    for (const tid of taskIds) await recomputeTask(tid, user.name);
  });

  return NextResponse.json({ ok: true, updated: dimIds.length, installed: !!installed });
}
