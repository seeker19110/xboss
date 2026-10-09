import { NextRequest, NextResponse } from "next/server";
import {
  MONEY_FORMAT_HEADER,
  isMoneyPrecisionError,
  moneyInputErrorBody,
  moneyWireFormat,
  parseMoneyExact,
} from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";
import { queryOne, insertId, withTransaction, withProjectScope } from "@/lib/db";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { isUniqueViolation, withUniqueRetry } from "@/lib/ha-tang/seqcode";
import {
  listVariations,
  variationsToWire,
  type VoRowMasked,
  parseVoBody,
  validateVoInput,
  checkVoLinesTaken,
  nextVoCode,
  VO_STATUSES,
  type VoStatus,
} from "@/lib/tai-chinh/vo";
import { resyncApprovalAmount } from "@/lib/tien-do/approvals";
import { stripSensitive } from "@/lib/bao-mat/sensitive-fields";

export const dynamic = "force-dynamic";

// GET /api/variations?status= — danh sách phát sinh/VO kèm dòng KL con + tổng giá
// trị đề xuất/được duyệt, scoped theo dự án đang chọn (M22). Ẩn với cdt/subcon/viewer
// (không thấy giá trị VO). S15 (A3-FR06): header `X-XBoss-Money-Format: decimal-string-v1` →
// proposedValue/approvedValue/lines[].unitPrice là chuỗi canonical 2 số lẻ, lines[].qty* chuỗi
// 3 số lẻ + `moneyFormat`; không header → JSON number legacy, ngoài biên → 422
// `money_precision_unsupported` (không xấp xỉ).
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
  const items =
    projectId != null
      ? await withProjectScope(projectId, () => listVariations({ status, projectId }))
      : [];
  // M50 PR2: che giá trị/đơn giá VO cho user thiếu viewPayments (vd engineer xem được
  // VO nhưng không thấy tiền) — che tại API TRƯỚC khi đổi wire (422 không lộ độ lớn).
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  const masked = stripSensitive<VoRowMasked>("variation", items, user);
  try {
    return NextResponse.json(
      { items: variationsToWire(masked, format), ...nhanDinhDangTien(format) },
      { headers: HEADERS_API_TIEN },
    );
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return NextResponse.json(LOI_TIEN_VUOT_DINH_DANG_CU, {
      status: 422,
      headers: HEADERS_API_TIEN,
    });
  }
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

  let input: ReturnType<typeof parseVoBody>;
  try {
    input = parseVoBody(body);
  } catch (e) {
    const loi = moneyInputErrorBody(e);
    if (!loi) throw e;
    return NextResponse.json(loi.body, { status: loi.status });
  }
  const validationErr = validateVoInput(input);
  if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });

  if (input.systemId != null) {
    if (
      !Number.isInteger(input.systemId) ||
      !(await queryOne(`SELECT id FROM systems WHERE id = ?`, input.systemId))
    )
      return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
  }

  const takenErr = await checkVoLinesTaken(input.lines, user.orgId);
  if (takenErr) return NextResponse.json({ error: takenErr }, { status: 409 });

  try {
    const { id, code } = await withUniqueRetry(() =>
      withTransaction(async () => {
        // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
        if (!(await kiemQuyenTaiLucGhi(() => CAN.createVariation(user.role))))
          throw Object.assign(new Error("Bạn không có quyền tạo phát sinh/VO (Admin/PM/Kỹ sư)"), {
            status: 403,
          });
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
        // không có flow thì không mở gì, không đổi hành vi hiện tại.
        // S13e: giá trị VO tính exact trong SQL (ROUND 2 như cột approval_requests.amount) rồi
        // đi qua MoneyMinor — trước đây SUM đọc ra float nên ngưỡng min_amount so trên số xấp xỉ,
        // lệch với amount lưu trong DB. resyncApprovalAmount với `openAs`: VO mới chưa có request
        // → mở qua openApproval khi có flow (ép number exact, tràn/không exact → 422), không flow
        // → no-op (không ép tiền, VO giá trị lớn vẫn lập được như cũ).
        const { amount } = (await queryOne<{ amount: string }>(
          `SELECT ROUND(COALESCE(SUM(qty_contract * unit_price), 0), 2)::text AS amount
             FROM boq_items WHERE vo_id = ?`,
          id,
        ))!;
        await resyncApprovalAmount({
          entityType: "variation",
          entityId: id,
          projectId,
          amountMinor: parseMoneyExact(amount),
          openAs: user,
        });
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
    // S13d: lỗi có chủ đích của engine duyệt (vd tổng VO tràn approval_requests.amount →
    // 422 amount_overflow) trả đúng mã thay vì 500; transaction đã rollback cả VO.
    const { status, code } = err as { status?: number; code?: string };
    if (status)
      return NextResponse.json(
        { error: (err as Error).message, ...(code ? { code } : {}) },
        { status },
      );
    throw err;
  }
}
