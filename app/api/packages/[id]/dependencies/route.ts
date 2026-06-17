import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/packages/:id/dependencies → việc trước (predecessors) + việc sau (successors) của nhóm.
export async function GET(_req: NextRequest, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const id = parseInt((await paramsP).id);
  if (isNaN(id)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });

  const predecessors = await query(
    `SELECT d.id AS "depId", wp.id, wp.code, wp.name, wp.progress, wp.status
       FROM package_dependencies d JOIN work_packages wp ON d.predecessor_id = wp.id
      WHERE d.successor_id = ? ORDER BY wp.code`, id);
  const successors = await query(
    `SELECT d.id AS "depId", wp.id, wp.code, wp.name, wp.progress, wp.status
       FROM package_dependencies d JOIN work_packages wp ON d.successor_id = wp.id
      WHERE d.predecessor_id = ? ORDER BY wp.code`, id);

  return NextResponse.json({ predecessors, successors });
}

// POST /api/packages/:id/dependencies { predecessorId } → nhóm này phụ thuộc vào predecessorId (Admin/PM).
export async function POST(req: NextRequest, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa phụ thuộc" }, { status: 403 });

  const successorId = parseInt((await paramsP).id);
  const body = await req.json().catch(() => ({}));
  const predecessorId = parseInt(String(body?.predecessorId ?? ""));
  if (isNaN(successorId) || isNaN(predecessorId))
    return NextResponse.json({ error: "Thiếu predecessorId" }, { status: 400 });
  if (successorId === predecessorId)
    return NextResponse.json({ error: "Nhóm không thể phụ thuộc chính nó" }, { status: 422 });

  const both = await query<{ id: number }>(
    `SELECT id FROM work_packages WHERE id IN (?, ?)`, successorId, predecessorId);
  if (both.length < 2)
    return NextResponse.json({ error: "Nhóm việc không tồn tại" }, { status: 404 });

  // Chống tạo vòng lặp: nếu đã có đường successorId → … → predecessorId thì cạnh mới (pred→succ) sẽ khép vòng.
  const edges = await query<{ predecessorId: number; successorId: number }>(
    `SELECT predecessor_id AS "predecessorId", successor_id AS "successorId" FROM package_dependencies`);
  const next = new Map<number, number[]>();
  for (const e of edges) {
    if (!next.has(e.predecessorId)) next.set(e.predecessorId, []);
    next.get(e.predecessorId)!.push(e.successorId);
  }
  const seen = new Set<number>([successorId]);
  const stack = [successorId];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === predecessorId)
      return NextResponse.json({ error: "Tạo phụ thuộc này sẽ gây vòng lặp" }, { status: 422 });
    for (const m of next.get(n) ?? []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
  }

  const dup = await queryOne<{ id: number }>(
    `SELECT id FROM package_dependencies WHERE predecessor_id = ? AND successor_id = ?`,
    predecessorId, successorId);
  if (dup) return NextResponse.json({ id: dup.id, existed: true });

  const id = await insertId(
    `INSERT INTO package_dependencies (predecessor_id, successor_id, created_by) VALUES (?, ?, ?)`,
    predecessorId, successorId, user.id);
  return NextResponse.json({ id }, { status: 201 });
}
