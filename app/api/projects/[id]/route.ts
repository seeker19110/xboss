import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

const STATUSES = ["active", "handover", "closed"];

function parseProjectId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// PATCH /api/projects/:id — sửa tên/mã/CĐT/nhà thầu/trạng thái/màu (chỉ Admin).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageProjects(user.role))
    return NextResponse.json({ error: "Chỉ Admin mới sửa được dự án" }, { status: 403 });

  if (!Number.isSafeInteger(user.orgId) || user.orgId < 1)
    return NextResponse.json({ error: "Không xác định được tổ chức của Admin" }, { status: 403 });
  const id = parseProjectId(params.id);
  if (id === null) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const project = await queryOne(
    `SELECT id FROM projects WHERE id = ? AND org_id = ?`,
    id,
    user.orgId,
  );
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });

  const body: unknown = await req.json().catch(() => null);
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Tên dự án không được rỗng" }, { status: 400 });
    updates.push("name = ?");
    values.push(name);
  }
  if (input.code !== undefined) {
    const code = typeof input.code === "string" && input.code.trim() ? input.code.trim() : null;
    if (code) {
      const dup = await queryOne(
        `SELECT id FROM projects WHERE code = ? AND id <> ? AND org_id = ?`,
        code,
        id,
        user.orgId,
      );
      if (dup)
        return NextResponse.json({ error: `Mã dự án "${code}" đã tồn tại` }, { status: 409 });
    }
    updates.push("code = ?");
    values.push(code);
  }
  for (const field of ["investor", "contractor", "color"] as const) {
    if (input[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(input[field] || null);
    }
  }
  if (input.status !== undefined) {
    if (typeof input.status !== "string" || !STATUSES.includes(input.status))
      return NextResponse.json({ error: "Trạng thái dự án không hợp lệ" }, { status: 422 });
    updates.push("status = ?");
    values.push(input.status);
  }

  if (updates.length > 0) {
    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
    const kq = await ghiNeuConQuyen(
      () => CAN.manageProjects(user.role),
      () =>
        run(
          `UPDATE projects SET ${updates.join(", ")} WHERE id = ? AND org_id = ?`,
          ...values,
          id,
          user.orgId,
        ),
    );
    if (!kq.ok)
      return NextResponse.json({ error: "Chỉ Admin mới sửa được dự án" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/projects/:id — hard delete bị khóa fail-closed. Nhiều business/audit tables
// có FK ON DELETE CASCADE, nên dùng trạng thái closed để giữ nguyên toàn bộ lineage.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageProjects(user.role))
    return NextResponse.json({ error: "Chỉ Admin mới xoá được dự án" }, { status: 403 });

  if (!Number.isSafeInteger(user.orgId) || user.orgId < 1)
    return NextResponse.json({ error: "Không xác định được tổ chức của Admin" }, { status: 403 });
  const projectId = parseProjectId(params.id);
  if (projectId === null) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const project = await queryOne(
    `SELECT id FROM projects WHERE id = ? AND org_id = ?`,
    projectId,
    user.orgId,
  );
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
  return NextResponse.json(
    {
      error:
        "Không hỗ trợ xoá cứng dự án để bảo toàn dữ liệu và lịch sử; hãy chuyển trạng thái sang closed",
    },
    { status: 409 },
  );
}
