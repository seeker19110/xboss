import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, run } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";

export const dynamic = "force-dynamic";

const canEditMaterials = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// GET /api/materials?sheetTypeId= → danh sách vật tư (mọi người đã đăng nhập).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sheetTypeId = parseInt(req.nextUrl.searchParams.get("sheetTypeId") ?? "");
  const hasFilter = !isNaN(sheetTypeId);

  let materials;
  try {
    materials = await query(
      `SELECT m.id, m.sheet_type_id AS "sheetTypeId", m.task_id AS "taskId",
              m.boq_code AS "boqCode",
              m.name, m.unit,
              m.qty_boq AS "qtyBoq", m.qty_planned AS "qtyPlanned", m.qty_used AS "qtyUsed",
              COALESCE(m.qty_stock, 0) AS "qtyStock",
              COALESCE(m.min_stock_level, 0) AS "minStockLevel",
              m.status, m.note, m.updated_at AS "updatedAt",
              st.code AS "sheetCode"
         FROM materials m
         LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
         ${hasFilter ? "WHERE m.sheet_type_id = ?" : ""}
        ORDER BY m.sort_order, m.id`,
      ...(hasFilter ? [sheetTypeId] : []));
  } catch (e) {
    console.error("GET /api/materials error:", e);
    return NextResponse.json({ error: "Lỗi truy vấn DB", materials: [] }, { status: 500 });
  }

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

  // afterId: chèn sau vật tư có id này (null = thêm vào cuối).
  const afterId = body.afterId ? Number(body.afterId) : null;
  let sortOrder: number;

  if (afterId) {
    const after = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM materials WHERE id = ? AND sheet_type_id = ?`, afterId, sheetTypeId);
    if (!after) return NextResponse.json({ error: "afterId không hợp lệ" }, { status: 400 });
    sortOrder = after.sort_order + 1;
    await run(`UPDATE materials SET sort_order = sort_order + 1 WHERE sheet_type_id = ? AND sort_order >= ?`, sheetTypeId, sortOrder);
  } else {
    const maxRow = await queryOne<{ m: number | null }>(`SELECT MAX(sort_order) AS m FROM materials WHERE sheet_type_id = ?`, sheetTypeId);
    sortOrder = (maxRow?.m ?? 0) + 1;
  }

  let id: number;
  try {
    id = await insertId(
      `INSERT INTO materials (sheet_type_id, boq_code, name, unit, qty_boq, qty_planned, qty_used, status, note, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'dat_hang', ?, ?)`,
      sheetTypeId, boqCode, name, body.unit ? String(body.unit).trim() : null,
      Number(body.qtyBoq) || 0, Number(body.qtyPlanned) || 0,
      body.note ? String(body.note) : null, sortOrder);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/materials error:", msg);
    // Nếu cột qty_boq chưa tồn tại (schema chưa migrate), insert lại không có cột đó
    if (msg.includes("qty_boq")) {
      id = await insertId(
        `INSERT INTO materials (sheet_type_id, boq_code, name, unit, qty_planned, qty_used, status, note, sort_order)
         VALUES (?, ?, ?, ?, ?, 0, 'dat_hang', ?, ?)`,
        sheetTypeId, boqCode, name, body.unit ? String(body.unit).trim() : null,
        Number(body.qtyPlanned) || 0, body.note ? String(body.note) : null, sortOrder);
    } else {
      return NextResponse.json({ error: `Lỗi DB: ${msg}` }, { status: 500 });
    }
  }

  return NextResponse.json({ id }, { status: 201 });
}
