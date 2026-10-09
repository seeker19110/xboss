import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { gioiHanGhiTaiChinh } from "@/lib/bao-mat/ratelimit";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";
import { withProjectScope } from "@/lib/db";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import { danhDauDaChi, docDanhDauChi, type KetQuaDanhDauChi } from "@/lib/tai-chinh/payment-bills";

export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };
const LOI_QUYEN = "Chỉ Admin/PM được đánh dấu đã chi";

// POST /api/payments/bills/:id/pay — M129: đánh dấu phiếu đã duyệt (committed) là ĐÃ CHI.
// body: { paidAt: 'YYYY-MM-DD', paidRef?: string, paidNote?: string }
// 200 { id, payStatus: 'paid', paidAt, paidBy, paidRef, paidNote }
// 403 quyền (CAN.approve) | 403 { code: 'sod_same_actor' } người chi = người duyệt IPC gốc
// 404 phiếu ngoài dự án đang chọn | 409 { code: 'already_paid' | 'bill_void' }
// 422 { code: 'paid_at_invalid' } ngày sai dạng / sau hôm nay / trước ngày duyệt IPC.
// Idempotent: khoá dòng phiếu + UPDATE điều kiện pay_status='committed' trong một transaction —
// lặp/đồng thời chỉ một lần chuyển, các lần sau 409 already_paid. Vết kiểm toán: trigger
// audit_payment_bills (0166). Logic nghiệp vụ ở lib/tai-chinh/payment-bills.ts (ADR-0008).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const gioiHan = await gioiHanGhiTaiChinh("phieu-chi", user.id);
  if (gioiHan)
    return NextResponse.json(
      { error: gioiHan.error },
      { status: 429, headers: { "Retry-After": gioiHan.retryAfter } },
    );
  if (!CAN.approve(user.role)) return NextResponse.json({ error: LOI_QUYEN }, { status: 403 });

  const id = parseInt(idStr, 10);
  if (!Number.isSafeInteger(id) || id <= 0)
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const input = docDanhDauChi(await req.json().catch(() => null));
  if ("error" in input) return NextResponse.json(input, { status: input.code ? 422 : 400 });

  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Không tìm thấy phiếu thanh toán" },
      { status: 404, headers: PRIVATE_NO_STORE },
    );

  const kq = await withProjectScope(
    projectId,
    async (): Promise<KetQuaDanhDauChi> => {
      // D01: tái kiểm quyền với dữ liệu có hiệu lực, trong transaction ghi, trước mọi lần ghi.
      if (!(await kiemQuyenTaiLucGhi(() => CAN.approve(user.role))))
        return { ok: false, status: 403, error: LOI_QUYEN };
      return danhDauDaChi(input, { billId: id, projectId, orgId: user.orgId, userId: user.id });
    },
    { readOnly: false },
  );
  if (!kq.ok)
    return NextResponse.json(
      { error: kq.error, ...(kq.code ? { code: kq.code } : {}) },
      { status: kq.status, headers: PRIVATE_NO_STORE },
    );
  return NextResponse.json(kq.bill, { headers: PRIVATE_NO_STORE });
}
