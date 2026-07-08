import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, todayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { nextSeqCode, withUniqueRetry } from "@/lib/seqcode";

export const dynamic = "force-dynamic";

// GET /api/purchase-requests?status=&materialId= — scoped theo dự án đang chọn (M22).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  const materialId = req.nextUrl.searchParams.get("materialId");

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ requests: [] });

  const wheres: string[] = [`pr.project_id = ?`];
  const vals: unknown[] = [projectId];
  if (status) {
    wheres.push(`pr.status = ?`);
    vals.push(status);
  }
  if (materialId) {
    wheres.push(`pr.material_id = ?`);
    vals.push(Number(materialId));
  }
  const where = `WHERE ${wheres.join(" AND ")}`;

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
    ...vals,
  );
  return NextResponse.json({ requests: rows });
}

// POST /api/purchase-requests  body: { materialId, qtyRequested, note? }
// project_id gán = dự án đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  // Vai trò chỉ-xem (BCH/CĐT/Viewer) không được tạo yêu cầu mua vật tư.
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền tạo yêu cầu mua vật tư" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Chưa có dự án nào để tạo yêu cầu mua vật tư" },
      { status: 422 },
    );

  const body = await req.json().catch(() => ({}));
  const materialId = Number(body.materialId);
  const qtyRequested = Number(body.qtyRequested);
  if (!materialId || isNaN(materialId))
    return NextResponse.json({ error: "Thiếu vật tư" }, { status: 400 });
  if (!qtyRequested || qtyRequested <= 0)
    return NextResponse.json({ error: "Số lượng không hợp lệ" }, { status: 400 });

  const mat = await queryOne(`SELECT id FROM materials WHERE id = ?`, materialId);
  if (!mat) return NextResponse.json({ error: "Vật tư không tồn tại" }, { status: 404 });

  // Sinh mã PR: PR-YYYYMM-NNN — retry nếu đụng mã do tạo đồng thời.
  const ym = todayISO().slice(0, 7).replace("-", "");
  const { id, prCode } = await withUniqueRetry(async () => {
    const prCode = await nextSeqCode("purchase_requests", "pr_code", `PR-${ym}-`);
    const id = await insertId(
      `INSERT INTO purchase_requests (pr_code, material_id, qty_requested, note, requested_by, project_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      prCode,
      materialId,
      qtyRequested,
      body.note ? String(body.note).trim() : null,
      user.id,
      projectId,
    );
    return { id, prCode };
  });
  return NextResponse.json({ id, prCode }, { status: 201 });
}
