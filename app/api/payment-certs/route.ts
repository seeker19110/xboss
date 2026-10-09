import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, withTransaction, withProjectScope } from "@/lib/db";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { gioiHanGhiTaiChinh } from "@/lib/bao-mat/ratelimit";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { isUniqueViolation, withUniqueRetry } from "@/lib/ha-tang/seqcode";
import {
  listCertsByContract,
  nextCertCode,
  nextPeriodNo,
  suggestQtyForContract,
  saveCertItems,
  certTotals,
  certItemsExactByContract,
  certItemsToWire,
} from "@/lib/tai-chinh/paymentcerts";
import { openApproval } from "@/lib/tien-do/approvals";
import { stripSensitive } from "@/lib/bao-mat/sensitive-fields";
import {
  moneyToNumberSafe,
  isMoneyPrecisionError,
  moneyWireFormat,
  MONEY_FORMAT_HEADER,
} from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";

export const dynamic = "force-dynamic";

// GET /api/payment-certs?contractId= — danh sách đợt IPC theo hợp đồng, scoped
// theo dự án đang chọn (M22) — chặn xem đợt của hợp đồng thuộc dự án khác.
// S13d (A3-FR06): header `X-XBoss-Money-Format: decimal-string-v1` → `certs[].items[].unitPrice/
// qtyPeriod/qtyCumulative/boqQtyContract` là chuỗi canonical (đọc `::text` trong SQL, không qua số
// float của json_agg) + `moneyFormat`; không gửi → JSON number legacy, giá trị không round-trip
// được → 422 `money_precision_unsupported`. Đợt + dòng exact đọc trong MỘT snapshot REPEATABLE
// READ (PATCH chen giữa không làm lệch hai nguồn). Che đơn giá TRƯỚC khi đổi wire.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem đợt thanh toán" }, { status: 403 });

  const contractId = Number(req.nextUrl.searchParams.get("contractId"));
  if (!Number.isInteger(contractId))
    return NextResponse.json({ error: "Thiếu contractId" }, { status: 422 });

  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));

  const projectId = await getCurrentProjectId(user);
  const data =
    projectId != null
      ? await withProjectScope(
          projectId,
          async () => {
            const contract = await queryOne<{ id: number }>(
              `SELECT id FROM contracts WHERE id = ? AND project_id = ?`,
              contractId,
              projectId,
            );
            if (!contract) return null;
            const certs = await listCertsByContract(contractId);
            return { certs, exact: await certItemsExactByContract(contractId) };
          },
          { isolation: "repeatable_read" },
        )
      : null;
  if (!data)
    return NextResponse.json(
      { error: "Hợp đồng không tồn tại" },
      { status: 422, headers: HEADERS_API_TIEN },
    );
  // M50 PR2: che đơn giá dòng KL cho user thiếu viewPayments (phòng thủ — gate route
  // hiện cũng là viewPayments).
  const masked = stripSensitive("paymentCert", data.certs, user);
  let certs;
  try {
    certs = masked.map((c) => ({
      ...c,
      items: certItemsToWire(c.items, data.exact.get(c.id) ?? [], format),
    }));
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return NextResponse.json(LOI_TIEN_VUOT_DINH_DANG_CU, {
      status: 422,
      headers: HEADERS_API_TIEN,
    });
  }
  // API tài chính: không cache ở tầng nào + Vary theo header định dạng tiền.
  return NextResponse.json({ certs, ...nhanDinhDangTien(format) }, { headers: HEADERS_API_TIEN });
}

// POST /api/payment-certs { contractId } — lập đợt mới (Admin/PM), KL gợi ý tự
// động từ tiến độ thực tế trừ luỹ kế đợt trước (suggestQtyForContract).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const gioiHan = await gioiHanGhiTaiChinh("ipc-lap", user.id);
  if (gioiHan)
    return NextResponse.json(
      { error: gioiHan.error },
      { status: 429, headers: { "Retry-After": gioiHan.retryAfter } },
    );
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền lập đợt thanh toán (chỉ Admin/PM)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  const contractId = Number(body?.contractId);
  if (!Number.isInteger(contractId))
    return NextResponse.json({ error: "Thiếu hợp đồng" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const contract =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM contracts WHERE id = ? AND project_id = ?`,
          contractId,
          projectId,
        )
      : undefined;
  if (!contract) return NextResponse.json({ error: "Hợp đồng không tồn tại" }, { status: 422 });
  // contract chỉ tìm được khi projectId != null (điều kiện ternary phía trên) — ép kiểu
  // để dùng làm tham số bắt buộc `number` của openApproval bên dưới.
  const pid = projectId as number;

  const periodLabel =
    typeof body?.periodLabel === "string" ? body.periodLabel.trim() || null : null;

  try {
    const { id, code } = await withUniqueRetry(() =>
      withTransaction(async () => {
        // Đợt IPC phải TUẦN TỰ: KL gợi ý + luỹ kế của đợt mới tính từ đợt ĐÃ DUYỆT gần nhất
        // (suggestQtyForContract/saveCertItems). Còn đợt nháp/đã trình chưa quyết định mà lập
        // tiếp thì đợt mới không trừ KL của đợt đó → duyệt cả hai là trả TRÙNG tiền (P1 duyệt
        // 30, P2 trình 20, P3 gợi ý 60−30 = 30 thay vì 10: tổng 80 > 60 đã thi công). Quyết
        // định chủ dự án 2026-10-01: chặn, duyệt/từ chối đợt trước rồi mới lập đợt sau. Khoá
        // dòng hợp đồng để 2 lần lập đồng thời không cùng vượt qua kiểm tra này.
        await queryOne(`SELECT id FROM contracts WHERE id = ? FOR UPDATE`, contractId);
        // D01: quyền kiểm đầu route dùng snapshot lúc xác thực — tái kiểm với dữ liệu có hiệu lực
        // dưới khoá hợp đồng/đợt, trước mọi lần ghi.
        if (!(await kiemQuyenTaiLucGhi(() => CAN.manageContracts(user.role))))
          throw Object.assign(new Error("Bạn không có quyền lập đợt thanh toán (chỉ Admin/PM)"), {
            status: 403,
          });
        const dangCho = await queryOne<{ code: string; status: string }>(
          `SELECT code, status FROM payment_certs
            WHERE contract_id = ? AND status IN ('draft', 'submitted')
            ORDER BY period_no LIMIT 1`,
          contractId,
        );
        if (dangCho)
          throw Object.assign(
            new Error(
              `Đợt ${dangCho.code} đang ${dangCho.status === "draft" ? "nháp" : "chờ duyệt"} — ` +
                "duyệt hoặc từ chối đợt đó trước khi lập đợt mới (tránh trả trùng khối lượng)",
            ),
            { status: 409 },
          );

        const suggested = await suggestQtyForContract(contractId);
        if (suggested.length === 0)
          throw Object.assign(
            new Error("Hợp đồng chưa có dòng BOQ nào gắn vào — gán BOQ vào hợp đồng trước"),
            { status: 422 },
          );

        const periodNo = await nextPeriodNo(contractId);
        const code = await nextCertCode();
        const id = await insertId(
          `INSERT INTO payment_certs (code, contract_id, period_no, period_label, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          code,
          contractId,
          periodNo,
          periodLabel,
          user.id,
        );
        await saveCertItems(
          id,
          contractId,
          suggested.map((s) => ({ boqItemId: s.boqItemId, qtyPeriod: s.qtySuggested })),
        );
        // M46 PR2: mở approval request nếu có flow cấu hình cho 'payment_cert' (PR4) —
        // không có flow thì openApproval trả null, không đổi hành vi hiện tại.
        const { periodValue } = await certTotals(id);
        // openApproval nhận number (ngưỡng min_amount của flow): chỉ đổi khi round-trip exact,
        // ngoài biên → 422 money_precision_unsupported (rollback cả đợt), không xấp xỉ. Có flow mà
        // giá trị tràn approval_requests.amount NUMERIC(15,2) → openApproval ném 422
        // amount_overflow (S13d; trước đây lỗi pg 22003 thành 500).
        let amount: number;
        try {
          amount = moneyToNumberSafe(periodValue);
        } catch (err) {
          if (!isMoneyPrecisionError(err)) throw err;
          throw Object.assign(
            new Error("Giá trị đợt vượt độ chính xác hỗ trợ của luồng phê duyệt"),
            { status: 422, code: "money_precision_unsupported" },
          );
        }
        await openApproval({
          entityType: "payment_cert",
          entityId: id,
          projectId: pid,
          amount,
          user,
        });
        return { id, code };
      }),
    );
    return NextResponse.json({ id, code }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err))
      return NextResponse.json(
        { error: "Mã đợt hoặc số đợt bị trùng do tạo đồng thời — vui lòng thử lại" },
        { status: 409 },
      );
    const { status, code } = err as { status?: number; code?: string };
    if (status)
      return NextResponse.json(
        { error: (err as Error).message, ...(code ? { code } : {}) },
        { status },
      );
    throw err;
  }
}
