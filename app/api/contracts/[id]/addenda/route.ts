import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/contracts/:id/addenda — thêm phụ lục (Admin/PM). Giá trị âm được
// (phụ lục giảm giá trị HĐ). UNIQUE(contract_id, code) chống trùng số phụ lục.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền thêm phụ lục (chỉ Admin/PM)" },
      { status: 403 },
    );

  const contractId = parseInt(params.id);
  if (isNaN(contractId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const contract = await queryOne<{ id: number }>(
    `SELECT id FROM contracts WHERE id = ?`,
    contractId,
  );
  if (!contract) return NextResponse.json({ error: "Không tìm thấy hợp đồng" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ error: "Thiếu số phụ lục" }, { status: 422 });
  const valueDelta = body?.valueDelta != null ? Number(body.valueDelta) : 0;
  if (!Number.isFinite(valueDelta))
    return NextResponse.json({ error: "Giá trị phụ lục không hợp lệ" }, { status: 422 });
  const signedDate =
    typeof body?.signedDate === "string" && body.signedDate.trim() ? body.signedDate.trim() : null;
  if (signedDate && !DATE_RE.test(signedDate))
    return NextResponse.json({ error: "Ngày ký không đúng định dạng YYYY-MM-DD" }, { status: 422 });
  const title = typeof body?.title === "string" ? body.title.trim() || null : null;
  const note = typeof body?.note === "string" ? body.note.trim() || null : null;

  let id: number;
  try {
    id = await insertId(
      `INSERT INTO contract_addenda (contract_id, code, title, value_delta, signed_date, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      contractId,
      code,
      title,
      valueDelta,
      signedDate,
      note,
      user.id,
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: `Phụ lục "${code}" đã tồn tại trong hợp đồng này` },
        { status: 409 },
      );
    throw err;
  }

  return NextResponse.json({ id }, { status: 201 });
}
