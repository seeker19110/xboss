import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  getCert,
  certTotals,
  validateCertItems,
  checkCertLinesBelongToContract,
  saveCertItems,
  type CertLineInput,
} from "@/lib/paymentcerts";
import { getEntityApprovalStatus } from "@/lib/approvals";
import { stripSensitive } from "@/lib/sensitive-fields";

export const dynamic = "force-dynamic";

// Xác nhận đợt thuộc hợp đồng của dự án đang chọn (M22) — chặn xem/sửa đợt của
// hợp đồng thuộc dự án khác qua đoán/liệt kê id.
async function certInProject(
  id: number,
  projectId: number | null,
): Promise<{ status: string; contractId: number } | undefined> {
  if (projectId == null) return undefined;
  return queryOne<{ status: string; contractId: number }>(
    `SELECT c.status, c.contract_id AS "contractId"
       FROM payment_certs c JOIN contracts ct ON ct.id = c.contract_id
      WHERE c.id = ? AND ct.project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/payment-certs/:id — chi tiết đợt kèm dòng KL + tổng hợp giá trị,
// scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem đợt thanh toán" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const scoped = await certInProject(id, projectId);
  if (!scoped)
    return NextResponse.json({ error: "Không tìm thấy đợt thanh toán" }, { status: 404 });

  const cert = await getCert(id);
  if (!cert) return NextResponse.json({ error: "Không tìm thấy đợt thanh toán" }, { status: 404 });

  const totals = await certTotals(id);
  // Trạng thái duyệt engine (M46 PR2) — null khi chưa có flow cấu hình cho loại
  // "payment_cert" (hành xử dormant, không đổi UI cũ).
  const approvalStatus = await getEntityApprovalStatus("payment_cert", id);
  // M50 PR2: che đơn giá dòng KL + tổng tiền đợt cho user thiếu viewPayments (phòng thủ
  // — gate route hiện cũng là viewPayments).
  const [maskedCert] = stripSensitive("paymentCert", [cert], user);
  const [maskedTotals] = stripSensitive("certTotals", [totals], user);
  return NextResponse.json({ cert: maskedCert, totals: maskedTotals, approvalStatus });
}

// PATCH /api/payment-certs/:id { items: [{boqItemId, qtyPeriod}], periodLabel? }
// — sửa KL từng dòng (chỉ khi đợt còn nháp, Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa đợt thanh toán (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await certInProject(id, projectId);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  if (existing.status !== "draft")
    return NextResponse.json({ error: "Chỉ sửa được đợt đang ở trạng thái nháp" }, { status: 409 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  if (Array.isArray(body.items)) {
    const items: CertLineInput[] = body.items.map((it: Record<string, unknown>) => ({
      boqItemId: Number(it?.boqItemId),
      qtyPeriod: Number(it?.qtyPeriod),
    }));
    const validationErr = validateCertItems(items);
    if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });
    const refErr = await checkCertLinesBelongToContract(
      existing.contractId,
      items.map((i) => i.boqItemId),
    );
    if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

    await saveCertItems(id, existing.contractId, items);
  }
  if (typeof body.periodLabel === "string" || body.periodLabel === null) {
    await run(
      `UPDATE payment_certs SET period_label = ? WHERE id = ?`,
      typeof body.periodLabel === "string" ? body.periodLabel.trim() || null : null,
      id,
    );
  }

  return NextResponse.json({ updated: id });
}
