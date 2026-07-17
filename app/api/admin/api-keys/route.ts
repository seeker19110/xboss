import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { query, queryOne, insertId } from "@/lib/db";
import { generateApiKey, hashApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

const VALID_SCOPES = ["read", "read_finance"] as const;

// GET /api/admin/api-keys — danh sách API key (không bao giờ trả key thô/hash). Admin.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageIntegrations(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý API key" }, { status: 403 });

  const keys = await query(
    `SELECT k.id, k.name, k.project_id AS "projectId", p.name AS "projectName",
            k.scopes, k.created_at AS "createdAt", k.last_used_at AS "lastUsedAt",
            k.revoked_at AS "revokedAt"
       FROM api_keys k
       LEFT JOIN projects p ON p.id = k.project_id
      ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC, k.id DESC`,
  );
  return NextResponse.json({ keys });
}

// POST /api/admin/api-keys { name, projectId?, scopes[] } — tạo key mới. Trả key thô
// ĐÚNG 1 LẦN ({ key }); DB chỉ giữ hash. Admin.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageIntegrations(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý API key" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Thiếu tên key" }, { status: 400 });

  const projectId = body.projectId != null && body.projectId !== "" ? Number(body.projectId) : null;
  if (projectId != null && !Number.isInteger(projectId))
    return NextResponse.json({ error: "projectId không hợp lệ" }, { status: 400 });

  // Kiểm FK projectId tồn tại
  if (projectId != null) {
    const projectExists = await queryOne(`SELECT 1 FROM projects WHERE id = ?`, projectId);
    if (!projectExists) {
      return NextResponse.json({ error: "Dự án không tồn tại" }, { status: 404 });
    }
  }

  const rawScopes: string[] = Array.isArray(body.scopes)
    ? (body.scopes as unknown[]).map((s) => String(s))
    : ["read"];
  const scopes = [...new Set(rawScopes)];
  if (scopes.length === 0) scopes.push("read");
  if (!scopes.every((s) => (VALID_SCOPES as readonly string[]).includes(s)))
    return NextResponse.json({ error: "Scope không hợp lệ" }, { status: 422 });

  const raw = generateApiKey();
  const id = await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    name,
    hashApiKey(raw),
    projectId,
    scopes,
    user.id,
  );

  // key thô chỉ trả 1 lần — client phải lưu lại ngay, hệ thống không lưu bản thô.
  return NextResponse.json(
    { id, key: raw, warning: "Lưu lại key này ngay — sẽ không hiển thị lại sau khi đóng." },
    { status: 201 },
  );
}
