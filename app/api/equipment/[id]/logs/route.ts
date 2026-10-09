import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  addEquipmentLog,
  getEquipment,
  listEquipmentLogs,
  parseEquipmentLogBody,
  validateEquipmentLogInput,
} from "@/lib/vat-tu/equipment";

export const dynamic = "force-dynamic";

// GET /api/equipment/:id/logs — lịch sử cấp phát/thu hồi/chuyển/bảo trì/hiệu chuẩn.
// Scoped theo dự án đang chọn (M22) — thiết bị không thuộc dự án hiện tại → 404.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const equipmentId = parseInt(params.id);
  if (isNaN(equipmentId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const eq = projectId != null ? await getEquipment(equipmentId, projectId) : null;
  if (!eq) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });

  const logs = await listEquipmentLogs(equipmentId);
  return NextResponse.json({ logs });
}

// POST /api/equipment/:id/logs — ghi log thao tác. Admin/PM/kỹ sư mọi hành động;
// subcon chỉ được 'return' thiết bị mình đang giữ (current_crew khớp tên hiển thị của mình).
// Scoped theo dự án đang chọn (M22) — thiết bị không thuộc dự án hiện tại → 404.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const equipmentId = parseInt(params.id);
  if (isNaN(equipmentId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const eqExists = projectId != null ? await getEquipment(equipmentId, projectId) : null;
  if (!eqExists) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseEquipmentLogBody(body);
  const invalid = validateEquipmentLogInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  // Qua cổng CAN (không phải nhánh subcon tự trả thiết bị) ⇒ phải tái kiểm lúc ghi.
  const quaCan = CAN.manageEquipment(user.role);
  if (!quaCan) {
    if (user.role !== "subcon" || input.action !== "return")
      return NextResponse.json(
        { error: "Bạn không có quyền thao tác thiết bị (chỉ trả thiết bị mình đang giữ)" },
        { status: 403 },
      );
    const eq = await queryOne<{ currentCrew: string | null }>(
      `SELECT current_crew AS "currentCrew" FROM equipment WHERE id = ?`,
      equipmentId,
    );
    if (!eq || eq.currentCrew !== user.name)
      return NextResponse.json(
        { error: "Chỉ được trả thiết bị đang giữ bởi chính mình" },
        { status: 403 },
      );
  }

  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi; nhánh subcon tự trả không qua CAN.
  const kq = await ghiNeuConQuyen(
    () => !quaCan || CAN.manageEquipment(user.role),
    () => addEquipmentLog(equipmentId, input, user.id),
  );
  if (!kq.ok)
    return NextResponse.json(
      { error: "Bạn không có quyền thao tác thiết bị (chỉ trả thiết bị mình đang giữ)" },
      { status: 403 },
    );
  const result = kq.value;
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({ ok: true }, { status: 201 });
}
