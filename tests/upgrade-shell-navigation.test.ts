import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { FileText } from "lucide-react";
import { DASHBOARD_TREE, type DashCluster } from "@/app/lib/dashboardTree";
import {
  frequentShellLinks,
  enabledShellSearchHits,
  resolveShellNavigation,
  shellNavLinks,
} from "@/app/lib/upgrade-shell-navigation";
import type { ModuleDef } from "@/lib/nen/modules";

const tree: DashCluster[] = [
  {
    label: "Thử nghiệm",
    dashboards: [
      {
        id: "group",
        label: "Nhóm",
        icon: FileText,
        children: [
          { href: "/my-tasks", label: "Việc của tôi", icon: FileText },
          { href: "/admin", label: "Quản trị", icon: FileText, roles: ["admin"] },
          { href: "/diary", label: "Nhật ký", icon: FileText },
        ],
      },
      { id: "report", href: "/report", label: "Báo cáo", icon: FileText },
      {
        id: "restricted",
        label: "Nhóm quản trị",
        icon: FileText,
        roles: ["admin"],
        children: [{ href: "/private", label: "Nội bộ", icon: FileText }],
      },
    ],
  },
];
const moduleDef: ModuleDef = {
  key: "field",
  nav: [{ group: "Thử nghiệm", label: "Việc", href: "/my-tasks", icon: "FileText" }],
  permKeys: [],
  routePrefix: [],
};

test("menu và lối tắt lọc cả quyền cha/con, nav override và module tắt ở lá lồng", () => {
  const visible = resolveShellNavigation(
    tree,
    "subcon",
    new Map([["report", false]]),
    new Map([["field", false]]),
    [moduleDef],
  );
  assert.deepEqual(
    shellNavLinks(visible).map((item) => item.href),
    ["/diary"],
  );
  assert.deepEqual(
    frequentShellLinks(visible, "subcon").map((item) => item.href),
    ["/diary"],
  );
  assert.equal(tree[0].dashboards[0].children?.length, 3, "không sửa cây nguồn dùng chung");
});

test("ẩn dashboard nhóm không làm lối tắt hồi sinh link con; cụm rỗng được bỏ", () => {
  const visible = resolveShellNavigation(
    tree,
    "subcon",
    new Map([
      ["group", false],
      ["report", false],
    ]),
    new Map(),
    [],
  );
  assert.deepEqual(visible, []);
  assert.deepEqual(frequentShellLinks(visible, "subcon"), []);
});

test("module thử nghiệm tắt mặc định, override bật tường minh vẫn thắng", () => {
  const trial = { ...moduleDef, thuNghiem: true };
  const defaults = resolveShellNavigation(tree, "admin", new Map(), new Map(), [trial]);
  assert.ok(!shellNavLinks(defaults).some((item) => item.href === "/my-tasks"));
  const enabled = resolveShellNavigation(tree, "admin", new Map(), new Map([["field", true]]), [
    trial,
  ]);
  assert.ok(shellNavLinks(enabled).some((item) => item.href === "/my-tasks"));
});

test("mỗi vai trò có 6 lối tắt duy nhất từ cây thật; hiện trường ưu tiên việc của tôi", () => {
  for (const role of ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"]) {
    const visible = resolveShellNavigation(DASHBOARD_TREE, role, new Map(), new Map());
    const frequent = frequentShellLinks(visible, role);
    assert.equal(frequent.length, 6, role);
    assert.equal(new Set(frequent.map((item) => item.href)).size, 6, role);
    assert.ok(
      frequent.every((item) => shellNavLinks(visible).some((leaf) => leaf.href === item.href)),
      role,
    );
    if (role === "engineer" || role === "subcon") assert.equal(frequent[0].href, "/my-tasks");
  }
});

test("chưa có phiên không gợi ý link; link query riêng biệt và trùng href chỉ hiện một lần", () => {
  assert.deepEqual(resolveShellNavigation(tree, undefined, new Map(), new Map()), []);
  const duplicate: DashCluster[] = [
    {
      label: "Kho",
      dashboards: [
        { href: "/procurement?tab=inventory", label: "Kho", icon: FileText },
        { href: "/procurement?tab=orders", label: "Đơn hàng", icon: FileText },
        { href: "/procurement?tab=inventory", label: "Kho lần hai", icon: FileText },
      ],
    },
  ];
  assert.deepEqual(
    shellNavLinks(duplicate).map((item) => item.href),
    ["/procurement?tab=inventory", "/procurement?tab=orders"],
  );
});

test("kết quả API ẩn đúng capability tắt, giữ các nguồn nghiệp vụ chưa thuộc registry", () => {
  const hits = [
    "task",
    "package",
    "comment",
    "diary",
    "material",
    "document",
    "contract",
    "correspondence",
    "meeting",
    "ncr",
    "drawing",
  ].map((kind) => ({ kind, id: kind }));
  const disabled = new Map([
    ["tracking", false],
    ["field", false],
    ["materials", false],
    ["documents", false],
  ]);
  assert.deepEqual(
    enabledShellSearchHits(hits, disabled).map((hit) => hit.kind),
    ["contract", "correspondence", "meeting", "ncr", "drawing"],
  );
  assert.deepEqual(
    enabledShellSearchHits(hits, new Map()),
    hits,
    "mặc định bật giữ nguyên kết quả API",
  );
  const trackingOnly = enabledShellSearchHits(hits, new Map([["tracking", false]]));
  assert.ok(
    trackingOnly.some((hit) => hit.kind === "diary"),
    "tắt tracking không tắt nhật ký hiện trường",
  );
  assert.ok(
    !trackingOnly.some((hit) => ["task", "package", "comment"].includes(hit.kind)),
    "bình luận dẫn tới task cũng thuộc tracking",
  );
});

test("nav hồ sơ ẩn không chặn tìm tài liệu khi capability documents vẫn bật", () => {
  const settings = new Map([["dash.ho-so-du-an", false]]);
  const flags = new Map([["documents", true]]);
  const visible = resolveShellNavigation(DASHBOARD_TREE, "admin", settings, flags);
  assert.ok(!shellNavLinks(visible).some((item) => item.href === "/documents"));
  assert.deepEqual(enabledShellSearchHits([{ kind: "document", id: 136 }], flags), [
    { kind: "document", id: 136 },
  ]);
});

test("kết quả capability thử nghiệm tắt mặc định và nhận override bật", () => {
  const trial: ModuleDef = { ...moduleDef, key: "documents", thuNghiem: true };
  const hits = [{ kind: "document" }, { kind: "contract" }];
  assert.deepEqual(enabledShellSearchHits(hits, new Map(), [trial]), [{ kind: "contract" }]);
  assert.deepEqual(enabledShellSearchHits(hits, new Map([["documents", true]]), [trial]), hits);
});
