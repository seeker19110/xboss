import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";
import { inheritedAssigneeFor } from "@/lib/assignments";
import { recomputePackage } from "@/lib/recompute";

export const dynamic = "force-dynamic";

// POST /api/workpackages/:id/tasks
// body: { code, name, boqCode?, afterId? }
// afterId: chèn sau task có id này; null = thêm vào cuối.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới thêm được task" }, { status: 403 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const pkg = await queryOne<{ id: number }>(`SELECT id FROM work_packages WHERE id = ?`, pkgId);
  if (!pkg) return NextResponse.json({ error: "Nhóm không tồn tại" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!code || !name) return NextResponse.json({ error: "Thiếu code / name" }, { status: 400 });

  const dup = await queryOne(`SELECT id FROM tasks WHERE package_id = ? AND code = ?`, pkgId, code);
  if (dup)
    return NextResponse.json({ error: `Mã "${code}" đã tồn tại trong nhóm này` }, { status: 409 });

  const boqCode = String(body.boqCode ?? "").trim() || null;
  if (boqCode) {
    // TODO(M54 PR2): lấy orgId thật từ session
    const taken = await boqTakenBy(boqCode, 1);
    if (taken)
      return NextResponse.json(
        { error: `Mã BOQ "${boqCode}" đã được dùng bởi ${taken}` },
        { status: 409 },
      );
  }

  const afterId = body.afterId ? Number(body.afterId) : null;
  let sortOrder: number;

  if (afterId) {
    const after = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM tasks WHERE id = ? AND package_id = ?`,
      afterId,
      pkgId,
    );
    if (!after) return NextResponse.json({ error: "afterId không hợp lệ" }, { status: 400 });
    sortOrder = after.sort_order + 1;
    await run(
      `UPDATE tasks SET sort_order = sort_order + 1 WHERE package_id = ? AND sort_order >= ?`,
      pkgId,
      sortOrder,
    );
  } else {
    const maxRow = await queryOne<{ m: number | null }>(
      `SELECT MAX(sort_order) AS m FROM tasks WHERE package_id = ?`,
      pkgId,
    );
    sortOrder = (maxRow?.m ?? 0) + 1;
  }

  // Task mới kế thừa người phụ trách nhóm (gán thủ công sau sẽ thoát kế thừa).
  const inherited = await inheritedAssigneeFor(pkgId);

  const id = await insertId(
    `INSERT INTO tasks (package_id, code, name, boq_code, sort_order, status, progress_percent, assigned_to)
     VALUES (?, ?, ?, ?, ?, 'chuan_bi', 0, ?)`,
    pkgId,
    code,
    name,
    boqCode,
    sortOrder,
    inherited,
  );

  // Task mới 0% làm tăng mẫu số của nhóm — tính lại % nhóm, nếu không work_packages.progress
  // giữ nguyên giá trị cũ (cao hơn thực tế) cho tới lần recompute tiếp theo.
  await recomputePackage(pkgId);

  return NextResponse.json({ id }, { status: 201 });
}
