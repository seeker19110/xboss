import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { isUniqueViolation, withUniqueRetry } from "@/lib/seqcode";
import {
  listVariations,
  parseVoBody,
  validateVoInput,
  checkVoLinesTaken,
  nextVoCode,
  VO_STATUSES,
  type VoStatus,
} from "@/lib/vo";

export const dynamic = "force-dynamic";

// GET /api/variations?status= — danh sách phát sinh/VO kèm dòng KL con + tổng giá
// trị đề xuất/được duyệt. Ẩn với cdt/subcon/viewer (không thấy giá trị VO).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewVariations(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem phát sinh/VO" }, { status: 403 });

  const statusParam = req.nextUrl.searchParams.get("status");
  const status =
    statusParam && (VO_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as VoStatus)
      : undefined;

  const items = await listVariations(status ? { status } : undefined);
  return NextResponse.json({ items });
}

// POST /api/variations — tạo VO mới (Nháp) kèm dòng KL con (Admin/PM/Kỹ sư — ghi
// nhận tại hiện trường). Mã VO-NNNN sinh tự động; mã dòng KL check trùng BOQCODE
// toàn hệ thống trước khi ghi (lib/boq.ts:boqTakenBy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.createVariation(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo phát sinh/VO (Admin/PM/Kỹ sư)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 422 });

  const input = parseVoBody(body);
  const validationErr = validateVoInput(input);
  if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });

  if (input.disciplineId != null) {
    if (
      !Number.isInteger(input.disciplineId) ||
      !(await queryOne(`SELECT id FROM disciplines WHERE id = ?`, input.disciplineId))
    )
      return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
  }

  const takenErr = await checkVoLinesTaken(input.lines);
  if (takenErr) return NextResponse.json({ error: takenErr }, { status: 409 });

  try {
    const { id, code } = await withUniqueRetry(() =>
      withTransaction(async () => {
        const code = await nextVoCode();
        const id = await insertId(
          `INSERT INTO variation_orders (code, title, reason, description, discipline_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          code,
          input.title,
          input.reason,
          input.description,
          input.disciplineId,
          user.id,
        );
        for (const line of input.lines) {
          await insertId(
            `INSERT INTO boq_items (code, name, unit, discipline_id, qty_contract, unit_price, vo_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            line.code.trim(),
            line.name.trim(),
            line.unit.trim(),
            input.disciplineId,
            line.qty,
            line.unitPrice,
            id,
          );
        }
        return { id, code };
      }),
    );
    return NextResponse.json({ id, code }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err))
      return NextResponse.json(
        { error: "Mã dòng KL hoặc mã VO bị trùng do tạo đồng thời — vui lòng thử lại" },
        { status: 409 },
      );
    throw err;
  }
}
