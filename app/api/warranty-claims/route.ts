import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { todayISO } from "@/lib/date";
import {
  WARRANTY_CLAIM_SEVERITIES,
  WARRANTY_CLAIM_STATUSES,
  listClaims,
  parseClaimBody,
  validateClaimInput,
  type WarrantyClaimSeverity,
  type WarrantyClaimStatus,
} from "@/lib/warranty";

export const dynamic = "force-dynamic";

// GET /api/warranty-claims?status=&severity=&assignee= — claim lỗi sau bàn giao, scoped
// theo dự án đang chọn (M22). Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status")?.trim() || undefined;
  if (status && !WARRANTY_CLAIM_STATUSES.includes(status as WarrantyClaimStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });
  const severity = sp.get("severity")?.trim() || undefined;
  if (severity && !WARRANTY_CLAIM_SEVERITIES.includes(severity as WarrantyClaimSeverity))
    return NextResponse.json({ error: "Mức độ không hợp lệ" }, { status: 422 });
  const assigneeRaw = sp.get("assignee");
  const assignee = assigneeRaw ? Number(assigneeRaw) : undefined;

  const projectId = await getCurrentProjectId(user);
  const items =
    projectId != null
      ? await listClaims(projectId, {
          status: status as WarrantyClaimStatus | undefined,
          severity: severity as WarrantyClaimSeverity | undefined,
          assignee,
        })
      : [];
  return NextResponse.json({ items });
}

// POST /api/warranty-claims — tạo claim lỗi sau bàn giao (manageWarranty: Admin/PM/kỹ
// sư). Gán project_id = dự án đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWarranty(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo claim bảo hành (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo claim bảo hành" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseClaimBody(body);
  const invalid = validateClaimInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.warrantyItemId != null) {
    const wi = await queryOne(
      `SELECT id FROM warranty_items WHERE id = ? AND project_id = ?`,
      input.warrantyItemId,
      projectId,
    );
    if (!wi)
      return NextResponse.json({ error: "Hạng mục bảo hành không tồn tại" }, { status: 422 });
  }
  if (input.assignee != null) {
    if (!(await queryOne(`SELECT id FROM users WHERE id = ?`, input.assignee)))
      return NextResponse.json({ error: "Người được gán không tồn tại" }, { status: 422 });
  }

  const id = await insertId(
    `INSERT INTO warranty_claims (project_id, warranty_item_id, code, reported_date,
       description, severity, status, due_date, resolution, closed_date, assignee, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.warrantyItemId,
    input.code,
    input.reportedDate,
    input.description,
    input.severity,
    input.status,
    input.dueDate,
    input.resolution,
    input.status === "closed" ? (input.closedDate ?? todayISO()) : input.closedDate,
    input.assignee,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
