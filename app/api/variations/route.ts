import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
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
import { openApproval } from "@/lib/approvals";

export const dynamic = "force-dynamic";

// GET /api/variations?status= — danh sách phát sinh/VO kèm dòng KL con + tổng giá
// trị đề xuất/được duyệt, scoped theo dự án đang chọn (M22). Ẩn với cdt/subcon/viewer
// (không thấy giá trị VO).
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

  const projectId = await getCurrentProjectId(user);
  const items = projectId != null ? await listVariations({ status, projectId }) : [];
  return NextResponse.json({ items });
}

// POST /api/variations — tạo VO mới (Nháp) kèm dòng KL con (Admin/PM/Kỹ sư — ghi
// nhận tại hiện trường). Mã VO-NNNN sinh tự động; mã dòng KL check trùng BOQCODE
// toàn hệ thống trước khi ghi (lib/boq.ts:boqTakenBy). Gán project_id = dự án đang
// chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.createVariation(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo phát sinh/VO (Admin/PM/Kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo phát sinh/VO" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 422 });

  const input = parseVoBody(body);
  const validationErr = validateVoInput(input);
  if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });

  if (input.systemId != null) {
    if (
      !Number.isInteger(input.systemId) ||
      !(await queryOne(`SELECT id FROM systems WHERE id = ?`, input.systemId))
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
          `INSERT INTO variation_orders (code, title, reason, description, system_id, created_by, project_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          code,
          input.title,
          input.reason,
          input.description,
          input.systemId,
          user.id,
          projectId,
        );
        for (const line of input.lines) {
          await insertId(
            `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, vo_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            line.code.trim(),
            line.name.trim(),
            line.unit.trim(),
            input.systemId,
            line.qty,
            line.unitPrice,
            id,
          );
        }
        // M46 PR2: mở approval request nếu có flow cấu hình cho 'variation' (PR4) —
        // không có flow thì openApproval trả null, không đổi hành vi hiện tại.
        const { amount } = (await queryOne<{ amount: number }>(
          `SELECT COALESCE(SUM(qty_contract * unit_price), 0) AS amount FROM boq_items WHERE vo_id = ?`,
          id,
        ))!;
        await openApproval({ entityType: "variation", entityId: id, projectId, amount, user });
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
