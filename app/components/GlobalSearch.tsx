"use client";
// Tìm kiếm toàn cục & Command Palette (M57 PR1 & Pinnacle): task/nhóm → nhảy tới sheet + tầng;
// kho hồ sơ (hợp đồng/công văn/họp/nhật ký/NCR/vật tư/bản vẽ/tài liệu/bình luận);
// 34 phân hệ Kỹ thuật Đỉnh cao (Engineering OS). Hỗ trợ phím tắt toàn cầu Ctrl+K / Cmd+K.
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
  Sparkles,
  Scissors,
  Scan,
  Route,
  QrCode,
  Bot,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Building2,
  Workflow,
  Command,
  X,
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
  kind: string;
  id: number | string;
  code: string | null;
  title: string;
  subtitle: string | null;
  url: string;
};

type ModuleHit = {
  kind: "module";
  id: string;
  code: string;
  title: string;
  subtitle: string;
  url: string;
  icon?: LucideIcon;
};

type Hit = WbsHit | DocHit | ModuleHit;

function isWbs(h: Hit): h is WbsHit {
  return h.kind === "task" || h.kind === "package";
}

const STATIC_MODULE_HITS: ModuleHit[] = [
  {
    kind: "module",
    id: "mod-apex",
    code: "M88",
    title: "Apex Cockpit (Command Center)",
    subtitle: "Trung tâm hợp nhất 32+ siêu hệ thống kỹ thuật",
    url: "/engineering",
    icon: Sparkles,
  },
  {
    kind: "module",
    id: "mod-bim",
    code: "M80",
    title: "3D BIM & 4D Simulation Studio",
    subtitle: "WebGL 3D Viewer & Mô phỏng tiến độ thi công 4D",
    url: "/engineering/bim-viewer",
    icon: Building2,
  },
  {
    kind: "module",
    id: "mod-nesting",
    code: "M89",
    title: "CAD Fabrication Nesting & Thủy Lực",
    subtitle: "Tối ưu cắt phôi ống 1D (FFD) & Thủy lực MEPF",
    url: "/engineering/cad-nesting",
    icon: Scissors,
  },
  {
    kind: "module",
    id: "mod-autoroute",
    code: "M77",
    title: "Auto-Routing 3D & Beam Sleeve",
    subtitle: "Tìm tuyến 3D A* né dầm bảo toàn độ dốc",
    url: "/engineering/auto-routing",
    icon: Route,
  },
  {
    kind: "module",
    id: "mod-scan",
    code: "M70",
    title: "Scan-to-BIM Reality Capture",
    subtitle: "So khớp LiDAR sai lệch không gian & nghiệm thu",
    url: "/engineering/scan-to-bim",
    icon: Scan,
  },
  {
    kind: "module",
    id: "mod-hse",
    code: "M87",
    title: "HSE AI Computer Vision Sentinel",
    subtitle: "Giám sát an toàn bảo hộ lao động & rào chắn AI",
    url: "/engineering/hse-vision",
    icon: ShieldAlert,
  },
  {
    kind: "module",
    id: "mod-zalo",
    code: "M86",
    title: "Zalo Field Copilot Gateway",
    subtitle: "Trợ lý hiện trường Zalo NLP 2 chiều",
    url: "/engineering/zalo-copilot",
    icon: Bot,
  },
  {
    kind: "module",
    id: "mod-cashflow",
    code: "M85",
    title: "Dynamic Cashflow & Working Capital",
    subtitle: "Mô phỏng dòng tiền S-Curve & rủi ro vốn lưu động",
    url: "/engineering/cashflow",
    icon: TrendingUp,
  },
  {
    kind: "module",
    id: "mod-esign",
    code: "M84",
    title: "Paperless Smart e-Signature PKI",
    subtitle: "Ký số BBNT pháp lý 3 bên bảo mật mật mã",
    url: "/engineering/esign",
    icon: ShieldCheck,
  },
  {
    kind: "module",
    id: "mod-fidic",
    code: "M79",
    title: "FIDIC Claims & 28-day EOT Dossier",
    subtitle: "Hồ sơ khiếu nại tiến độ FIDIC & phân tích TIA",
    url: "/engineering/fidic-claims",
    icon: FileSignature,
  },
  {
    kind: "module",
    id: "mod-qr",
    code: "M78",
    title: "Smart QR Logistics & Barcode",
    subtitle: "Quản lý chuỗi cung ứng vật tư & đối soát GRN",
    url: "/procurement?tab=qr-logistics",
    icon: QrCode,
  },
  {
    kind: "module",
    id: "mod-quantum",
    code: "M73",
    title: "Quantum Core & Merkle Ledger",
    subtitle: "Siêu tính toán không gian WASM & Cây Merkle Root",
    url: "/engineering/quantum-hub",
    icon: Zap,
  },
  {
    kind: "module",
    id: "mod-wf",
    code: "ENG-3",
    title: "Quy trình Phê duyệt Gate 0",
    subtitle: "Thẩm định uỷ quyền kỹ thuật & Phân tách trách nhiệm",
    url: "/engineering/workflows",
    icon: Workflow,
  },
];

const KIND_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  module: { label: "Phân hệ Kỹ thuật Đỉnh cao", icon: Sparkles, color: "text-amber-400" },
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

function metaOf(kind: string, hit?: Hit) {
  if (hit && "icon" in hit && hit.icon) {
    return { label: KIND_META[kind]?.label ?? "Phân hệ", icon: hit.icon, color: "text-amber-400" };
  }
  return KIND_META[kind] ?? { label: kind, icon: FileText, color: "text-zinc-300" };
}

function hitUrl(h: Hit): string {
  if (h.kind === "module") return h.url;
  if (!isWbs(h)) return h.url || "/";
  const slug = h.sheetSlug ?? slugFromCode(h.sheetType);
  if (!slug) return "/";
  return `/tracking/${slug}${h.floorLabel ? `?floor=${encodeURIComponent(h.floorLabel)}` : ""}`;
}

export default function GlobalSearch({
  placement = "bottom",
}: {
  placement?: "top" | "bottom";
} = {}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);

  // Phím tắt toàn cầu Ctrl+K / Cmd+K
  useEffect(() => {
    function onGlobalKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
          return !prev;
        });
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  // Debounce 250ms & match static modules
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      const initialModules = STATIC_MODULE_HITS.slice(0, 6);
      setHits(initialModules);
      setBusy(false);
      return;
    }

    setBusy(true);
    const seq = ++seqRef.current;

    // Filter static modules
    const matchedModules = STATIC_MODULE_HITS.filter(
      (m) =>
        m.title.toLowerCase().includes(term.toLowerCase()) ||
        m.code.toLowerCase().includes(term.toLowerCase()) ||
        m.subtitle.toLowerCase().includes(term.toLowerCase()),
    );

    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`).catch(() => null);
        if (seq !== seqRef.current) return;
        const apiHits: Hit[] = r?.ok ? ((await r.json()).hits ?? []) : [];
        setHits([...matchedModules, ...apiHits]);
      } catch {
        if (seq === seqRef.current) setHits(matchedModules);
      } finally {
        if (seq === seqRef.current) {
          setActive(0);
          setBusy(false);
        }
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
    if (e.key === "Enter" && hits[active]) {
      window.location.href = hitUrl(hits[active]);
    }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative w-full max-w-md" ref={boxRef}>
      <div className="relative flex items-center">
        <Search className="w-4 h-4 absolute left-3 text-zinc-500 pointer-events-none" />
        <input
          ref={inputRef}
          id="global-search"
          name="q"
          autoComplete="off"
          aria-label="Tìm kiếm toàn cục và lệnh điều hướng (Ctrl+K)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Tìm kiếm hoặc gõ lệnh... (Ctrl+K)"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-14 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 h-10 transition"
        />
        <div className="absolute right-2.5 flex items-center gap-0.5 pointer-events-none">
          <kbd className="hidden sm:inline-flex items-center rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 shadow-sm">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {open && (
        <div
          className={`absolute left-0 right-0 ${
            placement === "top" ? "top-full mt-2" : "bottom-full mb-2"
          } bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-md`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Command size={12} className="text-emerald-400" />
              Spotlight Command Palette
            </span>
            <span className="text-[10px] text-zinc-500">
              Dùng phím <kbd className="font-mono text-zinc-400">↑</kbd>{" "}
              <kbd className="font-mono text-zinc-400">↓</kbd> để chọn ·{" "}
              <kbd className="font-mono text-zinc-400">Enter</kbd> để mở
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {busy && (
              <p className="px-4 py-3 text-sm text-zinc-500 animate-pulse">Đang tìm kiếm...</p>
            )}
            {!busy && hits.length === 0 && (
              <p className="px-4 py-4 text-center text-sm text-zinc-500">
                Không tìm thấy &ldquo;{q.trim()}&rdquo;
              </p>
            )}
            {hits.map((h, i) => {
              const meta = metaOf(h.kind, h);
              const Icon = meta.icon;
              const showHeader = i === 0 || hits[i - 1].kind !== h.kind;
              const isSelected = i === active;

              return (
                <div key={`${h.kind}-${h.id}`}>
                  {showHeader && (
                    <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-950/30">
                      {meta.label}
                    </div>
                  )}
                  <a
                    href={hitUrl(h)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex items-center gap-3 px-3 py-2.5 border-b border-zinc-800/40 text-sm transition-colors ${
                      isSelected ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800/60"
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-md bg-zinc-950 border border-zinc-800 shrink-0 ${meta.color}`}
                    >
                      <Icon size={14} />
                    </div>

                    {h.kind === "module" ? (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-100 truncate">{h.title}</span>
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                            {h.code}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">{h.subtitle}</p>
                      </div>
                    ) : isWbs(h) ? (
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <div className="truncate">
                          <span className="font-mono text-emerald-400 text-xs font-bold mr-2">
                            {h.boqCode ?? h.code}
                          </span>
                          <span className="truncate">{h.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-xs">
                          <span className="text-zinc-500">
                            {h.sheetType}
                            {h.floorLabel ? ` · ${h.floorLabel}` : ""}
                          </span>
                          <span
                            className={`w-9 text-right font-mono font-medium ${
                              h.status === "tre" ? "text-rose-400" : "text-emerald-400"
                            }`}
                          >
                            {Math.round((h.progress ?? 0) * 100)}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <div className="truncate">
                          {h.code && (
                            <span className="font-mono text-emerald-400 text-xs font-bold mr-2">
                              {h.code}
                            </span>
                          )}
                          <span className="truncate">{h.title}</span>
                        </div>
                        {h.subtitle && (
                          <span className="text-xs text-zinc-500 shrink-0 max-w-[35%] truncate">
                            {h.subtitle}
                          </span>
                        )}
                      </div>
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
