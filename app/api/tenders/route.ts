import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, insertId, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { withUniqueRetry, isUniqueViolation } from "@/lib/seqcode";
import {
  listTenders,
  nextTenderCode,
  validateTenderInput,
  type TenderItemInput,
} from "@/lib/tender";

export const dynamic = "force-dynamic";

// GET /api/tenders — danh sách gói thầu (Admin/PM/Kỹ sư/BCH).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewTenders(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem đấu thầu" }, { status: 403 });

  const tenders = await listTenders();
  return NextResponse.json({ tenders });
}

// POST /api/tenders — tạo gói thầu mới kèm dòng BOQ trong phạm vi mời thầu (Admin/PM).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTenders(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo gói thầu (chỉ Admin/PM)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 422 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const scope = typeof body.scope === "string" && body.scope.trim() ? body.scope.trim() : null;
  const dueDate =
    typeof body.dueDate === "string" && body.dueDate.trim() ? body.dueDate.trim() : null;
  const items: TenderItemInput[] = Array.isArray(body.items)
    ? body.items.map((it: Record<string, unknown>) => ({
        boqItemId: Number(it?.boqItemId),
        qty: Number(it?.qty),
      }))
    : [];

  const validationErr = validateTenderInput({ name, items });
  if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });

  for (const it of items) {
    const exists = await queryOne(`SELECT id FROM boq_items WHERE id = ?`, it.boqItemId);
    if (!exists)
      return NextResponse.json(
        { error: `Dòng BOQ #${it.boqItemId} không tồn tại` },
        { status: 422 },
      );
  }

  try {
    const { id, code } = await withUniqueRetry(() =>
      withTransaction(async () => {
        const code = await nextTenderCode();
        const id = await insertId(
          `INSERT INTO tender_packages (code, name, scope, due_date, created_by) VALUES (?, ?, ?, ?, ?)`,
          code,
          name,
          scope,
          dueDate,
          user.id,
        );
        for (const it of items) {
          await run(
            `INSERT INTO tender_items (tender_id, boq_item_id, qty) VALUES (?, ?, ?)`,
            id,
            it.boqItemId,
            it.qty,
          );
        }
        return { id, code };
      }),
    );
    return NextResponse.json({ id, code }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err))
      return NextResponse.json(
        { error: "Mã gói thầu bị trùng do tạo đồng thời — vui lòng thử lại" },
        { status: 409 },
      );
    throw err;
  }
}
