import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, isAdminOrPm } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

// POST /api/variations/:id/submit — trình phát sinh lên CĐT/TVGS (nháp → đã
// trình). Chỉ Admin/PM (kỹ sư ghi nhận ở hiện trường vẫn cần PM rà soát trước khi
// gửi ra ngoài dự án).
export async function POST(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được trình phát sinh lên CĐT/TVGS" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);

  try {
    await withTransaction(async () => {
      const vo =
        projectId != null
          ? await queryOne<{ status: string }>(
              `SELECT status FROM variation_orders WHERE id = ? AND project_id = ? FOR UPDATE`,
              id,
              projectId,
            )
          : undefined;
      if (!vo) throw Object.assign(new Error("Không tìm thấy phát sinh"), { status: 404 });
      if (vo.status !== "draft")
        throw Object.assign(new Error("Chỉ trình được phát sinh đang ở trạng thái nháp"), {
          status: 409,
        });
      await run(
        `UPDATE variation_orders SET status = 'submitted', submitted_at = ? WHERE id = ?`,
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
