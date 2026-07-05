import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, canTouchVehicle, type Role } from "@/lib/auth";
import { nextVehicleStatus, type VehicleAction } from "@/lib/procurement";

export const dynamic = "force-dynamic";

const canManage = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";
const ACTIONS: VehicleAction[] = ["approve", "enter", "exit", "no_show", "cancel"];

// PATCH /api/vehicles/:id
//  - body: { action: "approve"|"enter"|"exit"|"no_show"|"cancel" } → thao tác 1 chạm tại cổng
//    (Admin/PM/Kỹ sư làm mọi hành động; subcon đúng NCC của xe chỉ làm enter/exit).
//  - body: { plate?, driver?, driverPhone?, cargo?, gate?, expectedAt?, supplierId?, poId?,
//            needsCrane? } → sửa thông tin xe (Admin/PM/Kỹ sư).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const vehicle = await queryOne<{
    status: string;
    entered_at: string | null;
    exited_at: string | null;
  }>(`SELECT status, entered_at, exited_at FROM vehicle_logs WHERE id = ?`, id);
  if (!vehicle) return NextResponse.json({ error: "Không tìm thấy xe" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.action !== undefined) {
    const action = body.action as VehicleAction;
    if (!ACTIONS.includes(action))
      return NextResponse.json({ error: "Hành động không hợp lệ" }, { status: 400 });
    // Subcon chỉ được check-in/out xe của đúng NCC mình — approve/no_show/cancel cần Admin/PM/Kỹ sư.
    if (user.role === "subcon") {
      if (action !== "enter" && action !== "exit")
        return NextResponse.json(
          { error: "Không có quyền thực hiện hành động này" },
          { status: 403 },
        );
      if (!(await canTouchVehicle(user, id)))
        return NextResponse.json({ error: "Xe không thuộc nhà cung cấp của bạn" }, { status: 403 });
    } else if (!canManage(user.role)) {
      return NextResponse.json({ error: "Không có quyền thao tác xe" }, { status: 403 });
    }

    const newStatus = nextVehicleStatus(action, vehicle.status);
    if (newStatus === null)
      return NextResponse.json(
        { error: `Không thể thực hiện "${action}" khi xe đang ở trạng thái "${vehicle.status}"` },
        { status: 409 },
      );
    // Idempotent: đã ở đúng đích (vd bấm "Đã vào" 2 lần) → không ghi lại timestamp, trả về luôn.
    if (newStatus === vehicle.status) return NextResponse.json({ ok: true, status: newStatus });

    if (action === "enter")
      await run(
        `UPDATE vehicle_logs SET status = ?, entered_at = NOW() WHERE id = ?`,
        newStatus,
        id,
      );
    else if (action === "exit")
      await run(
        `UPDATE vehicle_logs SET status = ?, exited_at = NOW() WHERE id = ?`,
        newStatus,
        id,
      );
    else await run(`UPDATE vehicle_logs SET status = ? WHERE id = ?`, newStatus, id);

    return NextResponse.json({ ok: true, status: newStatus });
  }

  if (!canManage(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM/Kỹ sư được sửa thông tin xe" },
      { status: 403 },
    );

  const fields: Record<string, string> = {
    plate: "plate",
    driver: "driver",
    driverPhone: "driver_phone",
    cargo: "cargo",
    gate: "gate",
    supplierId: "supplier_id",
    poId: "po_id",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(fields)) {
    if (body[k] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(body[k] || null);
    }
  }
  if (body.expectedAt !== undefined) {
    const d = new Date(body.expectedAt);
    if (isNaN(d.getTime()))
      return NextResponse.json({ error: "Giờ dự kiến không hợp lệ" }, { status: 422 });
    sets.push("expected_at = ?");
    vals.push(d.toISOString());
  }
  if (body.needsCrane !== undefined) {
    sets.push("needs_crane = ?");
    vals.push(!!body.needsCrane);
  }
  if (!sets.length)
    return NextResponse.json({ error: "Không có trường cập nhật" }, { status: 400 });
  vals.push(id);
  await run(`UPDATE vehicle_logs SET ${sets.join(", ")} WHERE id = ?`, ...vals);
  return NextResponse.json({ ok: true });
}
