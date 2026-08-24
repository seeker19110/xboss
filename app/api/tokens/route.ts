import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { query, insertId } from "@/lib/db";
import { generateDeviceToken, hashToken, TOKEN_TTL_DAYS } from "@/lib/bao-mat/api-tokens";

export const dynamic = "force-dynamic";

// GET /api/tokens — danh sách token thiết bị (M99 PR2). User thường chỉ thấy token của
// mình; Admin thấy mọi token trong org (kèm tên chủ token) để thu hồi khi cần.
// KHÔNG bao giờ trả token thô/hash.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const laAdmin = user.role === "admin";
  const tokens = await query(
    `SELECT t.id, t.name, t.scopes, t.user_id AS "userId", u.name AS "userName",
            t.created_at AS "createdAt", t.expires_at AS "expiresAt",
            t.revoked_at AS "revokedAt", t.last_used_at AS "lastUsedAt"
       FROM api_tokens t JOIN users u ON u.id = t.user_id
      WHERE ${laAdmin ? `u.org_id = ?` : `t.user_id = ?`}
      ORDER BY t.revoked_at IS NOT NULL, t.created_at DESC, t.id DESC`,
    laAdmin ? user.orgId : user.id,
  );
  return NextResponse.json({ tokens });
}

// POST /api/tokens { name } — tạo token thủ công cho CHÍNH MÌNH (không qua ghép thiết bị,
// vd dán tay vào máy không có trình duyệt). Trả token thô ĐÚNG 1 LẦN; DB chỉ giữ hash.
// Cần CAN.manageDrawings — cùng ngưỡng với duyệt ghép thiết bị.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền tạo token plugin (cần quyền thao tác bản vẽ)" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Thiếu tên token" }, { status: 400 });

  const token = generateDeviceToken();
  const id = await insertId(
    `INSERT INTO api_tokens (user_id, name, token_hash, scopes, expires_at)
     VALUES (?, ?, ?, 'cad', NOW() + make_interval(days => ?))`,
    user.id,
    name.slice(0, 100),
    hashToken(token),
    TOKEN_TTL_DAYS,
  );
  return NextResponse.json({ id, token, name, ttlDays: TOKEN_TTL_DAYS });
}
