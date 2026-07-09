import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { todayISO } from "@/lib/date";
import {
  getCommunityCase,
  parseCommunityCaseBody,
  validateCommunityCaseInput,
} from "@/lib/monitoring";

export const dynamic = "force-dynamic";

// GET /api/community-cases/:id — chi tiết khiếu nại, scoped theo dự án đang chọn.
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
  const item = projectId != null ? await getCommunityCase(id, projectId) : null;
  if (!item) return NextResponse.json({ error: "Không tìm thấy khiếu nại" }, { status: 404 });

  return NextResponse.json({ case: item });
}

// PATCH /api/community-cases/:id — sửa/chuyển vòng đời open→handling→closed (Admin/PM/
// kỹ sư). Chuyển sang 'closed' mà chưa có closed_date → tự set hôm nay.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageMonitoring(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa khiếu nại (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = projectId != null ? await getCommunityCase(id, projectId) : null;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy khiếu nại" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in body) merged[key] = body[key];
  const input = parseCommunityCaseBody(merged);

  // Chuyển sang 'closed' mà chưa có closed_date (mới đóng, không phải sửa lại bản ghi
  // đã đóng từ trước) → tự set hôm nay.
  if (input.status === "closed" && !input.closedDate) input.closedDate = todayISO();

  const invalid = validateCommunityCaseInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  await run(
    `UPDATE community_cases SET code = ?, title = ?, source = ?, received_date = ?,
            status = ?, resolution = ?, closed_date = ?
      WHERE id = ?`,
    input.code,
    input.title,
    input.source,
    input.receivedDate,
    input.status,
    input.resolution,
    input.closedDate,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/community-cases/:id — xoá khiếu nại (Admin/PM/kỹ sư).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageMonitoring(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá khiếu nại (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = projectId != null ? await getCommunityCase(id, projectId) : null;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy khiếu nại" }, { status: 404 });

  await run(`DELETE FROM community_cases WHERE id = ?`, id);

  return NextResponse.json({ deleted: id });
}
