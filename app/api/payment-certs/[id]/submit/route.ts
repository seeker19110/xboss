import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, isAdminOrPm } from "@/lib/auth";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

// POST /api/payment-certs/:id/submit — trình đợt lên CĐT/TVGS (nháp → đã trình). Admin/PM.
export async function POST(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được trình đợt thanh toán" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  try {
    await withTransaction(async () => {
      const cert = await queryOne<{ status: string }>(
        `SELECT status FROM payment_certs WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!cert) throw Object.assign(new Error("Không tìm thấy đợt thanh toán"), { status: 404 });
      if (cert.status !== "draft")
        throw Object.assign(new Error("Chỉ trình được đợt đang ở trạng thái nháp"), {
          status: 409,
        });
      await run(
        `UPDATE payment_certs SET status = 'submitted', submitted_at = ? WHERE id = ?`,
        todayISO(),
        id,
      );
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  return NextResponse.json({ submitted: id });
}
