import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { query } from "@/lib/db";
import { createCadToken } from "@/lib/bao-mat/cad-devices";

export const dynamic = "force-dynamic";

// GET /api/tokens — danh sách token thiết bị AutoCAD (scope cad) CỦA CHÍNH người gọi
// (M99 PR2). Không bao giờ trả key thô/hash. Admin xem toàn bộ key mọi loại ở
// /api/admin/api-keys sẵn có — route này là bảng cho kỹ sư tự quản thiết bị của mình.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền quản lý thiết bị AutoCAD" }, { status: 403 });
  }

  const tokens = await query(
    `SELECT id, name, device_name AS "deviceName", created_at AS "createdAt",
            last_used_at AS "lastUsedAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"
       FROM api_keys
      WHERE created_by = ? AND org_id = ? AND 'cad' = ANY(scopes)
      ORDER BY revoked_at IS NOT NULL, created_at DESC, id DESC`,
    user.id,
    user.orgId,
  );
  return NextResponse.json({ tokens });
}

// POST /api/tokens { name } — tạo token cad thủ công từ web (đường dự phòng khi không dùng
// ghép mã: kỹ sư dán token vào plugin bằng tay). Key thô trả ĐÚNG 1 LẦN.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo token AutoCAD" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 100) {
    return NextResponse.json(
      { error: "Thiếu hoặc sai tên token (tối đa 100 ký tự)" },
      { status: 400 },
    );
  }

  const { key, keyId, expiresAt } = await createCadToken(user.id, user.orgId, name, null);
  return NextResponse.json({ id: keyId, key, expiresAt }, { status: 201 });
}
