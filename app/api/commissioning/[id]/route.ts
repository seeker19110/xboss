import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  parseCommissioningBody,
  validateCommissioningInput,
  type CommissioningInput,
} from "@/lib/handover";

export const dynamic = "force-dynamic";

type ExistingRow = CommissioningInput;

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<ExistingRow | undefined> {
  if (projectId == null) return undefined;
  return queryOne<ExistingRow>(
    `SELECT code, system_name AS "systemName", system_id AS "tradeId", checklist,
            result, tested_at AS "testedAt", note
       FROM commissioning WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/commissioning/:id — chi tiết hệ thống T&C. Scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const item =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT c.id, c.project_id AS "projectId", c.code, c.system_name AS "systemName",
                  c.system_id AS "tradeId", d.code AS "tradeCode", d.name AS "tradeName",
                  c.checklist, c.result, c.tested_at AS "testedAt", c.note,
                  c.created_by AS "createdBy", u.name AS "createdByName", c.created_at AS "createdAt"
             FROM commissioning c
             LEFT JOIN systems d ON d.id = c.system_id
             LEFT JOIN users u ON u.id = c.created_by
            WHERE c.id = ? AND c.project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!item) return NextResponse.json({ error: "Không tìm thấy hệ thống T&C" }, { status: 404 });

  return NextResponse.json({ item });
}

// PATCH /api/commissioning/:id — sửa (manageHandover: Admin/PM/kỹ sư). Đổi
// result='passed'/'failed' cần CAN.approve (Admin/PM) — khoá FOR UPDATE trong
// transaction, cùng pattern nghiệm thu 2 bước (POST /api/tasks/:id/approve).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa hệ thống T&C (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy hệ thống T&C" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of ["code", "systemName", "tradeId", "checklist", "result", "testedAt", "note"])
    if (key in body) merged[key] = body[key];
  const input = parseCommissioningBody(merged);

  const invalid = validateCommissioningInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.tradeId != null) {
    const disc = await queryOne(`SELECT id FROM systems WHERE id = ?`, input.tradeId);
    if (!disc) return NextResponse.json({ error: "Hệ không tồn tại" }, { status: 422 });
  }

  const changingToDecision =
    (input.result === "passed" || input.result === "failed") && input.result !== existing.result;
  if (changingToDecision && !CAN.approve(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được đặt kết quả Đạt/Không đạt" },
      { status: 403 },
    );

  try {
    await withTransaction(async () => {
      // FOR UPDATE để tránh 2 người cùng duyệt/đổi kết quả đồng thời.
      const locked = await queryOne<{ result: string }>(
        `SELECT result FROM commissioning WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!locked) throw Object.assign(new Error("Không tìm thấy hệ thống T&C"), { status: 404 });

      await run(
        `UPDATE commissioning SET code = ?, system_name = ?, system_id = ?, checklist = ?::jsonb,
                result = ?, tested_at = ?, note = ?
          WHERE id = ?`,
        input.code,
        input.systemName,
        input.tradeId,
        JSON.stringify(input.checklist),
        input.result,
        input.testedAt,
        input.note,
        id,
      );
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  return NextResponse.json({ updated: id });
}

// DELETE /api/commissioning/:id — xoá hệ thống T&C (manageHandover: Admin/PM/kỹ sư).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá hệ thống T&C (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy hệ thống T&C" }, { status: 404 });

  await run(`DELETE FROM commissioning WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
