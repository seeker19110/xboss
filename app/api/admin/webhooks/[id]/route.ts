import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import { WEBHOOK_EVENTS, validateWebhookUrl } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

function parseEvents(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const set = new Set<string>();
  for (const e of raw) {
    if (typeof e !== "string" || !(WEBHOOK_EVENTS as readonly string[]).includes(e)) return null;
    set.add(e);
  }
  return [...set];
}

// PATCH /api/admin/webhooks/:id { url?, events?, active? } → sửa webhook (không đổi secret).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageIntegrations(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý webhook" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (body.url !== undefined) {
    const urlCheck = validateWebhookUrl(String(body.url ?? ""));
    if (!urlCheck.ok) return NextResponse.json({ error: urlCheck.error }, { status: 422 });
    sets.push("url = ?");
    vals.push(urlCheck.url);
  }
  if (body.events !== undefined) {
    const events = parseEvents(body.events);
    if (!events)
      return NextResponse.json(
        { error: "Danh sách sự kiện không hợp lệ (phải chọn ít nhất 1 sự kiện hợp lệ)" },
        { status: 422 },
      );
    sets.push("events = ?");
    vals.push(events);
  }
  if (body.active !== undefined) {
    sets.push("active = ?");
    vals.push(Boolean(body.active));
  }

  if (sets.length === 0)
    return NextResponse.json({ error: "Không có trường nào để cập nhật" }, { status: 400 });

  const existing = await queryOne<{ id: number }>(`SELECT id FROM webhooks WHERE id = ?`, id);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy webhook" }, { status: 404 });

  vals.push(id);
  await run(`UPDATE webhooks SET ${sets.join(", ")} WHERE id = ?`, ...vals);
  return NextResponse.json({ id });
}

// DELETE /api/admin/webhooks/:id → xoá webhook (kéo theo webhook_deliveries qua ON DELETE CASCADE).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageIntegrations(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý webhook" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const existing = await queryOne<{ id: number }>(`SELECT id FROM webhooks WHERE id = ?`, id);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy webhook" }, { status: 404 });

  await run(`DELETE FROM webhooks WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
