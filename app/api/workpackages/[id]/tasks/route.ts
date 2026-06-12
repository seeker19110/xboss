import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";

export const dynamic = "force-dynamic";

// POST /api/workpackages/:id/tasks
// body: { code, name, boqCode?, afterId? }
// afterId: chèn sau task có id này; null = thêm vào cuối.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Chỉ Admin/PM mới thêm được task" }, { status: 403 });

  const pkgId = parseInt(params.id);
  if (isNaN(pkgId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const pkg = await queryOne<{ id: number }>(`SELECT id FROM work_packages WHERE id = ?`, pkgId);
  if (!pkg) return NextResponse.json({ error: "Nhóm không tồn tại" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!code || !name) return NextResponse.json({ error: "Thiếu code / name" }, { status: 400 });

  const dup = await queryOne(`SELECT id FROM tasks WHERE package_id = ? AND code = ?`, pkgId, code);
  if (dup) return NextResponse.json({ error: `Mã "${code}" đã tồn tại trong nhóm này` }, { status: 409 });

  const boqCode = String(body.boqCode ?? "").trim() || null;
  if (boqCode) {
    const taken = await boqTakenBy(boqCode);
    if (taken) return NextResponse.json({ error: `Mã BOQ "${boqCode}" đã được dùng bởi ${taken}` }, { status: 409 });
  }

  const afterId = body.afterId ? Number(body.afterId) : null;
  let sortOrder: number;

  if (afterId) {
    const after = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM tasks WHERE id = ? AND package_id = ?`, afterId, pkgId);
    if (!after) return NextResponse.json({ error: "afterId không hợp lệ" }, { status: 400 });
    sortOrder = after.sort_order + 1;
    await run(`UPDATE tasks SET sort_order = sort_order + 1 WHERE package_id = ? AND sort_order >= ?`, pkgId, sortOrder);
  } else {
    const maxRow = await queryOne<{ m: number | null }>(`SELECT MAX(sort_order) AS m FROM tasks WHERE package_id = ?`, pkgId);
    sortOrder = (maxRow?.m ?? 0) + 1;
  }

  const id = await insertId(
    `INSERT INTO tasks (package_id, code, name, boq_code, sort_order, status, progress_percent)
     VALUES (?, ?, ?, ?, ?, 'chuan_bi', 0)`,
    pkgId, code, name, boqCode, sortOrder);

  return NextResponse.json({ id }, { status: 201 });
}
