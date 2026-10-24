"use client";
// Một hộp tìm kiếm cho mọi cỡ màn hình: trigger trên topbar, modal có focus-trap và trả focus.
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
  Command,
  X,
  type LucideIcon,
} from "lucide-react";
import { slugFromCode } from "@/lib/nen/sheets";
import { Modal } from "@/app/components/dialogs";
import Button from "@/app/components/ui/Button";
import { enabledShellSearchHits, type ShellNavLink } from "@/app/lib/upgrade-shell-navigation";

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
type DocHit = {
  kind: string;
  id: number | string;
  code: string | null;
  title: string;
  subtitle: string | null;
  url: string;
};
type ModuleHit = DocHit & { kind: "module"; icon: LucideIcon };
type Hit = WbsHit | DocHit | ModuleHit;

function isWbs(hit: Hit): hit is WbsHit {
  return hit.kind === "task" || hit.kind === "package";
}

const KIND_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  module: { label: "Phân hệ", icon: Command, color: "text-emerald-400" },
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

function hitUrl(hit: Hit): string {
  if (!isWbs(hit)) return hit.url || "/";
  const slug = hit.sheetSlug ?? slugFromCode(hit.sheetType);
  return slug
    ? `/tracking/${slug}${hit.floorLabel ? `?floor=${encodeURIComponent(hit.floorLabel)}` : ""}`
    : "/";
}

function moduleHits(items: readonly ShellNavLink[]): ModuleHit[] {
  return items.map((item) => ({
    kind: "module",
    id: item.href,
    code: null,
    title: item.label,
    subtitle: "Mở phân hệ",
    url: item.href,
    icon: item.icon,
  }));
}

const EMPTY_LINKS: ShellNavLink[] = [];
const EMPTY_FLAGS: ReadonlyMap<string, boolean> = new Map();

export default function GlobalSearch({
  navigationItems = EMPTY_LINKS,
  frequentItems = EMPTY_LINKS,
  compact = false,
  featureFlags = EMPTY_FLAGS,
}: {
  navigationItems?: readonly ShellNavLink[];
  frequentItems?: readonly ShellNavLink[];
  compact?: boolean;
  featureFlags?: ReadonlyMap<string, boolean>;
} = {}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);
  const activeOptionRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (open) activeOptionRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, hits, open]);

  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k" || event.repeat)
        return;
      // Không mở modal thứ hai bên trên form/menu đang bẫy focus.
      if (document.querySelector('[aria-modal="true"]:not(#global-search-dialog)')) return;
      event.preventDefault();
      setOpen((previous) => !previous);
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  useEffect(() => {
    const seq = ++seqRef.current;
    if (!open) return;
    const term = q.trim();
    const local = moduleHits(term.length < 2 ? frequentItems : navigationItems).filter(
      (hit) =>
        term.length < 2 || hit.title.toLocaleLowerCase("vi").includes(term.toLocaleLowerCase("vi")),
    );
    setHits(local);
    setActive(0);
    setError("");
    setBusy(term.length >= 2);
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search_failed");
        const data = await response.json();
        if (seq !== seqRef.current || controller.signal.aborted) return;
        setHits([...local, ...enabledShellSearchHits<Hit>(data.hits ?? [], featureFlags)]);
      } catch {
        if (seq === seqRef.current && !controller.signal.aborted) {
          setError("Không tải được kết quả. Bạn có thể thử lại hoặc mở phân hệ bên dưới.");
        }
      } finally {
        if (seq === seqRef.current && !controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, open, retry, navigationItems, frequentItems, featureFlags]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) =>
        Math.max(0, Math.min(index + (event.key === "ArrowDown" ? 1 : -1), hits.length - 1)),
      );
    }
    if (event.key === "Enter" && hits[active]) {
      event.preventDefault();
      window.location.href = hitUrl(hits[active]);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        aria-label="Mở tìm kiếm toàn cục"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        icon={Search}
        className={`min-w-11 min-h-11 shrink-0 px-2 ${compact ? "" : "md:px-3 md:border-zinc-800 md:bg-zinc-900"}`}
      >
        {!compact && <span className="hidden md:inline text-zinc-400">Tìm kiếm…</span>}
        {!compact && <kbd className="hidden lg:inline text-[10px] text-zinc-400">Ctrl+K</kbd>}
      </Button>
      {open && (
        <Modal
          id="global-search-dialog"
          ariaLabel="Tìm kiếm toàn cục"
          onClose={() => setOpen(false)}
          className="max-w-xl"
        >
          <div className="p-4 border-b border-zinc-800">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="flex-1 text-base font-semibold text-zinc-100">
                Tìm kiếm & điều hướng
              </h2>
              <Button
                variant="ghost"
                size="icon"
                icon={X}
                aria-label="Đóng tìm kiếm"
                onClick={() => setOpen(false)}
                className="min-h-11 min-w-11"
              />
            </div>
            <label htmlFor="global-search" className="block text-xs font-medium text-zinc-300 mb-2">
              Công việc, hồ sơ hoặc phân hệ
            </label>
            <input
              ref={inputRef}
              id="global-search"
              type="search"
              autoFocus
              autoComplete="off"
              role="combobox"
              aria-expanded="true"
              aria-controls="global-search-results"
              aria-autocomplete="list"
              aria-activedescendant={hits[active] ? `global-search-hit-${active}` : undefined}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Nhập ít nhất 2 ký tự để tìm hồ sơ…"
              className="w-full min-h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-base text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-emerald-500"
            />
            <p className="mt-2 text-xs text-zinc-400">↑ ↓ để chọn · Enter để mở · Esc để đóng</p>
          </div>
          {busy && (
            <p role="status" className="px-4 py-3 text-sm text-zinc-400">
              Đang tìm kiếm…
            </p>
          )}
          {error && (
            <div role="alert" className="px-4 py-3 text-sm text-amber-300">
              <p>{error}</p>
              <Button variant="ghost" onClick={() => setRetry((count) => count + 1)}>
                Thử lại
              </Button>
            </div>
          )}
          {!busy && !error && hits.length === 0 && (
            <p role="status" className="p-4 text-sm text-zinc-400">
              {q.trim().length < 2
                ? "Nhập từ khoá để tìm công việc hoặc hồ sơ."
                : `Không tìm thấy “${q.trim()}”.`}
            </p>
          )}
          <div
            id="global-search-results"
            role="listbox"
            aria-label="Kết quả tìm kiếm"
            className="max-h-[50vh] overflow-y-auto"
          >
            {hits.map((hit, index) => {
              const meta = KIND_META[hit.kind] ?? {
                label: "Hồ sơ",
                icon: FileText,
                color: "text-zinc-300",
              };
              const Icon = "icon" in hit ? hit.icon : meta.icon;
              const title = isWbs(hit) ? hit.name : hit.title;
              const subtitle = isWbs(hit)
                ? `${hit.sheetType}${hit.floorLabel ? ` · ${hit.floorLabel}` : ""} · ${Math.round(hit.progress * 100)}%`
                : hit.subtitle;
              return (
                <a
                  key={`${hit.kind}-${hit.id}-${index}`}
                  id={`global-search-hit-${index}`}
                  ref={index === active ? activeOptionRef : undefined}
                  href={hitUrl(hit)}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  className={`flex items-center gap-3 min-h-11 px-4 py-3 text-sm border-b border-zinc-800 ${index === active ? "bg-emerald-500/10 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800/60"}`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${meta.color}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {hit.code && (
                        <span className="font-mono text-emerald-400 mr-2">{hit.code}</span>
                      )}
                      {title}
                    </span>
                    <span className="block truncate text-xs text-zinc-400">
                      {meta.label}
                      {subtitle ? ` · ${subtitle}` : ""}
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        </Modal>
      )}
    </>
  );
}
