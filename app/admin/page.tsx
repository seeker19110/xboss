"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Users,
  AlertCircle,
  History,
  Filter,
  ChevronsUpDown,
  ChevronsDown,
  Activity,
  Circle,
  CalendarClock,
  HardDrive,
  LayoutDashboard,
  Building2,
  Trash2,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { appConfirm } from "@/app/components/dialogs";
import { fetchMe } from "@/app/lib/me";
import { ROLE_LABELS } from "@/lib/roles";
import { DASHBOARD_TREE, dashboardStatus } from "@/app/lib/dashboardTree";
import { systemColorClasses } from "@/lib/systemColors";

type User = { id: number; name: string; role: string };
type Sheet = {
  id: number;
  code: string;
  name: string;
  slug: string;
  managerId: number | null;
  managerName: string | null;
};
type Pkg = {
  id: number;
  sheetId: number;
  code: string;
  name: string;
  floorLabel: string | null;
  assignedTo: number | null;
  assignedManual: boolean;
  assigneeName: string | null;
};
type Task = {
  id: number;
  packageId: number;
  code: string;
  name: string;
  assignedTo: number | null;
  assignedManual: boolean;
  assigneeName: string | null;
};
type Workload = Record<number, { total: number; delayed: number }>;
type ProjectRow = {
  id: number;
  name: string;
  code: string | null;
  status: "active" | "handover" | "closed";
  color: string | null;
  progressPercent: number;
  delayedCount: number;
};
const PROJECT_COLORS = ["zinc", "amber", "sky", "violet", "emerald", "rose"] as const;
type AuditRow = {
  id: number;
  level: string;
  targetLabel: string;
  isManual: boolean;
  changedAt: string;
  prevUser: string | null;
  newUser: string | null;
  changedBy: string | null;
};
type TrafficEntry = {
  id: number;
  ts: number;
  method: string;
  path: string;
  ip: string;
  ua: string;
};

const ROLE_LABEL: Record<string, string> = ROLE_LABELS;
const LEVEL_LABEL: Record<string, string> = { sheet: "Hệ", package: "Nhóm", task: "Task" };

function fmtDt(s: string) {
  const d = new Date(s);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

export default function AdminPage() {
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [tab, setTab] = useState<"assign" | "nav" | "projects" | "audit" | "traffic">("assign");
  const [traffic, setTraffic] = useState<TrafficEntry[]>([]);
  const [trafficLive, setTrafficLive] = useState(false);
  const trafficLatestRef = useRef(0);
  const [users, setUsers] = useState<User[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workload, setWorkload] = useState<Workload>({});
  const [openSheets, setOpenSheets] = useState<Set<number>>(new Set());
  const [openPkgs, setOpenPkgs] = useState<Set<number>>(new Set());
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  // audit
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const AUDIT_LIMIT = 30;
  const [storage, setStorage] = useState<{ bytes: number; files: number; warn: boolean } | null>(
    null,
  );
  // Hiển thị AppShell (M21 PR3): bật/tắt dashboard trong sidebar.
  const [navSettings, setNavSettings] = useState<Record<string, boolean>>({});
  const [navLoading, setNavLoading] = useState(false);
  // Quản lý dự án + gán user (M22 PR2).
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  // cloneFrom: id dự án nguồn để sao chép cấu hình ("" = tạo trống, không sao chép).
  const [newProject, setNewProject] = useState({ name: "", code: "", color: "", cloneFrom: "" });
  const [assignUserId, setAssignUserId] = useState<number | null>(null);
  const [userProjectIds, setUserProjectIds] = useState<Set<number>>(new Set());
  const [userProjectsMap, setUserProjectsMap] = useState<Record<number, number[]>>({});

  const loadAssign = useCallback((unassignedOnly = false) => {
    const q = unassignedOnly ? "?unassignedOnly=1" : "";
    fetch(`/api/admin/assignments${q}`)
      .then((r) => r.json())
      .then((j) => {
        setSheets(j.sheets ?? []);
        setPackages(j.packages ?? []);
        setTasks(j.tasks ?? []);
        setWorkload(j.workload ?? {});
      });
  }, []);

  const loadAudit = useCallback((page = 0) => {
    fetch(`/api/admin/audit?limit=${AUDIT_LIMIT}&offset=${page * AUDIT_LIMIT}`)
      .then((r) => r.json())
      .then((j) => {
        setAudit(j.rows ?? []);
        setAuditTotal(j.total ?? 0);
      });
  }, []);

  const loadNav = useCallback(() => {
    setNavLoading(true);
    fetch("/api/nav-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setNavSettings(j.settings ?? {}))
      .finally(() => setNavLoading(false));
  }, []);

  const loadProjects = useCallback(() => {
    setProjectsLoading(true);
    Promise.all([
      fetch("/api/projects").then((r) => (r.ok ? r.json() : { projects: [] })),
      fetch("/api/user-projects").then((r) => (r.ok ? r.json() : { assignments: [] })),
    ])
      .then(([projRes, assignRes]) => {
        setProjects(projRes.projects ?? []);
        const map: Record<number, number[]> = {};
        for (const a of assignRes.assignments ?? []) {
          (map[a.userId] ??= []).push(a.projectId);
        }
        setUserProjectsMap(map);
      })
      .finally(() => setProjectsLoading(false));
  }, []);

  useEffect(() => {
    if (assignUserId != null) setUserProjectIds(new Set(userProjectsMap[assignUserId] ?? []));
  }, [assignUserId, userProjectsMap]);

  useEffect(() => {
    fetchMe().then((user) => {
      if (!user) return;
      setMe(user);
      if (user.role === "admin" || user.role === "pm") {
        fetch("/api/users")
          .then((r) => r.json())
          .then((j) => setUsers(j.users ?? []));
        loadAssign();
      }
    });
  }, [loadAssign]);

  useEffect(() => {
    if (tab === "audit") loadAudit(auditPage);
  }, [tab, auditPage, loadAudit]);

  useEffect(() => {
    if (tab === "nav") loadNav();
  }, [tab, loadNav]);

  useEffect(() => {
    if (tab === "projects") loadProjects();
  }, [tab, loadProjects]);

  // SSE traffic: kết nối khi chuyển sang tab traffic (chỉ Admin), đóng khi rời.
  useEffect(() => {
    if (tab !== "traffic" || me?.role !== "admin") return;
    setTrafficLive(true);
    const since = trafficLatestRef.current;
    const es = new EventSource(`/api/admin/traffic/events${since ? `?since=${since}` : ""}`);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { entries: TrafficEntry[]; latestId: number };
        if (msg.latestId) trafficLatestRef.current = msg.latestId;
        setTraffic((prev) => {
          const merged = [...msg.entries, ...prev].slice(0, 300);
          return merged;
        });
      } catch {
        /* bỏ qua frame lỗi */
      }
    };
    es.onerror = () => setTrafficLive(false);
    return () => {
      es.close();
      setTrafficLive(false);
    };
  }, [tab, me?.role]);

  // Dung lượng data/uploads/ — chỉ gọi 1 lần khi mở tab traffic (Admin), không cần realtime.
  useEffect(() => {
    if (tab !== "traffic" || me?.role !== "admin") return;
    fetch("/api/admin/storage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStorage(d))
      .catch(() => {});
  }, [tab, me?.role]);

  function flash(msg: string) {
    setOkMsg(msg);
    setError("");
    setTimeout(() => setOkMsg(""), 3000);
  }

  async function assign(
    level: "sheet" | "package" | "task",
    id: number,
    userId: number | null,
    label: string,
  ) {
    try {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, id, userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Lỗi không xác định");
        return;
      }
      flash(
        userId === null
          ? level === "sheet"
            ? `Đã bỏ quản lý ${label}`
            : `${label} trở về kế thừa`
          : `Đã phân công ${label}`,
      );
      loadAssign(filterUnassigned);
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    }
  }

  async function toggleNav(nodeKey: string, next: boolean) {
    const prevValue = navSettings[nodeKey];
    setNavSettings((prev) => ({ ...prev, [nodeKey]: next })); // optimistic
    try {
      const res = await fetch("/api/nav-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeKey, enabled: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Lỗi không xác định");
        setNavSettings((prev) => ({ ...prev, [nodeKey]: prevValue }));
        return;
      }
      flash(`Đã ${next ? "bật" : "tắt"} mục menu`);
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
      setNavSettings((prev) => ({ ...prev, [nodeKey]: prevValue }));
    }
  }

  async function createProject() {
    const name = newProject.name.trim();
    if (!name) {
      setError("Thiếu tên dự án");
      return;
    }
    try {
      // Có chọn dự án nguồn → sao chép cấu hình; không thì tạo dự án trống như cũ.
      const url = newProject.cloneFrom
        ? `/api/projects/${newProject.cloneFrom}/clone-config`
        : "/api/projects";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: newProject.code.trim() || undefined,
          color: newProject.color || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Lỗi không xác định");
        return;
      }
      flash(
        newProject.cloneFrom ? `Đã sao chép cấu hình sang "${name}"` : `Đã tạo dự án "${name}"`,
      );
      setNewProject({ name: "", code: "", color: "", cloneFrom: "" });
      loadProjects();
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    }
  }

  async function updateProject(id: number, patch: Partial<Pick<ProjectRow, "status" | "color">>) {
    const prev = projects;
    setProjects((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))); // optimistic
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Lỗi không xác định");
        setProjects(prev);
        return;
      }
      flash("Đã cập nhật dự án");
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
      setProjects(prev);
    }
  }

  async function deleteProject(id: number, name: string) {
    if (!(await appConfirm(`Xoá dự án "${name}"? Chỉ xoá được khi dự án chưa có dữ liệu.`))) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Lỗi không xác định");
        return;
      }
      flash(`Đã xoá dự án "${name}"`);
      loadProjects();
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    }
  }

  async function saveUserProjects() {
    if (assignUserId == null) return;
    try {
      const res = await fetch("/api/user-projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: assignUserId, projectIds: [...userProjectIds] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Lỗi không xác định");
        return;
      }
      flash("Đã lưu dự án được gán");
      setUserProjectsMap((m) => ({ ...m, [assignUserId]: [...userProjectIds] }));
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    }
  }

  function toggleFilter() {
    const next = !filterUnassigned;
    setFilterUnassigned(next);
    loadAssign(next);
    // Mở rộng tất cả khi lọc chưa gán để dễ xử lý.
    if (next) {
      setOpenSheets(new Set(sheets.map((s) => s.id)));
      setOpenPkgs(new Set(packages.map((p) => p.id)));
    }
  }

  function expandAll() {
    setOpenSheets(new Set(sheets.map((s) => s.id)));
    setOpenPkgs(new Set(packages.map((p) => p.id)));
  }
  function collapseAll() {
    setOpenSheets(new Set());
    setOpenPkgs(new Set());
  }

  function toggle(set: Set<number>, id: number, fn: (s: Set<number>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    fn(next);
  }

  // Tính minWidth của badge workload từ giá trị lớn nhất trong tất cả các hàng,
  // giúp cột căn đều dù số task/trễ chênh lệch nhiều.
  const wlBadgeMinW = useMemo(() => {
    const vals = Object.values(workload);
    if (!vals.length) return undefined;
    const maxTotal = Math.max(...vals.map((w) => w.total));
    const maxDelayed = Math.max(...vals.map((w) => w.delayed));
    const sample = `${maxTotal} task${maxDelayed > 0 ? ` · ${maxDelayed} trễ` : ""}`;
    return `${sample.length * 6 + 16}px`; // ~6px/ký tự ở text-[11px] + padding
  }, [workload]);

  function WorkloadBadge({ userId }: { userId: number | null }) {
    if (!userId) return null;
    const wl = workload[userId];
    if (!wl) return null;
    return (
      <span
        style={{ minWidth: wlBadgeMinW }}
        className="flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 bg-zinc-800 text-zinc-400 shrink-0"
      >
        {wl.total} task
        {wl.delayed > 0 && <span className="text-red-400 font-semibold">· {wl.delayed} trễ</span>}
      </span>
    );
  }

  function UserSelect({
    value,
    onChange,
    label,
  }: {
    value: number | null;
    onChange: (v: number | null) => void;
    label: string;
  }) {
    return (
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        aria-label={label}
        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm w-[200px] shrink-0"
      >
        <option value="">— Kế thừa / chưa gán —</option>
        {users.map((u) => {
          const wl = workload[u.id];
          const suffix = wl ? ` [${wl.total}${wl.delayed > 0 ? `·${wl.delayed}⚠` : ""}]` : "";
          return (
            <option key={u.id} value={u.id}>
              {u.name} ({ROLE_LABEL[u.role] ?? u.role}){suffix}
            </option>
          );
        })}
      </select>
    );
  }

  if (me && me.role !== "admin" && me.role !== "pm") {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">
          Chỉ Admin/PM được truy cập.{" "}
          <Link href="/" className="text-emerald-400 hover:underline">
            ← Dashboard
          </Link>
        </p>
      </div>
    );
  }

  const unassignedCount = tasks.filter((t) => !t.assignedTo).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        back
        title={
          <>
            <ShieldCheck className="w-5 h-5 text-emerald-400" /> Quản trị
          </>
        }
        search={false}
      >
        <a
          href="/lookahead"
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-rose-400 shrink-0"
        >
          <CalendarClock className="w-4 h-4" /> Kế hoạch 2 tuần
        </a>
        {me?.role === "admin" && (
          <a
            href="/users"
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-emerald-400 shrink-0"
          >
            <Users className="w-4 h-4" /> Người dùng
          </a>
        )}
      </AppHeader>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        <div
          className="flex gap-1 border-b border-zinc-800 overflow-x-auto scrollbar-none"
          role="tablist"
        >
          {(
            [
              ["assign", "Phân công", null],
              ["nav", "Hiển thị AppShell", "nav"],
              ["projects", "Dự án", "projects"],
              ["audit", "Lịch sử", "audit"],
              ["traffic", "Traffic", "traffic"],
            ] as const
          )
            .filter(([key]) => key !== "traffic" || me?.role === "admin")
            .filter(([key]) => key !== "projects" || me?.role === "admin")
            .map(([key, label, icon]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key as "assign" | "nav" | "projects" | "audit" | "traffic")}
                className={`px-3 py-2 text-sm flex items-center gap-1 border-b-2 shrink-0 transition ${tab === key ? "border-emerald-500 text-white" : "border-transparent text-zinc-400 hover:text-white"}`}
              >
                {icon === "nav" && <LayoutDashboard className="w-3.5 h-3.5" />}
                {icon === "projects" && <Building2 className="w-3.5 h-3.5" />}
                {icon === "audit" && <History className="w-3.5 h-3.5" />}
                {icon === "traffic" && <Activity className="w-3.5 h-3.5" />}
                {label}
              </button>
            ))}
        </div>

        {error && (
          <p className="text-sm text-red-200 bg-red-950 border border-red-900 rounded px-3 py-2">
            {error}
          </p>
        )}
        {okMsg && (
          <p className="text-sm text-emerald-200 bg-emerald-950 border border-emerald-900 rounded px-3 py-2">
            {okMsg}
          </p>
        )}

        {/* ========== TAB PHÂN CÔNG ========== */}
        {tab === "assign" && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-zinc-400 flex-1">
                Gán người quản lý cho <b>hệ</b> — nhóm và task bên trong <b>kế thừa tự động</b>. Gán
                riêng ở cấp nhóm/task sẽ thoát kế thừa (
                <span className="text-amber-400">thủ công</span>); bấm{" "}
                <RotateCcw className="w-3 h-3 inline" /> để đưa về kế thừa.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={expandAll}
                  title="Mở rộng tất cả"
                  className="text-zinc-500 hover:text-white p-1"
                >
                  <ChevronsDown className="w-4 h-4" />
                </button>
                <button
                  onClick={collapseAll}
                  title="Thu gọn tất cả"
                  className="text-zinc-500 hover:text-white p-1"
                >
                  <ChevronsUpDown className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleFilter}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border transition ${filterUnassigned ? "bg-amber-950 border-amber-700 text-amber-200" : "border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"}`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Chưa gán{unassignedCount > 0 && !filterUnassigned ? ` (${unassignedCount})` : ""}
                </button>
              </div>
            </div>

            {sheets.map((sheet) => {
              const pkgs = packages.filter((p) => p.sheetId === sheet.id);
              const open = openSheets.has(sheet.id);
              const sheetUnassigned = !sheet.managerId;
              return (
                <div
                  key={sheet.id}
                  className={`border rounded-lg overflow-hidden ${sheetUnassigned && filterUnassigned ? "border-amber-800/50" : "border-zinc-800"}`}
                >
                  <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/70 flex-wrap">
                    <button
                      onClick={() => toggle(openSheets, sheet.id, setOpenSheets)}
                      aria-label={open ? `Thu gọn hệ ${sheet.code}` : `Mở rộng hệ ${sheet.code}`}
                      className="text-zinc-400 hover:text-white shrink-0"
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate flex items-center gap-2">
                        {sheet.code} — {sheet.name}
                        {sheetUnassigned && (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                      </p>
                      <p className="text-xs text-zinc-400 flex items-center gap-2">
                        {pkgs.length} nhóm · Quản lý:{" "}
                        {sheet.managerName ?? <span className="text-zinc-400">chưa gán</span>}
                        {sheet.managerId && <WorkloadBadge userId={sheet.managerId} />}
                      </p>
                    </div>
                    {sheet.managerId && (
                      <button
                        title="Bỏ quản lý hệ"
                        onClick={() => assign("sheet", sheet.id, null, `hệ ${sheet.code}`)}
                        className="text-zinc-500 hover:text-red-400 shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <UserSelect
                      value={sheet.managerId}
                      onChange={(v) => assign("sheet", sheet.id, v, `hệ ${sheet.code}`)}
                      label={`Người quản lý hệ ${sheet.code}`}
                    />
                  </div>

                  {open && (
                    <div className="divide-y divide-zinc-800/60">
                      {pkgs.map((pkg) => {
                        const pkgTasks = tasks.filter((t) => t.packageId === pkg.id);
                        const pOpen = openPkgs.has(pkg.id);
                        const pkgHasUnassigned = pkgTasks.some((t) => !t.assignedTo);
                        return (
                          <div key={pkg.id}>
                            <div className="flex items-center gap-3 pl-10 pr-4 py-2 bg-zinc-950 flex-wrap">
                              <button
                                onClick={() => toggle(openPkgs, pkg.id, setOpenPkgs)}
                                aria-label={
                                  pOpen ? `Thu gọn nhóm ${pkg.code}` : `Mở rộng nhóm ${pkg.code}`
                                }
                                className="text-zinc-500 hover:text-white shrink-0"
                              >
                                {pOpen ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate flex items-center gap-1.5">
                                  {pkg.code} — {pkg.name}
                                  {pkg.floorLabel ? ` (${pkg.floorLabel})` : ""}
                                  {pkgHasUnassigned && filterUnassigned && (
                                    <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                                  )}
                                </p>
                              </div>
                              {pkg.assignedManual ? (
                                <span className="text-[11px] text-amber-400 border border-amber-900 rounded px-1.5 py-0.5 shrink-0">
                                  thủ công
                                </span>
                              ) : (
                                <span className="text-[11px] text-zinc-400 border border-zinc-800 rounded px-1.5 py-0.5 shrink-0">
                                  kế thừa
                                </span>
                              )}
                              {pkg.assignedManual && (
                                <button
                                  title="Về kế thừa từ quản lý hệ"
                                  onClick={() =>
                                    assign("package", pkg.id, null, `nhóm ${pkg.code}`)
                                  }
                                  className="text-zinc-500 hover:text-emerald-400 shrink-0"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <WorkloadBadge userId={pkg.assignedTo} />
                              <UserSelect
                                value={pkg.assignedTo}
                                onChange={(v) => assign("package", pkg.id, v, `nhóm ${pkg.code}`)}
                                label={`Người phụ trách nhóm ${pkg.code}`}
                              />
                            </div>

                            {pOpen &&
                              pkgTasks.map((t) => (
                                <div
                                  key={t.id}
                                  className={`flex items-center gap-3 pl-16 pr-4 py-1.5 flex-wrap ${!t.assignedTo && filterUnassigned ? "bg-amber-950/10" : "bg-zinc-950/60"}`}
                                >
                                  <p className="flex-1 min-w-0 text-sm text-zinc-300 truncate">
                                    {t.code} — {t.name}
                                  </p>
                                  {t.assignedManual ? (
                                    <span className="text-[11px] text-amber-400 border border-amber-900 rounded px-1.5 py-0.5 shrink-0">
                                      thủ công
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-zinc-400 border border-zinc-800 rounded px-1.5 py-0.5 shrink-0">
                                      kế thừa
                                    </span>
                                  )}
                                  {t.assignedManual && (
                                    <button
                                      title="Về kế thừa từ nhóm"
                                      onClick={() => assign("task", t.id, null, `task ${t.code}`)}
                                      className="text-zinc-500 hover:text-emerald-400 shrink-0"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <WorkloadBadge userId={t.assignedTo} />
                                  <UserSelect
                                    value={t.assignedTo}
                                    onChange={(v) => assign("task", t.id, v, `task ${t.code}`)}
                                    label={`Người phụ trách task ${t.code}`}
                                  />
                                </div>
                              ))}
                          </div>
                        );
                      })}
                      {pkgs.length === 0 && (
                        <p className="pl-10 py-3 text-sm text-zinc-400">
                          Sheet chưa có nhóm công việc.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {sheets.length === 0 && (
              <p className="text-center text-zinc-400 py-12">
                {filterUnassigned
                  ? "Tất cả task đã được gán người phụ trách 🎉"
                  : "Chưa có sheet nào."}
              </p>
            )}
          </>
        )}

        {/* ========== TAB HIỂN THỊ APPSHELL (M21 PR3) ========== */}
        {tab === "nav" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Bật/tắt dashboard hiển thị trong sidebar cho mọi người dùng. Mặc định mọi mục đều bật
              (kể cả badge &quot;Sắp có&quot; cho dashboard chưa có trang thật) — tắt ở đây để ẩn
              hẳn khỏi sidebar.
            </p>
            {navLoading && <p className="text-sm text-zinc-500">Đang tải…</p>}
            {DASHBOARD_TREE.map((cluster) => (
              <div
                key={cluster.label}
                className="rounded-lg border border-zinc-800 overflow-hidden"
              >
                <div className="px-4 py-2 border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {cluster.label}
                </div>
                <div className="divide-y divide-zinc-800/60">
                  {cluster.dashboards.map((dash) => {
                    if (!dash.id) return null;
                    const status = dashboardStatus(dash);
                    // Mặc định BẬT cho mọi trạng thái (kể cả "coming-soon") — xem lib/nav-settings.ts.
                    const enabled = navSettings[dash.id] ?? true;
                    return (
                      <button
                        key={dash.id}
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={`${enabled ? "Tắt" : "Bật"} mục "${dash.label}"`}
                        onClick={() => toggleNav(dash.id!, !enabled)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left min-h-10 hover:bg-zinc-900/60 transition"
                      >
                        <span className="flex-1 text-sm truncate">{dash.label}</span>
                        <span
                          className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 shrink-0 ${
                            status === "available"
                              ? "bg-emerald-950 text-emerald-200 border-emerald-800"
                              : "bg-zinc-800 text-amber-300 border-zinc-700"
                          }`}
                        >
                          {status === "available" ? "Đã có" : "Sắp có"}
                        </span>
                        <span
                          className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${
                            enabled ? "bg-emerald-600" : "bg-zinc-700"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                              enabled ? "translate-x-5" : ""
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ========== TAB QUẢN LÝ DỰ ÁN (M22 PR2) ========== */}
        {tab === "projects" && me?.role === "admin" && (
          <div className="space-y-6">
            {projectsLoading && <p className="text-sm text-zinc-500">Đang tải…</p>}

            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Danh sách dự án
              </div>
              <div className="divide-y divide-zinc-800/60">
                {projects.map((p) => {
                  const c = systemColorClasses(p.color);
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                      <div className="flex-1 min-w-[140px]">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        {p.code && <p className="text-xs text-zinc-500">{p.code}</p>}
                      </div>
                      <span className="text-xs tabular-nums text-zinc-400">
                        {Math.round(p.progressPercent * 100)}% · {p.delayedCount} trễ
                      </span>
                      <select
                        value={p.status}
                        aria-label={`Trạng thái dự án ${p.name}`}
                        onChange={(e) =>
                          updateProject(p.id, { status: e.target.value as ProjectRow["status"] })
                        }
                        className="bg-zinc-900 border border-zinc-700 rounded text-sm px-2 py-1"
                      >
                        <option value="active">Đang thi công</option>
                        <option value="handover">Đã bàn giao</option>
                        <option value="closed">Đã đóng</option>
                      </select>
                      <select
                        value={p.color ?? ""}
                        aria-label={`Màu nhận diện dự án ${p.name}`}
                        onChange={(e) => updateProject(p.id, { color: e.target.value || null })}
                        className="bg-zinc-900 border border-zinc-700 rounded text-sm px-2 py-1"
                      >
                        <option value="">Mặc định</option>
                        {PROJECT_COLORS.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => deleteProject(p.id, p.name)}
                        aria-label={`Xoá dự án ${p.name}`}
                        className="p-1.5 rounded text-zinc-500 hover:text-red-300 hover:bg-red-950/40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                {projects.length === 0 && !projectsLoading && (
                  <p className="px-4 py-4 text-sm text-zinc-500">Chưa có dự án nào.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Tạo dự án mới
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={newProject.name}
                  onChange={(e) => setNewProject((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Tên dự án"
                  aria-label="Tên dự án mới"
                  className="bg-zinc-900 border border-zinc-700 rounded text-sm px-2 py-1.5 flex-1 min-w-[160px]"
                />
                <input
                  value={newProject.code}
                  onChange={(e) => setNewProject((s) => ({ ...s, code: e.target.value }))}
                  placeholder="Mã (tuỳ chọn)"
                  aria-label="Mã dự án mới"
                  className="bg-zinc-900 border border-zinc-700 rounded text-sm px-2 py-1.5 w-32"
                />
                <select
                  value={newProject.color}
                  onChange={(e) => setNewProject((s) => ({ ...s, color: e.target.value }))}
                  aria-label="Màu nhận diện dự án mới"
                  className="bg-zinc-900 border border-zinc-700 rounded text-sm px-2 py-1.5"
                >
                  <option value="">Màu mặc định</option>
                  {PROJECT_COLORS.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
                <button
                  onClick={createProject}
                  className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-sm text-on-accent"
                >
                  {newProject.cloneFrom ? "Sao chép & tạo" : "Tạo dự án"}
                </button>
              </div>
              {/* Bước sao chép cấu hình từ dự án có sẵn (M51 PR3) — tháp/sheet/hệ,
                  nav, luồng duyệt, ngưỡng cảnh báo; KHÔNG chép dữ liệu thi công. */}
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="clone-from" className="text-xs text-zinc-400">
                  Sao chép cấu hình từ dự án có sẵn
                </label>
                <select
                  id="clone-from"
                  value={newProject.cloneFrom}
                  onChange={(e) => setNewProject((s) => ({ ...s, cloneFrom: e.target.value }))}
                  aria-label="Dự án nguồn để sao chép cấu hình"
                  className="bg-zinc-900 border border-zinc-700 rounded text-sm px-2 py-1.5 min-w-[180px]"
                >
                  <option value="">Không sao chép (dự án trống)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.code ? ` (${p.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Gán user ↔ dự án
              </p>
              <p className="text-sm text-zinc-400">
                Chưa gán ai (bảng rỗng) = mọi user thấy mọi dự án. Gán ít nhất 1 user thì các user
                chưa được gán sẽ không thấy dự án nào cho tới khi được gán.
              </p>
              <select
                value={assignUserId ?? ""}
                onChange={(e) => setAssignUserId(e.target.value ? Number(e.target.value) : null)}
                aria-label="Chọn người dùng để gán dự án"
                className="bg-zinc-900 border border-zinc-700 rounded text-sm px-2 py-1.5"
              >
                <option value="">— Chọn người dùng —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({ROLE_LABEL[u.role] ?? u.role})
                  </option>
                ))}
              </select>
              {assignUserId != null && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {projects.map((p) => {
                      const checked = userProjectIds.has(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer min-h-10 ${
                            checked
                              ? "border-emerald-700 bg-emerald-950 text-emerald-200"
                              : "border-zinc-700 text-zinc-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setUserProjectIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(p.id);
                                else next.delete(p.id);
                                return next;
                              })
                            }
                          />
                          {p.name}
                        </label>
                      );
                    })}
                  </div>
                  <button
                    onClick={saveUserProjects}
                    className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-sm text-on-accent"
                  >
                    Lưu dự án được gán
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== TAB LỊCH SỬ PHÂN CÔNG ========== */}
        {tab === "audit" && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Toàn bộ thay đổi phân công — ai gán ai, lúc nào. Tổng:{" "}
              <b className="text-white">{auditTotal}</b> bản ghi.
            </p>
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Thời gian</th>
                    <th className="px-4 py-2 text-left">Cấp</th>
                    <th className="px-4 py-2 text-left">Đối tượng</th>
                    <th className="px-4 py-2 text-left">Trước</th>
                    <th className="px-4 py-2 text-left">Sau</th>
                    <th className="px-4 py-2 text-left">Người gán</th>
                    <th className="px-4 py-2 text-left">Loại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {audit.map((row) => (
                    <tr
                      key={row.id}
                      className="odd:bg-zinc-900/50 even:bg-zinc-800/20 hover:bg-zinc-700/40 transition-colors"
                    >
                      <td className="px-4 py-2 text-zinc-400 whitespace-nowrap">
                        {fmtDt(row.changedAt)}
                      </td>
                      <td className="px-4 py-2 text-zinc-300">
                        {LEVEL_LABEL[row.level] ?? row.level}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-200">
                        {row.targetLabel}
                      </td>
                      <td className="px-4 py-2 text-zinc-400">
                        {row.prevUser ?? <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="px-4 py-2 text-emerald-400">
                        {row.newUser ?? <span className="text-zinc-400">bỏ gán</span>}
                      </td>
                      <td className="px-4 py-2 text-zinc-400">{row.changedBy}</td>
                      <td className="px-4 py-2">
                        {row.isManual ? (
                          <span className="text-[11px] text-amber-400 border border-amber-900 rounded px-1.5 py-0.5">
                            thủ công
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-400 border border-zinc-800 rounded px-1.5 py-0.5">
                            kế thừa
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {audit.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                        Chưa có lịch sử phân công.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Phân trang audit */}
            {auditTotal > AUDIT_LIMIT && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-zinc-400">
                  Trang {auditPage + 1} / {Math.ceil(auditTotal / AUDIT_LIMIT)}
                </span>
                <button
                  disabled={auditPage === 0}
                  onClick={() => setAuditPage((p) => p - 1)}
                  className="px-3 py-1 text-sm rounded border border-zinc-700 disabled:opacity-30 hover:bg-zinc-800"
                >
                  ← Trước
                </button>
                <button
                  disabled={(auditPage + 1) * AUDIT_LIMIT >= auditTotal}
                  onClick={() => setAuditPage((p) => p + 1)}
                  className="px-3 py-1 text-sm rounded border border-zinc-700 disabled:opacity-30 hover:bg-zinc-800"
                >
                  Sau →
                </button>
              </div>
            )}
          </div>
        )}
        {/* ========== TAB TRAFFIC ========== */}
        {tab === "traffic" && me?.role === "admin" && (
          <div className="space-y-3">
            {storage && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  storage.warn
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                    : "border-zinc-800 text-zinc-400"
                }`}
              >
                <HardDrive className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Dung lượng <code className="text-zinc-300">data/uploads/</code>:{" "}
                  <b className="text-white">{(storage.bytes / 1024 / 1024).toFixed(1)} MB</b>
                  {" · "}
                  {storage.files} file
                  {storage.warn && " — sắp hết dung lượng, cân nhắc dọn bớt hoặc tăng ổ đĩa"}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Circle
                className={`w-2.5 h-2.5 ${trafficLive ? "text-emerald-400 animate-pulse" : "text-zinc-600"}`}
                fill="currentColor"
              />
              <span className="text-sm text-zinc-400">
                {trafficLive ? "Đang nhận live — " : "Ngắt kết nối — "}
                <b className="text-white">{traffic.length}</b> request gần nhất
              </span>
              <button
                onClick={() => setTraffic([])}
                className="ml-auto text-xs text-zinc-400 hover:text-red-400 px-2 py-1 border border-zinc-800 rounded"
              >
                Xóa
              </button>
            </div>
            <div className="rounded-lg border border-zinc-800 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-36">Thời gian</th>
                    <th className="px-3 py-2 text-left w-16">Method</th>
                    <th className="px-3 py-2 text-left">Endpoint</th>
                    <th className="px-3 py-2 text-left w-32">IP</th>
                    <th className="px-3 py-2 text-left w-48">User-Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {traffic.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                        Chưa có traffic. Thực hiện bất kỳ thao tác nào để thấy request xuất hiện ở
                        đây.
                      </td>
                    </tr>
                  )}
                  {traffic.map((t) => (
                    <tr
                      key={t.id}
                      className="odd:bg-zinc-900/40 hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="px-3 py-1.5 text-zinc-400 text-xs whitespace-nowrap font-mono">
                        {new Date(t.ts).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          fractionalSecondDigits: 3,
                        })}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span
                          className={`text-xs font-bold font-mono ${t.method === "GET" ? "text-sky-400" : t.method === "POST" ? "text-emerald-400" : t.method === "DELETE" ? "text-red-400" : "text-amber-400"}`}
                        >
                          {t.method}
                        </span>
                      </td>
                      <td
                        className="px-3 py-1.5 font-mono text-xs text-zinc-200 max-w-xs truncate"
                        title={t.path}
                      >
                        {t.path}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-zinc-400 font-mono">{t.ip || "—"}</td>
                      <td
                        className="px-3 py-1.5 text-xs text-zinc-400 truncate max-w-[12rem]"
                        title={t.ua}
                      >
                        {t.ua
                          ? t.ua
                              .replace(/\s*\([^)]*\)/g, "")
                              .trim()
                              .slice(0, 60)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
