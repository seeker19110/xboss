import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";

// Mã lỗi Postgres cho vi phạm UNIQUE (uq_progress_dimensions_task_label, migrations/0004).
const PG_UNIQUE_VIOLATION = "23505";

export const dynamic = "force-dynamic";

// POST /api/dimensions/rename  body: { packageId, oldLabel, newLabel }
// Đổi tên cột (trục/căn hộ) cho TOÀN sheet chứa work package đó.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  const { packageId, oldLabel, newLabel } = await req.json().catch(() => ({}));
  if (!packageId || !oldLabel || !newLabel)
    return NextResponse.json({ error: "Thiếu tham số" }, { status: 400 });

  const sheet = await queryOne<{ sheet_type_id: number }>(
    `SELECT sheet_type_id FROM work_packages WHERE id = ?`,
    packageId,
  );
  if (!sheet) return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 });

  const trimmedNewLabel = String(newLabel).trim();
  if (!trimmedNewLabel) return NextResponse.json({ error: "Tên cột mới rỗng" }, { status: 400 });

  let updated: number;
  try {
    updated = await withTransaction(async () => {
      const r = await run(
        `UPDATE progress_dimensions SET dimension_label = ?
           WHERE dimension_label = ?
             AND task_id IN (
               SELECT t.id FROM tasks t
               JOIN work_packages wp ON t.package_id = wp.id
              WHERE wp.sheet_type_id = ?)`,
        trimmedNewLabel,
        oldLabel,
        sheet.sheet_type_id,
      );
      // Không có trigger DB nào theo dõi progress_dimensions (chỉ tasks/work_packages,
      // migrations/0067) — đổi tên cột không đổi % nên không gọi recomputeTask, phải tự
      // bump watermark ở đây, nếu không client khác không biết tên cột vừa đổi.
      if (r.changes > 0) {
        await run(
          `INSERT INTO sheet_versions (sheet_type_id) VALUES (?)
             ON CONFLICT (sheet_type_id) DO UPDATE
               SET version = sheet_versions.version + 1, updated_at = NOW()`,
          sheet.sheet_type_id,
        );
      }
      return Number(r.changes);
    });
  } catch (err: unknown) {
    // Đổi tên trùng nhãn đã có ở 1 task khác trong sheet → vi phạm UNIQUE(task_id, label).
    if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION)
      return NextResponse.json(
        { error: `Cột "${trimmedNewLabel}" đã tồn tại ở một task khác trong sheet này` },
        { status: 409 },
      );
    throw err;
  }

  return NextResponse.json({ updated, oldLabel, newLabel: trimmedNewLabel });
}
