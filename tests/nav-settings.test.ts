import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DashCluster } from "@/app/lib/dashboardTree";

// ===== Test thuần (không cần DB) =====

test("dashboardStatus/flattenDashboards: mọi dashboard cấp 3 có id, không trùng nhau", async () => {
  const { flattenDashboards, dashboardStatus } = await import("@/app/lib/dashboardTree");

  const flat = flattenDashboards();
  assert.ok(flat.length > 0);
  const ids = flat.map(({ dashboard }) => dashboard.id);
  assert.ok(
    ids.every((id) => typeof id === "string" && id.length > 0),
    "mọi dashboard cấp 3 phải có id ổn định cho nav_settings",
  );
  assert.equal(new Set(ids).size, ids.length, "id dashboard không được trùng nhau");

  for (const { dashboard } of flat) {
    const status = dashboardStatus(dashboard);
    if (dashboard.href || dashboard.children) assert.equal(status, "available");
    else assert.equal(status, "coming-soon");
  }
});

test("isKnownNodeKey: chặn node_key lạ, chấp nhận id có thật trong cây", async () => {
  const { isKnownNodeKey } = await import("@/lib/nav-settings");
  const { flattenDashboards } = await import("@/app/lib/dashboardTree");

  const realId = flattenDashboards()[0].dashboard.id!;
  assert.equal(isKnownNodeKey(realId), true);
  assert.equal(isKnownNodeKey("dash.khong-ton-tai"), false);
});

test("resolveVisibleTree: lọc theo vai trò + nav_settings, cụm rỗng sau lọc thì ẩn", async () => {
  const { resolveVisibleTree } = await import("@/app/lib/dashboardTree");
  const { Users, Wrench } = await import("lucide-react");

  const tree: DashCluster[] = [
    {
      label: "Cụm A",
      dashboards: [
        { id: "dash.test-a", label: "Chỉ Admin", icon: Users, href: "/a", roles: ["admin"] },
        { id: "dash.test-b", label: "Ai cũng thấy", icon: Wrench, href: "/b" },
      ],
    },
    {
      label: "Cụm B (sẽ ẩn hết)",
      dashboards: [{ id: "dash.test-c", label: "Bị tắt", icon: Wrench, href: "/c" }],
    },
  ];

  // Vai trò "engineer" không thấy dash.test-a (roles chỉ admin) → Cụm A còn 1 mục.
  const settingsAllOn = new Map([
    ["dash.test-a", true],
    ["dash.test-b", true],
    ["dash.test-c", true],
  ]);
  const visibleEngineer = resolveVisibleTree(tree, "engineer", settingsAllOn);
  assert.equal(visibleEngineer.length, 2);
  assert.equal(visibleEngineer[0].dashboards.length, 1);
  assert.equal(visibleEngineer[0].dashboards[0].id, "dash.test-b");

  // Admin bị tắt dash.test-c → Cụm B rỗng sau lọc → bị ẩn hẳn (không render header cụm rỗng).
  const settingsCOff = new Map([
    ["dash.test-a", true],
    ["dash.test-b", true],
    ["dash.test-c", false],
  ]);
  const visibleAdmin = resolveVisibleTree(tree, "admin", settingsCOff);
  assert.equal(visibleAdmin.length, 1);
  assert.equal(visibleAdmin[0].label, "Cụm A");
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "getNavSettings: mặc định BẬT cho mọi dashboard khi chưa có bản ghi (kể cả coming-soon — giữ đúng hành vi 'bản đồ lộ trình sống' đã có từ PR1, nav_settings chỉ dùng để TẮT bớt)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { getNavSettings } = await import("@/lib/nav-settings");
    const { flattenDashboards } = await import("@/app/lib/dashboardTree");

    const settings = await getNavSettings();
    for (const { dashboard } of flattenDashboards()) {
      if (!dashboard.id) continue;
      assert.equal(settings.get(dashboard.id), true, `node_key ${dashboard.id}`);
    }
  },
);

test(
  "setNavEnabled: upsert ON CONFLICT(node_key, project_id) chỉ 1 dòng NULL/node, changed/wasEnabled đúng",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, query, insertId } = await import("@/lib/db");
    const { setNavEnabled } = await import("@/lib/nav-settings");

    const adminId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Admin NavTest', 'nav-admin@xboss.vn', 'x', 'admin')`,
    );
    const nodeKey = "dash.claim"; // available theo mặc định (có children)

    const r1 = await setNavEnabled(nodeKey, false, null, adminId);
    assert.equal(r1.wasEnabled, true); // mặc định bật (available)
    assert.equal(r1.changed, true);

    const r2 = await setNavEnabled(nodeKey, false, null, adminId);
    assert.equal(r2.wasEnabled, false);
    assert.equal(r2.changed, false); // bật lại cùng giá trị → không đổi

    const r3 = await setNavEnabled(nodeKey, true, null, adminId);
    assert.equal(r3.wasEnabled, false);
    assert.equal(r3.changed, true);

    const rows = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM nav_settings WHERE node_key = ? AND project_id IS NULL`,
      nodeKey,
    );
    assert.equal(Number(rows[0].n), 1, "chỉ 1 dòng NULL/node dù setNavEnabled gọi nhiều lần");

    await run(`DELETE FROM nav_settings WHERE node_key = ?`, nodeKey);
    await run(`DELETE FROM users WHERE id = ?`, adminId);
  },
);

test(
  "notifications nav_enabled: unique index (user_id, type, nav_node_key) chặn trùng (dedup bật-tắt-bật)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, query, insertId } = await import("@/lib/db");

    const pmId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PM NavTest', 'nav-pm@xboss.vn', 'x', 'pm')`,
    );
    const nodeKey = "dash.nha-thau-phu";

    for (const msg of ["Admin đã bật mục X", "Admin đã bật mục X (lại)"]) {
      await run(
        `INSERT INTO notifications (user_id, type, message, nav_node_key) VALUES (?, 'nav_enabled', ?, ?)
         ON CONFLICT (user_id, type, nav_node_key) WHERE nav_node_key IS NOT NULL DO NOTHING`,
        pmId,
        msg,
        nodeKey,
      );
    }

    const rows = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'nav_enabled' AND nav_node_key = ?`,
      pmId,
      nodeKey,
    );
    assert.equal(Number(rows[0].n), 1);

    await run(`DELETE FROM notifications WHERE user_id = ?`, pmId);
    await run(`DELETE FROM users WHERE id = ?`, pmId);
  },
);
