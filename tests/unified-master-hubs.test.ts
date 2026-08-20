import test from "node:test";
import assert from "node:assert/strict";
import "@/tests/setup";
import {
  DASHBOARD_TREE,
  findActiveNav,
  resolveVisibleTree,
  flattenDashboards,
  isNavItemActive,
} from "@/app/lib/dashboardTree";

test("Unified Master Hubs: DASHBOARD_TREE chứa cụm 7 Đại Trung Tâm Điều Hành Hợp Nhất", () => {
  const hubsCluster = DASHBOARD_TREE.find(
    (c) => c.label === "🏛️ 7 Đại Trung Tâm Điều Hành (Unified Hubs)",
  );
  assert.ok(hubsCluster, "Phải có cụm 7 Đại Trung Tâm Điều Hành trên Sidebar AppShell");
  assert.equal(hubsCluster?.dashboards.length, 7, "Cụm phải có đúng 7 Đại Trung Tâm Điều Hành");

  const expectedHubs = [
    { href: "/cad-bim", label: "Studio Kỹ Thuật Không Gian & BIM/CAD" },
    { href: "/site", label: "Chỉ Huy Tác Nghiệp Hiện Trường & HSE" },
    { href: "/schedule", label: "Quản Trị Kế Hoạch & Tiến Độ WBS" },
    { href: "/procurement", label: "Chuỗi Cung Ứng, Mua Sắm & Kho Vận" },
    { href: "/commercial", label: "Hợp Đồng, Chi Phí & Pháp Lý FIDIC" },
    { href: "/engineering-intelligence", label: "Trí Tuệ Kỹ Thuật AI & Digital Twin" },
    { href: "/governance", label: "Quản Trị Dự Án, Bàn Giao & Cấu Hình" },
  ];

  for (const exp of expectedHubs) {
    const found = hubsCluster?.dashboards.find((d) => d.href === exp.href);
    assert.ok(found, `Phải tìm thấy Hub ${exp.label} với href ${exp.href}`);
    assert.equal(found?.label, exp.label);
    assert.ok(found?.icon, `Hub ${exp.label} phải có Icon`);
  }
});

test("Unified Master Hubs: findActiveNav định tuyến chính xác cho cả 7 Đại Trung Tâm", () => {
  const hubPaths = [
    { path: "/cad-bim", expectedLabel: "Studio Kỹ Thuật Không Gian & BIM/CAD" },
    { path: "/site", expectedLabel: "Chỉ Huy Tác Nghiệp Hiện Trường & HSE" },
    { path: "/schedule", expectedLabel: "Quản Trị Kế Hoạch & Tiến Độ WBS" },
    { path: "/procurement", expectedLabel: "Chuỗi Cung Ứng, Mua Sắm & Kho Vận" },
    { path: "/commercial", expectedLabel: "Hợp Đồng, Chi Phí & Pháp Lý FIDIC" },
    { path: "/engineering-intelligence", expectedLabel: "Trí Tuệ Kỹ Thuật AI & Digital Twin" },
    { path: "/governance", expectedLabel: "Quản Trị Dự Án, Bàn Giao & Cấu Hình" },
  ];

  for (const { path, expectedLabel } of hubPaths) {
    const active = findActiveNav(path);
    assert.ok(active, `findActiveNav phải tìm thấy node cho path ${path}`);
    assert.equal(active?.dashboard.label, expectedLabel);
  }
});

test("Unified Master Hubs: resolveVisibleTree hiển thị đầy đủ 7 Hubs cho mọi vai trò", () => {
  const roles = ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"] as const;
  const emptySettings = new Map<string, boolean>();

  for (const role of roles) {
    const visibleTree = resolveVisibleTree(DASHBOARD_TREE, role, emptySettings);
    const hubsCluster = visibleTree.find(
      (c) => c.label === "🏛️ 7 Đại Trung Tâm Điều Hành (Unified Hubs)",
    );
    assert.ok(hubsCluster, `Vai trò ${role} phải thấy cụm 7 Đại Trung Tâm Điều Hành`);
    assert.equal(
      hubsCluster?.dashboards.length,
      7,
      `Vai trò ${role} phải thấy đủ 7 Đại Trung Tâm Điều Hành`,
    );
  }
});

test("Unified Master Hubs: flattenDashboards bao gồm đầy đủ 7 Hubs", () => {
  const flat = flattenDashboards();
  const hubIds = [
    "dash.cad-bim-studio",
    "dash.site-command",
    "dash.schedule-control",
    "dash.procurement-hub",
    "dash.commercial-cockpit",
    "dash.engineering-intelligence-hub",
    "dash.governance-hub",
  ];

  for (const id of hubIds) {
    const found = flat.find((f) => f.dashboard.id === id);
    assert.ok(found, `flattenDashboards phải chứa dashboard ID ${id}`);
  }
});
