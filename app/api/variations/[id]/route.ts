import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { VO_REASONS, type VoReason, getVariation, canEditVo } from "@/lib/vo";

export const dynamic = "force-dynamic";

// GET /api/variations/:id — chi tiết VO kèm dòng KL + file đính kèm, scoped theo
// dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewVariations(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem phát sinh/VO" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const variation = projectId != null ? await getVariation(id, projectId) : undefined;
  if (!variation) return NextResponse.json({ error: "Không tìm thấy phát sinh" }, { status: 404 });

  const documents = await query(
    `SELECT d.id, d.original_name AS "originalName", d.mime_type AS "mimeType",
            d.size_bytes AS "sizeBytes", d.caption, d.created_at AS "createdAt",
            d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM vo_documents d LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.vo_id = ? ORDER BY d.id DESC`,
    id,
  );

  return NextResponse.json({ variation, documents });
}

// PATCH /api/variations/:id — sửa thông tin chung (tên/lý do/mô tả/hệ). Không sửa
// dòng KL con qua route này (tạo lại VO nếu cần đổi khối lượng/đơn giá đề xuất).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewVariations(user.role))
    return NextResponse.json({ error: "Bạn không có quyền sửa phát sinh/VO" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing =
    projectId != null
      ? await queryOne<{
          status: string;
          createdBy: number | null;
          title: string;
          reason: VoReason;
          description: string | null;
          systemId: number | null;
        }>(
          `SELECT status, created_by AS "createdBy", title, reason, description,
                  system_id AS "systemId"
             FROM variation_orders WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy phát sinh" }, { status: 404 });

  const editErr = canEditVo(existing, user);
  if (editErr) return NextResponse.json({ error: editErr }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const title = typeof body.title === "string" ? body.title.trim() : existing.title;
  const reason = typeof body.reason === "string" ? (body.reason as VoReason) : existing.reason;
  const description =
    "description" in body
      ? typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null
      : existing.description;
  const systemId =
    "systemId" in body ? (body.systemId != null ? Number(body.systemId) : null) : existing.systemId;

  if (!title) return NextResponse.json({ error: "Thiếu tên phát sinh" }, { status: 422 });
  if (!VO_REASONS.includes(reason))
    return NextResponse.json({ error: "Lý do phát sinh không hợp lệ" }, { status: 422 });
  if (systemId != null) {
    if (
      !Number.isInteger(systemId) ||
      !(await queryOne(`SELECT id FROM systems WHERE id = ?`, systemId))
    )
      return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
  }

  await run(
    `UPDATE variation_orders SET title = ?, reason = ?, description = ?, system_id = ? WHERE id = ?`,
    title,
    reason,
    description,
    systemId,
    id,
  );
  // Đồng bộ hệ xuống mọi dòng KL con (VO đại diện 1 hệ duy nhất).
  if (systemId !== existing.systemId)
    await run(`UPDATE boq_items SET system_id = ? WHERE vo_id = ?`, systemId, id);

  return NextResponse.json({ updated: id });
}
