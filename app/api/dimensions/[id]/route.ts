import { NextRequest, NextResponse } from "next/server";
import { queryOne, withTransaction } from "@/lib/db";
import { recomputeTask } from "@/lib/tien-do/recompute";
import { ghiDauVetTick } from "@/lib/tien-do/dimension-events";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { handoverBlocked, methodStatementBlocked } from "@/lib/ky-thuat/qaqc";

export const dynamic = "force-dynamic";

// Giới hạn độ dài ghi chú theo ô (M120 §12) — ghi chú là gợi ý ngắn tại hiện trường
// ("chờ vật tư", "lệch cao độ"), nội dung dài thuộc về bình luận task.
const MAX_NOTE_LEN = 500;

// PATCH /api/dimensions/:id  body: { installed: boolean }  → toggle + tính lại % task/package.
// Bọc trong transaction: update dimension + recompute phải atomic để tránh
// 2 tick đồng thời tính sai % (đọc cùng snapshot rồi cả 2 cùng ghi).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  // Vai trò chỉ-xem (BCH/CĐT/Viewer) không được tick ô tiến độ.
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền cập nhật tiến độ" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const installed = body.installed ? 1 : 0;

  // Ghi chú theo ô (M120 FR3): trim, rỗng → NULL, tối đa 500 ký tự (chặn ở đây để không
  // để Postgres từ chối thành lỗi 500). Bỏ tick thì ghi chú bị xoá cùng dấu vết lắp (D2),
  // nên `note` client gửi kèm installed=false không có tác dụng.
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    const t = String(body.note).trim();
    if (t.length > MAX_NOTE_LEN)
      return NextResponse.json({ error: `Ghi chú tối đa ${MAX_NOTE_LEN} ký tự` }, { status: 422 });
    note = t || null;
  }

  const dim = await queryOne<{ task_id: number; package_id: number }>(
    `SELECT pd.task_id, t.package_id
       FROM progress_dimensions pd JOIN tasks t ON t.id = pd.task_id
      WHERE pd.id = ?`,
    id,
  );
  if (!dim) return NextResponse.json({ error: "Không tìm thấy dimension" }, { status: 404 });

  if (!(await canTouchTask(user, dim.task_id)))
    return NextResponse.json(
      { error: "Bạn chỉ được cập nhật task được giao cho mình" },
      { status: 403 },
    );

  // Hold point chuyển bước (M3) + gate biện pháp thi công (M8): chỉ chặn khi TICK
  // (installed=true) — bỏ tick không cần mở khoá.
  if (installed) {
    const gate = await handoverBlocked(dim.package_id);
    if (gate.blocked) return NextResponse.json({ error: gate.reason }, { status: 409 });
    const methodGate = await methodStatementBlocked(dim.package_id);
    if (methodGate.blocked) return NextResponse.json({ error: methodGate.reason }, { status: 409 });
  }

  const result = await withTransaction(async () => {
    // Dữ liệu sự kiện theo ô (M120 FR1) — luật ai/lúc nào/ghi chú nằm trong lib dùng chung,
    // route chỉ là ranh giới HTTP (ADR-0008). `installedAt`/`installedBy` client gửi bị bỏ qua.
    await ghiDauVetTick([id], !!installed, { userId: user.id, note });
    return recomputeTask(dim.task_id, user.name);
  });

  return NextResponse.json({ id, installed: !!installed, task: result });
}
