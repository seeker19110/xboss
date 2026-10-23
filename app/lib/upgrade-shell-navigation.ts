import type { DashCluster, DashNode } from "@/app/lib/dashboardTree";
import { MODULES, type ModuleDef } from "@/lib/nen/modules";
import type { Role } from "@/lib/nen/roles";

/** Một cây đã lọc cho cả menu đầy đủ, lối tắt và lệnh tìm kiếm; không tự tạo thêm quyền. */
export function resolveShellNavigation(
  tree: DashCluster[],
  role: string | undefined,
  navSettings: ReadonlyMap<string, boolean>,
  featureFlags: ReadonlyMap<string, boolean>,
  modules: readonly ModuleDef[] = MODULES,
): DashCluster[] {
  if (!role) return [];
  const hiddenHrefs = new Set(
    modules
      .filter((module) => !(featureFlags.get(module.key) ?? !module.thuNghiem))
      .flatMap((module) => module.nav.map((item) => item.href)),
  );
  function filterNode(node: DashNode): DashNode | null {
    if (node.roles && !node.roles.includes(role as Role)) return null;
    if (node.id && navSettings.get(node.id) === false) return null;
    if (node.href && hiddenHrefs.has(node.href)) return null;
    if (!node.children) return node;
    const children = node.children.map(filterNode).filter((child) => child !== null);
    return children.length ? { ...node, children } : null;
  }
  return tree
    .map((cluster) => ({
      ...cluster,
      dashboards: cluster.dashboards.map(filterNode).filter((node) => node !== null),
    }))
    .filter((cluster) => cluster.dashboards.length > 0);
}

export type ShellNavLink = DashNode & { href: string };

export function shellNavLinks(tree: DashCluster[]): ShellNavLink[] {
  const links = new Map<string, ShellNavLink>();
  function visit(node: DashNode) {
    if (node.href && !links.has(node.href)) links.set(node.href, node as ShellNavLink);
    node.children?.forEach(visit);
  }
  tree.forEach((cluster) => cluster.dashboards.forEach(visit));
  return [...links.values()];
}

const FIELD = ["/my-tasks", "/progress/acmv", "/approvals", "/diary", "/quality", "/work-fronts"];
const OFFICE = ["/", "/approvals", "/report", "/progress/acmv", "/boq", "/contracts"];
const READ_ONLY = ["/", "/report", "/progress/acmv", "/quality", "/documents", "/lookahead"];

/** Ưu tiên theo vai trò, nhưng chỉ chọn link thực sự còn trong cây đã lọc. */
export function frequentShellLinks(tree: DashCluster[], role: string | undefined): ShellNavLink[] {
  if (!role) return [];
  const available = shellNavLinks(tree);
  const byHref = new Map(available.map((link) => [link.href, link]));
  const preferred =
    role === "engineer" || role === "subcon"
      ? FIELD
      : role === "cdt" || role === "viewer"
        ? READ_ONLY
        : OFFICE;
  const ordered = [...preferred.flatMap((href) => byHref.get(href) ?? []), ...available];
  return [...new Map(ordered.map((link) => [link.href, link])).values()].slice(0, 6);
}

// Nguồn tại lib/tien-do/search.ts và task/package tại /api/search. Chỉ lọc capability
// thực sự có trong registry; ẩn một mục nav không có nghĩa cấm tìm hồ sơ của mục đó.
const SEARCH_MODULES: Record<string, string> = {
  task: "tracking",
  package: "tracking",
  comment: "tracking",
  diary: "field",
  material: "materials",
  document: "documents",
};

export function enabledShellSearchHits<T extends { kind: string }>(
  hits: readonly T[],
  featureFlags: ReadonlyMap<string, boolean>,
  modules: readonly ModuleDef[] = MODULES,
): T[] {
  return hits.filter((hit) => {
    const moduleKey = SEARCH_MODULES[hit.kind];
    if (!moduleKey) return true; // Quyền xem từng nguồn vẫn do API search kiểm tra.
    const definition = modules.find((module) => module.key === moduleKey);
    return featureFlags.get(moduleKey) ?? !definition?.thuNghiem;
  });
}
