import { NextRequest, NextResponse } from "next/server";
import { run, queryOne, todayISO, withTransaction } from "@/lib/db";
import { getCurrentUser, isAdminOrPm } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { parseMoneyExact } from "@/lib/nen/money";
import { resyncApprovalAmount } from "@/lib/tien-do/approvals";

export const dynamic = "force-dynamic";

// POST /api/proposals/:id/submit — trình duyệt (draft → submitted), người tạo hoặc Admin/PM.
// S13d (cùng lớp lỗi IPC S10a): approval_requests.amount mở lúc TẠO đề xuất, mà nháp còn sửa
// được số tiền (PATCH) → chốt lại amount + bước hiệu lực đầu tiên ngay lúc trình, dưới khoá dòng
// đề xuất, cùng transaction với chuyển trạng thái — không lách được bước duyệt theo min_amount.
export async function POST(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const proposal =
    projectId != null
      ? await queryOne<{ id: number; status: string; requested_by: number }>(
          `SELECT id, status, requested_by FROM proposals WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!proposal) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  if (proposal.requested_by !== user.id && !isAdminOrPm(user.role))
    return NextResponse.json(
      { error: "Chỉ người tạo hoặc Admin/PM được trình đề xuất" },
      { status: 403 },
    );
  if (proposal.status !== "draft")
    return NextResponse.json({ error: "Đề xuất không ở trạng thái nháp" }, { status: 409 });

  try {
    await withTransaction(async () => {
      // Khoá + đọc lại dưới khoá: PATCH/trình đồng thời không chen giữa lúc kiểm và lúc chốt.
      const dx = await queryOne<{ status: string; amount: string | null }>(
        `SELECT status, amount::text AS amount FROM proposals WHERE id = ? AND project_id = ? FOR UPDATE`,
        id,
        projectId,
      );
      if (!dx || dx.status !== "draft")
        throw Object.assign(new Error("Đề xuất không ở trạng thái nháp"), { status: 409 });
      await resyncApprovalAmount({
        entityType: "proposal",
        entityId: id,
        projectId: projectId as number,
        amountMinor: dx.amount == null ? null : parseMoneyExact(dx.amount),
        openAs: user,
      });
      await run(
        `UPDATE proposals SET status = 'submitted', submitted_at = ? WHERE id = ?`,
        todayISO(),
        id,
      );
    });
  } catch (err) {
    const { status, code } = err as { status?: number; code?: string };
    if (!status) throw err;
    return NextResponse.json(
      { error: (err as Error).message, ...(code ? { code } : {}) },
      { status },
    );
  }
  return NextResponse.json({ ok: true, status: "submitted" });
}
