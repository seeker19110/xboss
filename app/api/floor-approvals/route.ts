import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN, canTouchFloor } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { sheetTypeProjectId } from "@/lib/tien-do/workpackages";

export const dynamic = "force-dynamic";

// POST /api/floor-approvals { sheetTypeId, floorLabel }
// → get-or-create bản ghi floor_approval (có thể là draft chưa duyệt).
// Dùng để lấy approvalId trước khi upload biên bản cho tầng chưa duyệt.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const sheetTypeId = parseInt(String(body?.sheetTypeId ?? ""));
  const floorLabel = String(body?.floorLabel ?? "").trim();
  if (isNaN(sheetTypeId) || !floorLabel)
    return NextResponse.json({ error: "Thiếu sheetTypeId hoặc floorLabel" }, { status: 400 });

  // Cách ly dự án (vá W6, Đợt 5) — canTouchFloor chỉ trả lời "subcon có được giao nhóm
  // công việc ở tầng này không" và trả `true` VÔ ĐIỀU KIỆN cho mọi vai trò khác, KHÔNG so
  // dự án. Không kiểm riêng thì mọi vai trò không phải subcon get-or-create được bản ghi
  // floor_approval của sheetTypeId thuộc dự án khác (id đoán được).
  const projectId = await getCurrentProjectId(user);
  if (projectId == null || (await sheetTypeProjectId(sheetTypeId)) !== projectId)
    return NextResponse.json({ error: "Không tìm thấy sheet" }, { status: 404 });

  // Sub-con chỉ được đụng tới tầng có nhóm công việc được giao cho mình.
  if (!(await canTouchFloor(user, sheetTypeId, floorLabel)))
    return NextResponse.json({ error: "Không có quyền với tầng này" }, { status: 403 });

  // INSERT ... ON CONFLICT để tránh race condition khi 2 request đồng thời tạo cùng 1 tầng
  await run(
    `INSERT INTO floor_approvals (sheet_type_id, floor_label, is_approved) VALUES (?, ?, FALSE)
     ON CONFLICT (sheet_type_id, floor_label) DO NOTHING`,
    sheetTypeId,
    floorLabel,
  );
  const record = await queryOne<{ id: number; isApproved: boolean }>(
    `SELECT id, is_approved AS "isApproved" FROM floor_approvals WHERE sheet_type_id = ? AND floor_label = ?`,
    sheetTypeId,
    floorLabel,
  );
  if (!record) return NextResponse.json({ error: "Lỗi tạo bản ghi" }, { status: 500 });
  return NextResponse.json({ id: record.id, isApproved: record.isApproved });
}
