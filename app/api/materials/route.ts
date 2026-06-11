import { NextRequest, NextResponse } from "next/server";
import { query, insertId } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";

export const dynamic = "force-dynamic";

const canEditMaterials = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// GET /api/materials?sheetTypeId= → danh sách vật tư (mọi người đã đăng nhập).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sheetTypeId = parseInt(req.nextUrl.searchParams.get("sheetTypeId") ?? "");
  const filter = isNaN(sheetTypeId) ? "" : `WHERE m.sheet_type_id = ${sheetTypeId}`;

  const materials = await query(
    `SELECT m.id, m.sheet_type_id AS "sheetTypeId", m.task_id AS "taskId",
            m.boq_code AS "boqCode",
            m.name, m.unit, m.qty_planned AS "qtyPlanned", m.qty_used AS "qtyUsed",
            m.status, m.note, m.updated_at AS "updatedAt",
            st.code AS "sheetCode"
       FROM materials m
       LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
       ${filter}
      ORDER BY m.id DESC`);

  return NextResponse.json({ materials });
}

// POST /api/materials  body: { sheetTypeId, name, boqCode?, unit?, qtyPlanned?, note? } (Admin/PM/Kỹ sư).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditMaterials(user.role))
    return NextResponse.json({ error: "Không có quyền thêm vật tư" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const sheetTypeId = Number(body.sheetTypeId);
  if (!name) return NextResponse.json({ error: "Thiếu tên vật tư" }, { status: 400 });
  if (isNaN(sheetTypeId)) return NextResponse.json({ error: "Thiếu sheet" }, { status: 400 });

  // BOQCODE duy nhất toàn hệ thống (nhóm + task + vật tư) — chống đặt hàng nhầm mã.
  const boqCode = String(body.boqCode ?? "").trim() || null;
  if (boqCode) {
    const usedBy = await boqTakenBy(boqCode);
    if (usedBy) return NextResponse.json({ error: `Mã BOQ "${boqCode}" đã được dùng bởi ${usedBy}` }, { status: 409 });
  }

  const id = await insertId(
    `INSERT INTO materials (sheet_type_id, boq_code, name, unit, qty_planned, qty_used, status, note)
     VALUES (?, ?, ?, ?, ?, 0, 'dat_hang', ?)`,
    sheetTypeId, boqCode, name, body.unit ? String(body.unit).trim() : null,
    Number(body.qtyPlanned) || 0, body.note ? String(body.note) : null);

  return NextResponse.json({ id }, { status: 201 });
}
