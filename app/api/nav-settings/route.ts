import { NextRequest, NextResponse } from "next/server";
import { query, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getNavSettings, setNavEnabled, isKnownNodeKey } from "@/lib/nav-settings";
import { flattenDashboards } from "@/app/lib/dashboardTree";
import { sendPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";

// GET /api/nav-settings — mọi user đăng nhập: bản đồ bật/tắt dashboard (mặc định suy từ
// cây + override toàn hệ thống + override riêng dự án đang chọn, M22) để AppShell lọc sidebar.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const settings = await getNavSettings(projectId);
  return NextResponse.json(
    { settings: Object.fromEntries(settings) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// PATCH /api/nav-settings  body: { nodeKey, enabled, scope? } — Admin/PM bật/tắt 1 dashboard.
// scope: "global" (mặc định, giữ nguyên hành vi cũ — áp toàn hệ thống) | "project" (chỉ áp dự
// án đang chọn, M22). Admin bật (false→true, ở phạm vi global) → tạo notification `nav_enabled`
// cho mọi PM (dedup theo node_key).
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageNav(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const nodeKey = String(body.nodeKey ?? "");
  const enabled = !!body.enabled;
  const scope = body.scope === "project" ? "project" : "global";
  if (!isKnownNodeKey(nodeKey))
    return NextResponse.json({ error: "nodeKey không hợp lệ" }, { status: 422 });

  let targetProjectId: number | null = null;
  if (scope === "project") {
    targetProjectId = await getCurrentProjectId(user);
    if (targetProjectId == null)
      return NextResponse.json({ error: "Chưa có dự án nào để áp override" }, { status: 422 });
  }

  const { changed, wasEnabled } = await setNavEnabled(nodeKey, enabled, targetProjectId, user.id);

  if (scope === "global" && user.role === "admin" && changed && enabled && !wasEnabled) {
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
