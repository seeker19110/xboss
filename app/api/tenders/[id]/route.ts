import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getTender, comparisonTable, TENDER_STATUSES, type TenderStatus } from "@/lib/tender";

export const dynamic = "force-dynamic";

// GET /api/tenders/:id — chi tiết gói thầu + bảng so sánh giá theo dòng BOQ × NCC.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewTenders(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem đấu thầu" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const tender = await getTender(id);
  if (!tender) return NextResponse.json({ error: "Không tìm thấy gói thầu" }, { status: 404 });

  const { items, bids } = await comparisonTable(id);
  return NextResponse.json({ tender, items, bids });
}

// PATCH /api/tenders/:id — sửa thông tin chung/chuyển trạng thái (draft→open→closed,
// hoặc cancelled). Không sửa được sau khi đã trao thầu (awarded). Admin/PM.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTenders(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa gói thầu (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const existing = await queryOne<{
    status: TenderStatus;
    name: string;
    scope: string | null;
    dueDate: string | null;
  }>(`SELECT status, name, scope, due_date AS "dueDate" FROM tender_packages WHERE id = ?`, id);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy gói thầu" }, { status: 404 });
  if (existing.status === "awarded")
    return NextResponse.json({ error: "Gói thầu đã trao thầu — không thể sửa" }, { status: 409 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : existing.name;
  const scope =
    "scope" in body
      ? typeof body.scope === "string" && body.scope.trim()
        ? body.scope.trim()
        : null
      : existing.scope;
  const dueDate =
    "dueDate" in body
      ? typeof body.dueDate === "string" && body.dueDate.trim()
        ? body.dueDate.trim()
        : null
      : existing.dueDate;
  const status: TenderStatus = TENDER_STATUSES.includes(body.status)
    ? body.status
    : existing.status;

  if (!name) return NextResponse.json({ error: "Thiếu tên gói thầu" }, { status: 422 });

  await run(
    `UPDATE tender_packages SET name = ?, scope = ?, due_date = ?, status = ? WHERE id = ?`,
    name,
    scope,
    dueDate,
    status,
    id,
  );
  return NextResponse.json({ updated: id });
}
