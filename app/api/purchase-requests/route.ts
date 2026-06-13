import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/purchase-requests?status=&materialId=
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  const materialId = req.nextUrl.searchParams.get("materialId");

  const wheres: string[] = [];
  const vals: unknown[] = [];
  if (status) { wheres.push(`pr.status = ?`); vals.push(status); }
  if (materialId) { wheres.push(`pr.material_id = ?`); vals.push(Number(materialId)); }
  const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const rows = await query(
    `SELECT pr.id, pr.pr_code AS "prCode", pr.material_id AS "materialId",
            m.name AS "materialName", m.unit AS "unit",
            pr.qty_requested AS "qtyRequested",
            pr.status, pr.note, pr.review_note AS "reviewNote",
            pr.requested_by AS "requestedBy", u1.name AS "requestedByName",
            pr.reviewed_by AS "reviewedBy", u2.name AS "reviewedByName",
            pr.reviewed_at AS "reviewedAt",
            pr.created_at AS "createdAt"
       FROM purchase_requests pr
       LEFT JOIN materials m ON pr.material_id = m.id
       LEFT JOIN users u1 ON pr.requested_by = u1.id
       LEFT JOIN users u2 ON pr.reviewed_by = u2.id
       ${where}
      ORDER BY pr.created_at DESC`,
    ...vals);
  return NextResponse.json({ requests: rows });
}

// POST /api/purchase-requests  body: { materialId, qtyRequested, note? }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const materialId = Number(body.materialId);
  const qtyRequested = Number(body.qtyRequested);
  if (!materialId || isNaN(materialId)) return NextResponse.json({ error: "Thiếu vật tư" }, { status: 400 });
  if (!qtyRequested || qtyRequested <= 0) return NextResponse.json({ error: "Số lượng không hợp lệ" }, { status: 400 });

  const mat = await queryOne(`SELECT id FROM materials WHERE id = ?`, materialId);
  if (!mat) return NextResponse.json({ error: "Vật tư không tồn tại" }, { status: 404 });

  // Sinh mã PR: PR-YYYYMM-NNN
  const ym = todayISO().slice(0, 7).replace("-", "");
  const last = await queryOne<{ pr_code: string }>(
    `SELECT pr_code FROM purchase_requests WHERE pr_code LIKE ? ORDER BY pr_code DESC LIMIT 1`,
    `PR-${ym}-%`);
  const seq = last ? parseInt(last.pr_code.split("-")[2]) + 1 : 1;
  const prCode = `PR-${ym}-${String(seq).padStart(3, "0")}`;

  const id = await insertId(
    `INSERT INTO purchase_requests (pr_code, material_id, qty_requested, note, requested_by)
     VALUES (?, ?, ?, ?, ?)`,
    prCode, materialId, qtyRequested,
    body.note ? String(body.note).trim() : null,
    user.id);
  return NextResponse.json({ id, prCode }, { status: 201 });
}
