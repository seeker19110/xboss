import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSource, validateConfig } from "@/lib/reports";

export const dynamic = "force-dynamic";

type ReportRow = {
  id: number;
  ownerId: number;
  name: string;
  source: string;
  config: unknown;
  shared: boolean;
};

// PATCH /api/saved-reports/:id { name?, config?, shared? } — chỉ chủ sở hữu hoặc admin.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const id = parseInt((await paramsP).id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const r = await queryOne<ReportRow>(
    `SELECT id, owner_id AS "ownerId", name, source, config, shared FROM saved_reports WHERE id = ?`,
    id,
  );
  if (!r) return NextResponse.json({ error: "Không tìm thấy báo cáo" }, { status: 404 });
  if (r.ownerId !== user.id && user.role !== "admin")
    return NextResponse.json({ error: "Chỉ chủ sở hữu hoặc admin được sửa" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const args: unknown[] = [];

  if (body?.name != null) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Tên báo cáo trống" }, { status: 422 });
    sets.push("name = ?");
    args.push(name);
  }
  if (body?.config != null) {
    try {
      const cfg = validateConfig(r.source, body.config);
      sets.push("config = ?");
      args.push(JSON.stringify(cfg));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 422 });
    }
  }
  if (body?.shared != null) {
    sets.push("shared = ?");
    args.push(body.shared === true);
  }
  if (sets.length === 0)
    return NextResponse.json({ error: "Không có gì để cập nhật" }, { status: 422 });

  args.push(id);
  await run(`UPDATE saved_reports SET ${sets.join(", ")} WHERE id = ?`, ...args);
  return NextResponse.json({ ok: true });
}

// DELETE /api/saved-reports/:id — chỉ chủ sở hữu hoặc admin.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const id = parseInt((await paramsP).id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const r = await queryOne<{ ownerId: number }>(
    `SELECT owner_id AS "ownerId" FROM saved_reports WHERE id = ?`,
    id,
  );
  if (!r) return NextResponse.json({ error: "Không tìm thấy báo cáo" }, { status: 404 });
  if (r.ownerId !== user.id && user.role !== "admin")
    return NextResponse.json({ error: "Chỉ chủ sở hữu hoặc admin được xoá" }, { status: 403 });

  await run(`DELETE FROM saved_reports WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
