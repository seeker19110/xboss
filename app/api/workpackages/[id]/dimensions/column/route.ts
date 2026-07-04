import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { recomputeTask, recomputePackage } from "@/lib/recompute";

export const dynamic = "force-dynamic";

// POST /api/workpackages/:id/dimensions/column
// body: { label, afterLabel? }
// Thêm cột dimension mới (tạo progress_dimension row cho mọi task trong package).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới thêm được cột" }, { status: 403 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const label = String(body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "Thiếu tên cột (label)" }, { status: 400 });

  // Lấy danh sách tasks trong package.
  const tasks = await query<{ id: number }>(
    `SELECT id FROM tasks WHERE package_id = ? ORDER BY sort_order, id`,
    pkgId,
  );
  if (tasks.length === 0)
    return NextResponse.json({ error: "Nhóm này chưa có task" }, { status: 400 });

  const afterLabel = String(body.afterLabel ?? "").trim() || null;
  let sortOrder: number;

  if (afterLabel) {
    // Lấy sort_order của cột afterLabel (từ task đầu tiên làm mẫu).
    const ref = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM progress_dimensions WHERE task_id = ? AND dimension_label = ?`,
      tasks[0].id,
      afterLabel,
    );
    if (!ref) return NextResponse.json({ error: "afterLabel không tồn tại" }, { status: 400 });
    sortOrder = ref.sort_order + 1;
    // Shift các cột sau vị trí chèn.
    await run(
      `UPDATE progress_dimensions SET sort_order = sort_order + 1
         WHERE task_id IN (SELECT id FROM tasks WHERE package_id = ?) AND sort_order >= ?`,
      pkgId,
      sortOrder,
    );
  } else {
    // Thêm vào cuối.
    const maxRow = await queryOne<{ m: number | null }>(
      `SELECT MAX(pd.sort_order) AS m FROM progress_dimensions pd
         JOIN tasks t ON pd.task_id = t.id WHERE t.package_id = ?`,
      pkgId,
    );
    sortOrder = (maxRow?.m ?? 0) + 1;
  }

  // Chỉ tạo dòng cho task CHƯA có nhãn này — tránh trùng (task_id, dimension_label) khi các
  // task trong nhóm đã lệch bộ cột (vd task thêm sau chưa có đủ cột). Dòng trùng bị lưới
  // GET /dimensions "che" (gộp theo nhãn, chỉ hiện 1 ô) nhưng vẫn tính vào mẫu số % —
  // sai vĩnh viễn và không sửa được qua UI (không có checkbox nào trỏ tới dòng thừa).
  const already = await query<{ task_id: number }>(
    `SELECT task_id FROM progress_dimensions
      WHERE dimension_label = ? AND task_id IN (${tasks.map(() => "?").join(", ")})`,
    label,
    ...tasks.map((t) => t.id),
  );
  const alreadySet = new Set(already.map((r) => r.task_id));
  const targetTasks = tasks.filter((t) => !alreadySet.has(t.id));
  if (targetTasks.length === 0)
    return NextResponse.json(
      { error: `Cột "${label}" đã tồn tại ở mọi task trong nhóm` },
      { status: 409 },
    );

  // Tạo progress_dimension mới cho các task còn thiếu — 1 câu multi-row INSERT thay vì N round trip.
  // ON CONFLICT DO NOTHING: lưới an toàn ở tầng DB (uq_progress_dimensions_task_label, xem
  // migrations/0004) chống race khi 2 request thêm cùng nhãn gần như đồng thời.
  const ph = targetTasks.map(() => "(?, ?, 0, ?)").join(", ");
  const vals = targetTasks.flatMap((t) => [t.id, label, sortOrder]);
  await run(
    `INSERT INTO progress_dimensions (task_id, dimension_label, installed, sort_order) VALUES ${ph}
       ON CONFLICT (task_id, dimension_label) DO NOTHING`,
    ...vals,
  );

  // Thêm cột làm tăng mẫu số mỗi task — phải tính lại % task + nhóm, nếu không %
  // hiển thị vẫn giữ giá trị cũ (cao hơn thực tế) cho tới khi ai đó tick 1 ô.
  // recomputeTask khoá row bằng FOR UPDATE — phải nằm trong transaction để lock có tác dụng
  // tới lúc ghi xong (chống lost update với tick checkbox đồng thời).
  await withTransaction(async () => {
    for (const t of targetTasks) await recomputeTask(t.id, user.name);
    await recomputePackage(pkgId);
  });

  return NextResponse.json(
    { created: targetTasks.length, skipped: tasks.length - targetTasks.length, label, sortOrder },
    { status: 201 },
  );
}

// DELETE /api/workpackages/:id/dimensions/column?label=xxx[&allGroups=true]
// Xoá toàn bộ progress_dimensions theo nhãn.
// allGroups=true → xoá khỏi mọi nhóm trong cùng sheet; mặc định chỉ nhóm hiện tại.
export async function DELETE(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới xoá được cột" }, { status: 403 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const label = req.nextUrl.searchParams.get("label");
  if (!label) return NextResponse.json({ error: "Thiếu tham số label" }, { status: 400 });

  const allGroups = req.nextUrl.searchParams.get("allGroups") === "true";

  let affectedPkgIds: number[];
  if (allGroups) {
    // Lấy sheet_type_id của nhóm hiện tại rồi tìm mọi nhóm cùng sheet.
    const pkg = await queryOne<{ sheet_type_id: number }>(
      `SELECT sheet_type_id FROM work_packages WHERE id = ?`,
      pkgId,
    );
    if (!pkg) return NextResponse.json({ error: "Nhóm không tồn tại" }, { status: 404 });
    const siblings = await query<{ id: number }>(
      `SELECT id FROM work_packages WHERE sheet_type_id = ?`,
      pkg.sheet_type_id,
    );
    affectedPkgIds = siblings.map((r) => r.id);
  } else {
    affectedPkgIds = [pkgId];
  }

  let totalDeleted = 0;
  for (const pid of affectedPkgIds) {
    const { changes } = await run(
      `DELETE FROM progress_dimensions WHERE dimension_label = ?
         AND task_id IN (SELECT id FROM tasks WHERE package_id = ?)`,
      label,
      pid,
    );
    totalDeleted += changes;

    // Tính lại % cho mọi task + nhóm bị ảnh hưởng (trong transaction — xem chú thích ở POST).
    const tasks = await query<{ id: number }>(`SELECT id FROM tasks WHERE package_id = ?`, pid);
    await withTransaction(async () => {
      for (const t of tasks) await recomputeTask(t.id, user.name);
      await recomputePackage(pid);
    });
  }

  return NextResponse.json({ deleted: totalDeleted, groups: affectedPkgIds.length });
}

// PATCH /api/workpackages/:id/dimensions/column
// body: { action: "copy", label, newLabel, afterLabel? }
// Tạo cột mới là bản sao cột label (checkbox reset về unchecked).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới copy được cột" }, { status: 403 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (body.action !== "copy")
    return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });

  const label = String(body.label ?? "").trim();
  const newLabel = String(body.newLabel ?? "").trim();
  if (!label || !newLabel)
    return NextResponse.json({ error: "Thiếu label / newLabel" }, { status: 400 });

  const tasks = await query<{ id: number }>(
    `SELECT id FROM tasks WHERE package_id = ? ORDER BY sort_order, id`,
    pkgId,
  );
  if (tasks.length === 0) return NextResponse.json({ error: "Nhóm chưa có task" }, { status: 400 });

  // Task nào đã có nhãn mới thì bỏ qua — tránh trùng (task_id, dimension_label) khi các task
  // trong nhóm đã lệch bộ cột (xem giải thích ở POST cùng file). Chỉ 409 khi MỌI task đã có
  // sẵn nhãn mới (thật sự trùng cột), còn lệch một phần thì tự sửa (chỉ tạo cho task còn thiếu).
  const already = await query<{ task_id: number }>(
    `SELECT task_id FROM progress_dimensions
      WHERE dimension_label = ? AND task_id IN (${tasks.map(() => "?").join(", ")})`,
    newLabel,
    ...tasks.map((t) => t.id),
  );
  const alreadySet = new Set(already.map((r) => r.task_id));
  const targetTasks = tasks.filter((t) => !alreadySet.has(t.id));
  if (targetTasks.length === 0)
    return NextResponse.json({ error: `Cột "${newLabel}" đã tồn tại` }, { status: 409 });

  // Lấy sort_order của cột gốc.
  const srcRef = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM progress_dimensions WHERE task_id = ? AND dimension_label = ?`,
    tasks[0].id,
    label,
  );
  if (!srcRef) return NextResponse.json({ error: `Cột "${label}" không tồn tại` }, { status: 404 });

  const afterLabel = String(body.afterLabel ?? label).trim();
  const afterRef = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM progress_dimensions WHERE task_id = ? AND dimension_label = ?`,
    tasks[0].id,
    afterLabel,
  );
  const sortOrder = (afterRef?.sort_order ?? srcRef.sort_order) + 1;

  await withTransaction(async () => {
    await run(
      `UPDATE progress_dimensions SET sort_order = sort_order + 1
         WHERE task_id IN (SELECT id FROM tasks WHERE package_id = ?) AND sort_order >= ?`,
      pkgId,
      sortOrder,
    );
    const ph = targetTasks.map(() => "(?, ?, 0, ?)").join(", ");
    const vals = targetTasks.flatMap((t) => [t.id, newLabel, sortOrder]);
    // ON CONFLICT DO NOTHING: lưới an toàn ở tầng DB (uq_progress_dimensions_task_label,
    // xem migrations/0004) chống race khi 2 request copy cùng nhãn gần như đồng thời.
    await run(
      `INSERT INTO progress_dimensions (task_id, dimension_label, installed, sort_order) VALUES ${ph}
         ON CONFLICT (task_id, dimension_label) DO NOTHING`,
      ...vals,
    );
  });

  // Cột mới (copy) cũng tăng mẫu số mỗi task — tính lại % task + nhóm như khi thêm cột
  // (trong transaction — xem chú thích ở POST).
  await withTransaction(async () => {
    for (const t of targetTasks) await recomputeTask(t.id, user.name);
    await recomputePackage(pkgId);
  });

  return NextResponse.json(
    {
      created: targetTasks.length,
      skipped: tasks.length - targetTasks.length,
      label: newLabel,
      sortOrder,
    },
    { status: 201 },
  );
}
