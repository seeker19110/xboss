import { NextRequest, NextResponse } from "next/server";
import { query, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getNavSettings, setNavEnabled, isKnownNodeKey } from "@/lib/nav-settings";
import { flattenDashboards } from "@/app/lib/dashboardTree";
import { sendPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";

// GET /api/nav-settings — mọi user đăng nhập: bản đồ bật/tắt dashboard (đã merge mặc
// định suy từ cây + override đã lưu) để AppShell lọc sidebar (M21 PR3).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const settings = await getNavSettings();
  return NextResponse.json(
    { settings: Object.fromEntries(settings) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// PATCH /api/nav-settings  body: { nodeKey, enabled } — Admin/PM bật/tắt 1 dashboard.
// Admin bật (false→true) → tạo notification `nav_enabled` cho mọi PM (dedup theo node_key).
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageNav(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const nodeKey = String(body.nodeKey ?? "");
  const enabled = !!body.enabled;
  if (!isKnownNodeKey(nodeKey))
    return NextResponse.json({ error: "nodeKey không hợp lệ" }, { status: 422 });

  const { changed, wasEnabled } = await setNavEnabled(nodeKey, enabled, null, user.id);

  if (user.role === "admin" && changed && enabled && !wasEnabled) {
    const found = flattenDashboards().find(({ dashboard }) => dashboard.id === nodeKey);
    const label = found?.dashboard.label ?? nodeKey;
    const pms = await query<{ id: number }>(`SELECT id FROM users WHERE role = 'pm'`);
    const recipients = pms.map((p) => p.id);
    if (recipients.length > 0) {
      const values = recipients.map(() => `(?, 'nav_enabled', ?, ?)`).join(", ");
      const params = recipients.flatMap((uid) => [
        uid,
        `Admin đã bật mục "${label}" trong menu`,
        nodeKey,
      ]);
      await run(
        `INSERT INTO notifications (user_id, type, message, nav_node_key) VALUES ${values}
         ON CONFLICT (user_id, type, nav_node_key) WHERE nav_node_key IS NOT NULL DO NOTHING`,
        ...params,
      );
      await sendPushToUsers(recipients, {
        title: "Menu XBoss cập nhật",
        body: `Admin đã bật mục "${label}" trong menu`,
      }).catch(() => {
        /* push lỗi không chặn việc lưu setting */
      });
    }
  }

  return NextResponse.json({ ok: true, changed });
}
