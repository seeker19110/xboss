import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canEditMaterials = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// GET /api/materials/:id/transactions → lịch sử nhập/xuất (mới nhất trước).
export async function GET(_req: NextRequest, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const transactions = await query(
    `SELECT t.id, t.delta, t.qty_after AS "qtyAfter", t.note,
            COALESCE(t.type, 'dieu_chinh') AS type,
            t.created_at AS "createdAt", u.name AS "userName"
       FROM material_transactions t
       LEFT JOIN users u ON t.created_by = u.id
      WHERE t.material_id = ?
      ORDER BY t.id DESC LIMIT 100`, id);

  return NextResponse.json({ transactions });
}

// POST /api/materials/:id/transactions  body: { delta, note? }
// Ghi 1 lần nhập/xuất: delta dương = dùng thêm, âm = điều chỉnh giảm.
// qty_used của vật tư được cộng dồn (không âm).
export async function POST(req: NextRequest, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditMaterials(user.role))
    return NextResponse.json({ error: "Không có quyền cập nhật vật tư" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const m = await queryOne<{ id: number; qty_used: number }>(
    `SELECT id, qty_used FROM materials WHERE id = ?`, id);
  if (!m) return NextResponse.json({ error: "Không tìm thấy vật tư" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const delta = Number(body.delta);
  if (!isFinite(delta) || delta === 0)
    return NextResponse.json({ error: "Số lượng (delta) phải là số khác 0" }, { status: 400 });
  const note = String(body.note ?? "").trim().slice(0, 300) || null;

  // Cập nhật atomic + lấy luôn số dư sau cập nhật bằng RETURNING — tránh race
  // condition khi nhiều request đồng thời (SELECT riêng có thể đọc giá trị của
  // request khác, làm sai qty_after/actual_delta trong audit).
  const updated = await queryOne<{ qty_used: number }>(
    `UPDATE materials SET qty_used = GREATEST(0, qty_used + ?), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? RETURNING qty_used`,
    delta, id);
  const qtyAfter = updated?.qty_used ?? 0;
  // Khi GREATEST(0,...) clip âm về 0, actual_delta nhỏ hơn delta gốc — ghi số thực để audit đúng.
  const actualDelta = qtyAfter - m.qty_used;

  const txId = await insertId(
    `INSERT INTO material_transactions (material_id, delta, qty_after, note, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    id, actualDelta, qtyAfter, note, user.id);

  return NextResponse.json({ id: txId, materialId: id, delta: actualDelta, qtyAfter }, { status: 201 });
}
