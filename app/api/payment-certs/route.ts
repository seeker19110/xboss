import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, withTransaction, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { isUniqueViolation, withUniqueRetry } from "@/lib/ha-tang/seqcode";
import {
  listCertsByContract,
  nextCertCode,
  nextPeriodNo,
  suggestQtyForContract,
  saveCertItems,
  certTotals,
} from "@/lib/tai-chinh/paymentcerts";
import { openApproval } from "@/lib/tien-do/approvals";
import { stripSensitive } from "@/lib/bao-mat/sensitive-fields";

export const dynamic = "force-dynamic";

// GET /api/payment-certs?contractId= — danh sách đợt IPC theo hợp đồng, scoped
// theo dự án đang chọn (M22) — chặn xem đợt của hợp đồng thuộc dự án khác.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem đợt thanh toán" }, { status: 403 });

  const contractId = Number(req.nextUrl.searchParams.get("contractId"));
  if (!Number.isInteger(contractId))
    return NextResponse.json({ error: "Thiếu contractId" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const certs =
    projectId != null
      ? await withProjectScope(projectId, async () => {
          const contract = await queryOne<{ id: number }>(
            `SELECT id FROM contracts WHERE id = ? AND project_id = ?`,
            contractId,
            projectId,
          );
          if (!contract) return null;
          return listCertsByContract(contractId);
        })
      : null;
  if (!certs) return NextResponse.json({ error: "Hợp đồng không tồn tại" }, { status: 422 });
  // M50 PR2: che đơn giá dòng KL cho user thiếu viewPayments (phòng thủ — gate route
  // hiện cũng là viewPayments).
  return NextResponse.json({ certs: stripSensitive("paymentCert", certs, user) });
}

// POST /api/payment-certs { contractId } — lập đợt mới (Admin/PM), KL gợi ý tự
// động từ tiến độ thực tế trừ luỹ kế đợt trước (suggestQtyForContract).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
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
        await openApproval({
          entityType: "payment_cert",
          entityId: id,
          projectId: pid,
          amount: periodValue,
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
    const status = (err as { status?: number }).status;
    if (status) return NextResponse.json({ error: (err as Error).message }, { status });
    throw err;
  }
}
