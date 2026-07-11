import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  WARRANTY_ITEM_STATUSES,
  listWarrantyItems,
  parseWarrantyItemBody,
  validateWarrantyInput,
  type WarrantyItemStatus,
} from "@/lib/warranty";

export const dynamic = "force-dynamic";

// GET /api/warranty-items?status= — danh mục hạng mục bảo hành, scoped theo dự án đang
// chọn (M22). Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const statusRaw = req.nextUrl.searchParams.get("status")?.trim() || null;
  if (statusRaw && !WARRANTY_ITEM_STATUSES.includes(statusRaw as WarrantyItemStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const items =
    projectId != null
      ? await listWarrantyItems(projectId, {
          status: (statusRaw as WarrantyItemStatus) ?? undefined,
        })
      : [];
  return NextResponse.json({ items });
}

// POST /api/warranty-items — tạo hạng mục bảo hành (manageWarranty: Admin/PM/kỹ sư).
// Gán project_id = dự án đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWarranty(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo hạng mục bảo hành (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Chưa có dự án nào để tạo hạng mục bảo hành" },
      { status: 422 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseWarrantyItemBody(body);
  const invalid = validateWarrantyInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.tradeId != null) {
    if (!(await queryOne(`SELECT id FROM systems WHERE id = ?`, input.tradeId)))
      return NextResponse.json({ error: "Hệ không tồn tại" }, { status: 422 });
  }
  if (input.handoverItemId != null) {
    const hi = await queryOne(
      `SELECT id FROM handover_items WHERE id = ? AND project_id = ?`,
      input.handoverItemId,
      projectId,
    );
    if (!hi)
      return NextResponse.json({ error: "Hạng mục bàn giao không tồn tại" }, { status: 422 });
  }
  if (input.guaranteeId != null) {
    const ib = await queryOne(
      `SELECT id FROM insurance_bonds WHERE id = ? AND project_id = ? AND kind = 'bao_lanh_bao_hanh'`,
      input.guaranteeId,
      projectId,
    );
    if (!ib)
      return NextResponse.json(
        { error: "Bảo lãnh bảo hành không tồn tại hoặc không đúng loại" },
        { status: 422 },
      );
  }

  const id = await insertId(
    `INSERT INTO warranty_items (project_id, title, system_id, handover_item_id,
       warranty_from, warranty_months, guarantee_id, status, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.title,
    input.tradeId,
    input.handoverItemId,
    input.warrantyFrom,
    input.warrantyMonths,
    input.guaranteeId,
    input.status,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
