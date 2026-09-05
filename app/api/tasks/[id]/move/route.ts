import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { taskProjectId } from "@/lib/tien-do/workpackages";

export const dynamic = "force-dynamic";

// PATCH /api/tasks/:id/move  body: { direction: 'up' | 'down' }
// Hoán đổi sort_order với task liền kề trong cùng package.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới di chuyển được" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Cách ly dự án (vá W7, Đợt 5) — id đoán được, route chỉ dựa CAN.editStructure. Task lân
  // cận (neighbor) luôn cùng package_id với task nguồn nên chỉ cần kiểm 1 đầu.
  if (projectId == null || (await taskProjectId(id)) !== projectId)
    return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const dir = String(body.direction ?? "");
  if (dir !== "up" && dir !== "down")
    return NextResponse.json({ error: "direction phải là 'up' hoặc 'down'" }, { status: 400 });

  const cur = await queryOne<{ sort_order: number; package_id: number }>(
    `SELECT sort_order, package_id FROM tasks WHERE id = ?`,
    id,
  );
  if (!cur) return NextResponse.json({ error: "Task không tồn tại" }, { status: 404 });

  // cur.sort_order đưa vào tham số `?` thay vì nối chuỗi (quy ước CLAUDE.md) — chỉ toán tử
  // </> và ASC/DESC là literal, đến từ enum `dir` đã kiểm ở trên chứ không phải input tự do.
  const op = dir === "up" ? "< ? ORDER BY sort_order DESC" : "> ? ORDER BY sort_order ASC";
  const neighbor = await queryOne<{ id: number; sort_order: number }>(
    `SELECT id, sort_order FROM tasks WHERE package_id = ? AND sort_order ${op} LIMIT 1`,
    cur.package_id,
    cur.sort_order,
  );

  if (!neighbor) return NextResponse.json({ ok: false, message: "Đã ở đầu/cuối danh sách" });

  await run(`UPDATE tasks SET sort_order = ? WHERE id = ?`, neighbor.sort_order, id);
  await run(`UPDATE tasks SET sort_order = ? WHERE id = ?`, cur.sort_order, neighbor.id);

  return NextResponse.json({ ok: true });
}
