"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Star, LayoutGrid, Search } from "lucide-react";
import { systemColorClasses } from "@/lib/systemColors";
import type { ProjectListItem } from "@/lib/projects";

const PINNED_KEY = "xboss_pinned";
const FILTER_THRESHOLD = 7;

const STATUS_LABEL: Record<string, string> = {
  active: "Đang thi công",
  handover: "Đã bàn giao",
  closed: "Đã đóng",
};

function loadPinned(): number[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Trigger đỉnh sidebar (chấm màu + tên + chevron) + panel chọn dự án — theo
// docs/ke-hoach-appshell-full-ia-2026-07.md §4.1b. Nguồn dữ liệu GET /api/projects
// (đã tôn trọng user_projects — M22). Chọn dự án = POST /api/project/select (cookie)
// rồi reload để mọi phần server-scoped (API) đọc lại đúng dự án mới.
export default function ProjectSwitcher({ collapsed }: { collapsed: boolean }) {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [current, setCurrentCookie] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [pinned, setPinned] = useState<number[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  // onKey bên dưới đăng ký 1 lần (mount) nên đọc `open` trực tiếp sẽ bị đóng băng giá trị
  // cũ (stale closure) — dùng ref cập nhật mỗi render để luôn đọc đúng trạng thái hiện tại.
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    setPinned(loadPinned());
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setProjects(data?.projects ?? []))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )xboss_project=([^;]+)/);
    setCurrentCookie(match ? Number(match[1]) : null);
  }, [projects]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      // stopImmediatePropagation: trên mobile, panel này còn nằm trong drawer sidebar
      // (Modal — M37 PR2.4), Modal cũng lắng nghe Escape trên document để tự đóng. Không
      // chặn thì 1 lần Esc đóng luôn cả drawer thay vì chỉ đóng panel chọn dự án trước.
      if (e.key === "Escape" && openRef.current) {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => filterRef.current?.focus(), 0);
    else setFilter("");
  }, [open]);

  function togglePin(id: number, e: React.SyntheticEvent) {
    e.stopPropagation();
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      try {
        localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }

  async function select(id: number) {
    if (id === effectiveCurrentId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/project/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      if (res.ok) {
        try {
          localStorage.setItem("xboss_project", String(id));
        } catch {
          /* private mode */
        }
        window.location.reload();
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const filtered = useMemo(() => {
    const list = projects ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.code ?? "").toLowerCase().includes(q),
    );
  }, [projects, filter]);

  const pinnedList = filtered.filter((p) => pinned.includes(p.id));
  const activeList = filtered.filter((p) => !pinned.includes(p.id) && p.status === "active");
  const closedList = filtered.filter((p) => !pinned.includes(p.id) && p.status !== "active");
  const flatOrder = [...pinnedList, ...activeList, ...closedList];
  const showGroups = filtered.length > 5 && (pinnedList.length > 0 || closedList.length > 0);

  // Cookie có thể chưa được đặt (chưa từng chọn dự án) hoặc trỏ dự án không còn thấy được
  // — server (getCurrentProjectId) mặc định về dự án đầu trong danh sách thấy được trong
  // trường hợp này (lib/projects.ts::resolveProjectId), nên client hiển thị đúng y vậy
  // thay vì rơi về placeholder "XBoss".
  const list = projects ?? [];
  const currentProject = list.find((p) => p.id === current) ?? list[0];
  const effectiveCurrentId = currentProject?.id;
  const c = systemColorClasses(currentProject?.color);

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flatOrder.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = flatOrder[activeIdx];
      if (p) select(p.id);
    } else if (e.key.toLowerCase() === "p") {
      // Phím tắt ghim/bỏ ghim dự án đang chọn bằng bàn phím — nút ghim trong mỗi hàng
      // là <span> (không phải phần tử tương tác lồng trong role="option", tránh vi phạm
      // a11y "nested-interactive") nên cần lối vào bàn phím riêng ở đây.
      e.preventDefault();
      const p = flatOrder[activeIdx];
      if (p) togglePin(p.id, e);
    }
  }

  function row(p: ProjectListItem, idx: number) {
    const cc = systemColorClasses(p.color);
    const isCurrent = p.id === effectiveCurrentId;
    const isPinned = pinned.includes(p.id);
    return (
      <div
        key={p.id}
        role="option"
        aria-selected={isCurrent}
        tabIndex={-1}
        onClick={() => select(p.id)}
        className={`flex items-center gap-2 px-3 py-2 min-h-10 rounded-lg cursor-pointer text-sm ${
          isCurrent ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-900"
        } ${idx === activeIdx ? "ring-1 ring-inset ring-emerald-500/60" : ""} ${
          p.status !== "active" ? "opacity-60" : ""
        }`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${cc.dot}`} aria-hidden="true" />
        <span className="truncate flex-1">{p.name}</span>
        {p.delayedCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-200 border border-rose-800 shrink-0">
            {p.delayedCount} trễ
          </span>
        )}
        <span className="tabular-nums text-xs text-zinc-400 shrink-0 w-9 text-right">
          {Math.round(p.progressPercent * 100)}%
        </span>
        {isCurrent && (
          <span className="text-emerald-400 shrink-0" aria-hidden="true">
            ✓
          </span>
        )}
        {/* Không dùng <button> — lồng phần tử tương tác trong role="option" vi phạm a11y
            "nested-interactive" dù đã tabIndex={-1} (AT vẫn có thể focus tới). Chỉ còn
            thao tác chuột/chạm ở đây; bàn phím ghim/bỏ ghim qua phím "P" ở onListKey. */}
        <span
          onClick={(e) => togglePin(p.id, e)}
          aria-hidden="true"
          title={isPinned ? `Bỏ ghim ${p.name}` : `Ghim ${p.name}`}
          className="shrink-0 p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-amber-400"
        >
          <Star className={`w-3.5 h-3.5 ${isPinned ? "fill-amber-400 text-amber-400" : ""}`} />
        </span>
      </div>
    );
  }

  if (projects === null) {
    return (
      <div className="flex items-center gap-2 h-12 px-3 border-b border-zinc-800 shrink-0">
        <div className="w-5 h-5 rounded-full bg-zinc-800 animate-pulse shrink-0" />
        <span className="sidebar-label text-sm font-bold truncate text-zinc-400">Đang tải…</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative border-b border-zinc-800 shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        className="flex items-center gap-2 h-12 px-3 w-full text-left hover:bg-zinc-900/60 transition"
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} aria-hidden="true" />
        <span className="sidebar-label text-sm font-bold truncate flex-1">
          {currentProject?.name ?? "XBoss"}
        </span>
        <ChevronDown className="sidebar-label w-4 h-4 text-zinc-500 shrink-0" />
      </button>

      {open && (
        <div
          className={`z-50 bg-zinc-950 border border-zinc-800 rounded-xl shadow-xl overflow-hidden
            ${collapsed ? "absolute left-full top-0 ml-2 w-72" : "absolute left-2 right-2 top-full mt-1"}`}
        >
          {(projects?.length ?? 0) > FILTER_THRESHOLD && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
              <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <input
                ref={filterRef}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Tìm dự án…"
                aria-label="Tìm dự án"
                className="bg-transparent text-sm outline-none flex-1 text-zinc-200 placeholder:text-zinc-500"
              />
            </div>
          )}

          {/* role=listbox chỉ bọc đúng các option/group — nút "Xem tất cả dự án" và ô
              tìm kiếm nằm ngoài (axe aria-required-children: listbox chỉ nhận option/group). */}
          <div
            role="listbox"
            aria-label="Chọn dự án"
            tabIndex={0}
            onKeyDown={onListKey}
            className="max-h-80 overflow-y-auto py-1 outline-none"
          >
            {flatOrder.length === 0 && (
              <div className="px-3 py-4 text-sm text-zinc-500 text-center">
                Không tìm thấy dự án nào
              </div>
            )}
            {showGroups ? (
              <>
                {pinnedList.length > 0 && (
                  <div role="group" aria-label="Đã ghim" className="mb-1">
                    <div
                      aria-hidden="true"
                      className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
                    >
                      ★ Đã ghim
                    </div>
                    {pinnedList.map((p) => row(p, flatOrder.indexOf(p)))}
                  </div>
                )}
                {activeList.length > 0 && (
                  <div role="group" aria-label={STATUS_LABEL.active} className="mb-1">
                    <div
                      aria-hidden="true"
                      className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
                    >
                      {STATUS_LABEL.active}
                    </div>
                    {activeList.map((p) => row(p, flatOrder.indexOf(p)))}
                  </div>
                )}
                {closedList.length > 0 && (
                  <div role="group" aria-label="Đã bàn giao / Đóng">
                    <div
                      aria-hidden="true"
                      className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
                    >
                      Đã bàn giao / Đóng
                    </div>
                    {closedList.map((p) => row(p, flatOrder.indexOf(p)))}
                  </div>
                )}
              </>
            ) : (
              flatOrder.map((p) => row(p, flatOrder.indexOf(p)))
            )}
          </div>

          <a
            href="/portfolio"
            className="flex items-center gap-2 px-3 py-2.5 border-t border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 min-h-10"
          >
            <LayoutGrid className="w-4 h-4 shrink-0" />
            Xem tất cả dự án (Portfolio)
          </a>
        </div>
      )}
      {busy && (
        <div className="absolute inset-0 bg-zinc-950/50 flex items-center justify-center text-xs text-zinc-400">
          Đang đổi dự án…
        </div>
      )}
    </div>
  );
}
