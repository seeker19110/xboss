import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { canLockDiary, canUnlockDiary } from "@/lib/diary";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/diaries/:date/lock → khoá sổ (Admin/PM) — sau khoá không sửa được (giá trị pháp lý).
export async function POST(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ date: string }> },
) {
  const { date } = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canLockDiary(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được khoá sổ" }, { status: 403 });
  if (!DATE_RE.test(date))
    return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);

  try {
    await withTransaction(async () => {
      const diary =
        projectId != null
          ? await queryOne<{ id: number; status: string }>(
              `SELECT id, status FROM site_diaries WHERE diary_date = ? AND project_id = ? FOR UPDATE`,
              date,
              projectId,
            )
          : undefined;
      if (!diary)
        throw Object.assign(new Error("Chưa có nhật ký ngày này để khoá"), { status: 404 });
      if (diary.status === "locked")
        throw Object.assign(new Error("Nhật ký đã khoá rồi"), { status: 409 });

      await run(
        `UPDATE site_diaries SET status = 'locked', locked_by = ?, locked_at = NOW() WHERE id = ?`,
        user.id,
        diary.id,
      );
      await run(
        `INSERT INTO diary_lock_history (diary_id, action, changed_by) VALUES (?, 'lock', ?)`,
        diary.id,
        user.id,
      );
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  return NextResponse.json({ ok: true, status: "locked" });
}

// DELETE /api/diaries/:date/lock → mở khoá (chỉ Admin), ghi audit.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ date: string }> },
) {
  const { date } = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canUnlockDiary(user.role))
    return NextResponse.json({ error: "Chỉ Admin được mở khoá nhật ký" }, { status: 403 });
  if (!DATE_RE.test(date))
    return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);

  try {
    await withTransaction(async () => {
      const diary =
        projectId != null
          ? await queryOne<{ id: number; status: string }>(
              `SELECT id, status FROM site_diaries WHERE diary_date = ? AND project_id = ? FOR UPDATE`,
              date,
              projectId,
            )
          : undefined;
      if (!diary) throw Object.assign(new Error("Chưa có nhật ký ngày này"), { status: 404 });
      if (diary.status !== "locked")
        throw Object.assign(new Error("Nhật ký chưa khoá"), { status: 409 });

      await run(
        `UPDATE site_diaries SET status = 'draft', locked_by = NULL, locked_at = NULL WHERE id = ?`,
        diary.id,
      );
      await run(
        `INSERT INTO diary_lock_history (diary_id, action, changed_by) VALUES (?, 'unlock', ?)`,
        diary.id,
        user.id,
      );
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  return NextResponse.json({ ok: true, status: "draft" });
}
