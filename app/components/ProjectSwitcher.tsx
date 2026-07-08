"use client";
// Chuyển đổi dự án (M22 PR2 — xem docs/nang-cap/M22-da-du-an.md §4.1b). Thay logo "XBoss"
// ở đỉnh sidebar: chấm màu + tên dự án hiện tại + chevron, bấm mở panel chọn dự án khác.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, Star, LayoutGrid, Check } from "lucide-react";
import { disciplineColorClasses } from "@/lib/disciplineColors";

type Project = {
  id: number;
  name: string;
  code: string | null;
  status: string;
  color: string | null;
  totalTasks: number;
  avgProgress: number;
  delayedCount: number;
};

const PINNED_KEY = "xboss_pinned";
const PROJECT_KEY = "xboss_project"; // cache client cho render nhanh — cookie server là nguồn sự thật

function readPinned(): Set<number> {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export default function ProjectSwitcher() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [active, setActive] = useState(0);
  const [switching, setSwitching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPinned(readPinned());
    // Render nhanh bằng cache trước khi fetch xong (tránh nhấp nháy "XBoss" → tên dự án).
    const cached = Number(localStorage.getItem(PROJECT_KEY));
    if (cached) setCurrentId(cached);

    fetch("/api/projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list: Project[] = data?.projects ?? [];
        setProjects(list);
        setCurrentId((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => filterRef.current?.focus(), 0);
    else setFilter("");
  }, [open]);

  // Nhóm: Đã ghim → Đang thi công → Đã bàn giao/Đóng (mờ). Lọc theo filter nếu có gõ.
  const grouped = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const matches = (p: Project) =>
      !term || p.name.toLowerCase().includes(term) || (p.code ?? "").toLowerCase().includes(term);
    const filtered = projects.filter(matches);
    const pinnedList = filtered.filter((p) => pinned.has(p.id));
    const activeList = filtered.filter((p) => !pinned.has(p.id) && p.status === "active");
    const otherList = filtered.filter((p) => !pinned.has(p.id) && p.status !== "active");
    return [
      { label: "★ Đã ghim", items: pinnedList },
      { label: "Đang thi công", items: activeList },
      { label: "Đã bàn giao / Đóng", items: otherList },
    ].filter((g) => g.items.length > 0);
  }, [projects, pinned, filter]);

  const flatOptions = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  async function selectProject(id: number) {
    if (id === currentId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const res = await fetch("/api/project/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      if (!res.ok) return;
      localStorage.setItem(PROJECT_KEY, String(id));
      setOpen(false);
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  }

  function togglePin(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(PINNED_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode */
      }
      return next;
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flatOptions.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    }
    if (e.key === "Enter" && flatOptions[active]) selectProject(flatOptions[active].id);
  }

  const current = projects.find((p) => p.id === currentId);
  const c = disciplineColorClasses(current?.color);

  return (
    <div className="relative flex-1 min-w-0" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current?.name ?? "XBoss"}
        className="w-full flex items-center gap-2 h-12 px-3 hover:bg-zinc-900/60 transition text-left"
      >
        {current ? (
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} aria-hidden="true" />
        ) : (
          <LayoutDashboard className="w-5 h-5 text-emerald-400 shrink-0" />
        )}
        <span className="sidebar-label text-sm font-bold truncate flex-1">
          {current?.name ?? "XBoss"}
        </span>
        <ChevronDown
          className={`sidebar-label w-3.5 h-3.5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          onKeyDown={onKeyDown}
          role="listbox"
          aria-label="Chọn dự án"
          className="fixed inset-x-0 bottom-0 sm:absolute sm:inset-x-2 sm:bottom-auto sm:top-full sm:mt-1
            bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-xl shadow-2xl z-[60]
            max-h-[70vh] sm:max-h-96 overflow-hidden flex flex-col"
        >
          {projects.length > 7 && (
            <div className="p-2 border-b border-zinc-800 shrink-0">
              <input
                ref={filterRef}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setActive(0);
                }}
                placeholder="Lọc dự án..."
                aria-label="Lọc dự án"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600"
              />
            </div>
          )}

          <div className="overflow-y-auto flex-1">
            {grouped.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">Không tìm thấy dự án</p>
            )}
            {grouped.map((g) => (
              <div key={g.label}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {g.label}
                </div>
                {g.items.map((p) => {
                  const idx = flatOptions.indexOf(p);
                  const pc = disciplineColorClasses(p.color);
                  const pct = Math.round((p.avgProgress ?? 0) * 100);
                  const isCurrent = p.id === currentId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      onClick={() => selectProject(p.id)}
                      onMouseEnter={() => setActive(idx)}
                      disabled={switching}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 min-h-10 text-left text-sm transition ${
                        isCurrent ? "bg-zinc-800" : idx === active ? "bg-zinc-800/60" : ""
                      } ${p.status !== "active" ? "opacity-60" : ""}`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${pc.dot}`}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.delayedCount > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-950/60 text-rose-300 border border-rose-800 shrink-0">
                          {p.delayedCount} trễ
                        </span>
                      )}
                      <span className="text-xs text-zinc-400 tabular-nums shrink-0 w-9 text-right">
                        {pct}%
                      </span>
                      <span
                        onClick={(e) => togglePin(e, p.id)}
                        role="button"
                        tabIndex={-1}
                        aria-label={pinned.has(p.id) ? "Bỏ ghim" : "Ghim dự án"}
                        title={pinned.has(p.id) ? "Bỏ ghim" : "Ghim dự án"}
                        className="p-1 -m-1 shrink-0 text-zinc-500 hover:text-amber-300"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${pinned.has(p.id) ? "fill-amber-300 text-amber-300" : ""}`}
                        />
                      </span>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <a
            href="/portfolio"
            className="flex items-center gap-2 px-3 py-2.5 min-h-10 border-t border-zinc-800 text-sm text-zinc-400 hover:text-white hover:bg-zinc-900/60 transition shrink-0"
          >
            <LayoutGrid className="w-4 h-4" /> Xem tất cả dự án (Portfolio)
          </a>
        </div>
      )}
    </div>
  );
}
