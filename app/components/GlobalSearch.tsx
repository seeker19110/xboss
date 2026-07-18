"use client";
// Tìm kiếm toàn cục (M57 PR1): task/nhóm → nhảy tới sheet + tầng; thêm các nguồn kho
// hồ sơ (hợp đồng/công văn/họp/nhật ký/NCR/vật tư/bản vẽ/tài liệu/bình luận) — FTS có
// index, gõ có dấu/không dấu ra cùng kết quả. Kết quả nhóm theo loại (icon + nhãn).
import { useEffect, useRef, useState } from "react";
import {
  Search,
  Boxes,
  ListTodo,
  FileSignature,
  Mail,
  Users,
  NotebookPen,
  AlertTriangle,
  Package,
  PencilRuler,
  FileText,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { slugFromCode } from "@/lib/sheets";
import { STATUS_LABEL, type StatusSlug } from "@/lib/status";

// Hit của task/nhóm (shape SearchHit cũ — KHÔNG đổi).
type WbsHit = {
  kind: "task" | "package";
  id: number;
  code: string;
  name: string;
  boqCode: string | null;
  sheetSlug?: string | null;
  status: string | null;
  progress: number;
  floorLabel: string | null;
  sheetType: string;
};

// Hit của nguồn kho hồ sơ (shape DocHit từ lib/search.ts).
type DocHit = {
  kind: string; // "contract" | "correspondence" | ...
  id: number;
  code: string | null;
  title: string;
  subtitle: string | null;
  url: string;
};

type Hit = WbsHit | DocHit;

function isWbs(h: Hit): h is WbsHit {
  return h.kind === "task" || h.kind === "package";
}

// Nhãn nhóm + icon + màu nhấn (thang zinc + accent -300/-400) theo loại. Icon phân
// biệt loại (không chỉ dựa màu — a11y).
const KIND_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  package: { label: "Nhóm công việc", icon: Boxes, color: "text-amber-400" },
  task: { label: "Công việc", icon: ListTodo, color: "text-emerald-400" },
  contract: { label: "Hợp đồng", icon: FileSignature, color: "text-violet-400" },
  correspondence: { label: "Công văn", icon: Mail, color: "text-sky-400" },
  meeting: { label: "Biên bản họp", icon: Users, color: "text-amber-300" },
  diary: { label: "Nhật ký công trường", icon: NotebookPen, color: "text-emerald-300" },
  ncr: { label: "NCR", icon: AlertTriangle, color: "text-rose-400" },
  material: { label: "Vật tư", icon: Package, color: "text-sky-300" },
  drawing: { label: "Bản vẽ", icon: PencilRuler, color: "text-violet-300" },
  document: { label: "Tài liệu", icon: FileText, color: "text-zinc-300" },
  comment: { label: "Bình luận", icon: MessageSquare, color: "text-emerald-400" },
};

function metaOf(kind: string) {
  return KIND_META[kind] ?? { label: kind, icon: FileText, color: "text-zinc-300" };
}

function hitUrl(h: Hit): string {
  if (!isWbs(h)) return h.url || "/";
  const slug = h.sheetSlug ?? slugFromCode(h.sheetType);
  if (!slug) return "/";
  return `/tracking/${slug}${h.floorLabel ? `?floor=${encodeURIComponent(h.floorLabel)}` : ""}`;
}

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  // Debounce 300ms; seq chống kết quả về trễ ghi đè truy vấn mới hơn.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const seq = ++seqRef.current;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`).catch(() => null);
      if (seq !== seqRef.current) return;
      setHits(r?.ok ? ((await r.json()).hits ?? []) : []);
      setActive(0);
      setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    }
    if (e.key === "Enter" && hits[active]) window.location.href = hitUrl(hits[active]);
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative w-full max-w-md" ref={boxRef}>
      <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500 pointer-events-none" />
      <input
        id="global-search"
        name="q"
        autoComplete="off"
        aria-label="Tìm kiếm toàn cục"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Tìm mã / tên / hồ sơ..."
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-emerald-600 h-10"
      />

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 bottom-full mb-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="max-h-96 overflow-auto">
            {busy && <p className="px-4 py-3 text-sm text-zinc-500">Đang tìm...</p>}
            {!busy && hits.length === 0 && (
              <p className="px-4 py-3 text-sm text-zinc-500">
                Không tìm thấy &ldquo;{q.trim()}&rdquo;
              </p>
            )}
            {hits.map((h, i) => {
              const meta = metaOf(h.kind);
              const Icon = meta.icon;
              // Tiêu đề nhóm khi loại đổi so với hit trước (kết quả đã xếp theo nhóm).
              const showHeader = i === 0 || hits[i - 1].kind !== h.kind;
              return (
                <div key={`${h.kind}-${h.id}`}>
                  {showHeader && (
                    <p className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      {meta.label}
                    </p>
                  )}
                  <a
                    href={hitUrl(h)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex items-center gap-2.5 px-3 py-2 border-b border-zinc-800/60 text-sm ${i === active ? "bg-zinc-800/70" : ""}`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
                    {isWbs(h) ? (
                      <>
                        <span className="font-mono text-emerald-400 text-xs shrink-0">
                          {h.boqCode ?? h.code}
                        </span>
                        <span className="truncate flex-1">{h.name}</span>
                        <span className="text-xs text-zinc-500 shrink-0">
                          {h.sheetType}
                          {h.floorLabel ? ` · ${h.floorLabel}` : ""}
                        </span>
                        <span
                          className={`text-xs shrink-0 w-9 text-right ${h.status === "tre" ? "text-red-400" : "text-zinc-400"}`}
                          title={h.status ? (STATUS_LABEL[h.status as StatusSlug] ?? h.status) : ""}
                        >
                          {Math.round((h.progress ?? 0) * 100)}%
                        </span>
                      </>
                    ) : (
                      <>
                        {h.code && (
                          <span className="font-mono text-emerald-400 text-xs shrink-0">
                            {h.code}
                          </span>
                        )}
                        <span className="truncate flex-1">{h.title}</span>
                        {h.subtitle && (
                          <span className="text-xs text-zinc-500 shrink-0 max-w-[40%] truncate">
                            {h.subtitle}
                          </span>
                        )}
                      </>
                    )}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
