import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { recomputeTask } from "@/lib/tien-do/recompute";
import { ghiDauVetTick } from "@/lib/tien-do/dimension-events";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { handoverBlocked, methodStatementBlocked } from "@/lib/ky-thuat/qaqc";
import { taskProjectId } from "@/lib/tien-do/workpackages";

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

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

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

  // Cách ly dự án (vá W6, Đợt 5) — canTouchTask không so dự án (xem ghi chú ở
  // app/api/dimensions/[id]/route.ts). Kiểm TỪNG task trong vùng chọn: chỉ cần 1 ô thuộc
  // dự án khác là chặn nguyên request (id đoán được, "Không tìm thấy dimension" — không lộ
  // dòng nào thuộc dự án khác tồn tại).
  for (const tid of taskIds) {
    if (projectId == null || (await taskProjectId(tid)) !== projectId)
      return NextResponse.json({ error: "Không tìm thấy dimension" }, { status: 404 });
  }

  for (const tid of taskIds) {
    if (!(await canTouchTask(user, tid)))
      return NextResponse.json(
        { error: "Bạn chỉ được cập nhật task được giao cho mình" },
        { status: 403 },
      );
  }

  // Hold point chuyển bước (M3) + gate biện pháp thi công (M8): chỉ chặn khi TICK —
  // kiểm từng package liên quan (dedup).
  if (installed) {
    const packageIds = [...new Set(dims.map((d) => d.package_id))];
    for (const pid of packageIds) {
      const gate = await handoverBlocked(pid);
      if (gate.blocked) return NextResponse.json({ error: gate.reason }, { status: 409 });
      const methodGate = await methodStatementBlocked(pid);
      if (methodGate.blocked)
        return NextResponse.json({ error: methodGate.reason }, { status: 409 });
    }
  }

  const dimIds = dims.map((d) => d.id);
  await withTransaction(async () => {
    // Dữ liệu sự kiện (M120 FR2) — cùng lib dùng chung với PATCH đơn. Không truyền `note`:
    // ghi chú là việc của từng ô, gán chung cả vùng chọn sẽ ra dữ liệu vô nghĩa (ghi chú cũ
    // của các ô được giữ nguyên khi tick, và bị xoá cùng dấu vết lắp khi bỏ tick).
    await ghiDauVetTick(dimIds, !!installed, { userId: user.id });
    for (const tid of taskIds) await recomputeTask(tid, user.name);
  });

  return NextResponse.json({ ok: true, updated: dimIds.length, installed: !!installed });
}
