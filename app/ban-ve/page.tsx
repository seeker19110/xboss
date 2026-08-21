"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  X,
  Upload,
  Search,
  FileText,
  Box,
  HardHat,
  BadgeCheck,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  History,
  ExternalLink,
  Pencil,
  Compass,
  Layers,
  Workflow,
  ShieldCheck,
  SlidersHorizontal,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appPrompt, appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

// ── TYPES & INTERFACES ──

export type DrawingKind = "design" | "shop" | "asbuilt" | "bim" | "method";
export type RevisionStatus =
  "submitted" | "commented" | "approved" | "approved_with_comments" | "rejected" | "superseded";

export type TradeDiscipline = "all" | "M" | "E" | "P" | "F" | "ELV";

const KIND_LABEL: Record<DrawingKind, string> = {
  design: "Thiết kế",
  bim: "Mô hình BIM",
  shop: "Shop drawing",
  method: "Biện pháp thi công",
  asbuilt: "Bản vẽ hoàn công",
};

const KIND_ICON: Record<DrawingKind, LucideIcon> = {
  design: Compass,
  shop: FileText,
  asbuilt: BadgeCheck,
  bim: Box,
  method: HardHat,
};

const STATUS_LABEL: Record<RevisionStatus, string> = {
  submitted: "Đã trình",
  commented: "Có ý kiến",
  approved: "Đã duyệt",
  approved_with_comments: "Duyệt kèm ý kiến",
  rejected: "Từ chối",
  superseded: "Đã thay thế",
};

const STATUS_BADGE: Record<RevisionStatus, string> = {
  submitted: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  commented: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  approved_with_comments: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  rejected: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  superseded: "bg-zinc-800 text-zinc-500 border-zinc-700 line-through",
};

const STATUS_ICON: Record<RevisionStatus, LucideIcon> = {
  submitted: Clock,
  commented: MessageSquare,
  approved: CheckCircle2,
  approved_with_comments: CheckCircle2,
  rejected: XCircle,
  superseded: History,
};

export type DrawingRow = {
  id: number;
  code: string;
  name: string;
  kind: DrawingKind;
  systemGroup: string | null;
  floorLabel: string | null;
  workPackageId: number | null;
  workPackageCode: string | null;
  workPackageName: string | null;
  workPackageRequiresMethodStatement: boolean | null;
  createdAt: string;
  latestRevisionId: number | null;
  latestRev: string | null;
  latestStatus: RevisionStatus | null;
  latestSubmittedAt: string | null;
  latestDecidedAt: string | null;
  approvedRevisionId: number | null;
  approvedRev: string | null;
  approvedDecidedAt: string | null;
};

export type DrawingRevisionRow = {
  id: number;
  rev: string;
  fileName: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number | null;
  status: RevisionStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
};

const fmtSize = (b: number) =>
  b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;

function fetchFresh(url: string): Promise<Response> {
  const sep = url.includes("?") ? "&" : "?";
  return fetch(`${url}${sep}_=${Date.now()}`, { cache: "no-store" });
}

function canManageDrawings(role?: string) {
  return role === "admin" || role === "pm" || role === "engineer";
}
function canDecideRevision(role?: string) {
  return role === "admin" || role === "pm";
}

function suggestNextRev(revisions: DrawingRevisionRow[]): string {
  const last = revisions[0]?.rev ?? "";
  if (/^[A-Z]$/.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1);
  return "";
}

// ── COMPONENT ROOT ──

export default function DrawingsPage({ fixedKind }: { fixedKind?: DrawingKind } = {}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DrawingsPageInner fixedKind={fixedKind} />
    </Suspense>
  );
}

const DRAWING_KIND_VALUES = ["design", "method", "bim", "shop", "asbuilt"] as const;

function DrawingsPageInner({ fixedKind }: { fixedKind?: DrawingKind }) {
  const searchParams = useSearchParams();
  const kindParam = searchParams.get("kind");
  const kindFilter: DrawingKind | "all" =
    fixedKind ??
    ((DRAWING_KIND_VALUES as readonly string[]).includes(kindParam ?? "")
      ? (kindParam as DrawingKind)
      : "all");

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<DrawingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RevisionStatus | "all">("all");
  const [selectedDiscipline, setSelectedDiscipline] = useState<TradeDiscipline>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Tab switcher: Bản vẽ & BPTC ↔ Thay đổi thiết kế
  const [tab, setTab] = useState<"drawings" | "design-changes">("drawings");
  const [dcAddOpen, setDcAddOpen] = useState(false);

  const canCreate = canManageDrawings(me?.role);
  const canDecide = canDecideRevision(me?.role);

  function load() {
    const sp = new URLSearchParams();
    if (kindFilter !== "all") sp.set("kind", kindFilter);
    if (statusFilter !== "all") sp.set("status", statusFilter);
    const qs = sp.toString();
    return fetch(`/api/drawings${qs ? `?${qs}` : ""}`).then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    fetchMe().then((u) => setMe(u));
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .then((d) => {
        const drawings: DrawingRow[] = d?.drawings ?? [];
        setItems(drawings);
        if (drawings.length > 0 && selectedId == null) {
          setSelectedId(drawings[0].id);
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFilter, statusFilter]);

  async function refresh() {
    const sp = new URLSearchParams();
    if (kindFilter !== "all") sp.set("kind", kindFilter);
    if (statusFilter !== "all") sp.set("status", statusFilter);
    const qs = sp.toString();
    const res = await fetchFresh(`/api/drawings${qs ? `?${qs}` : ""}`);
    const d = res.ok ? await res.json() : null;
    const drawings: DrawingRow[] = d?.drawings ?? [];
    setItems(drawings);
    if (drawings.length > 0 && !drawings.some((x) => x.id === selectedId)) {
      setSelectedId(drawings[0].id);
    }
  }

  const filtered = useMemo(() => {
    let res = items;
    if (selectedDiscipline !== "all") {
      res = res.filter((d) => {
        const sys = (d.systemGroup || "").toUpperCase();
        if (selectedDiscipline === "M")
          return sys.includes("M") || sys.includes("ACMV") || sys.includes("HVAC");
        if (selectedDiscipline === "E")
          return sys.includes("E") || sys.includes("ĐIỆN") || sys.includes("DIEN");
        if (selectedDiscipline === "P")
          return sys.includes("P") || sys.includes("NƯỚC") || sys.includes("PLUMB");
        if (selectedDiscipline === "F")
          return sys.includes("F") || sys.includes("PCCC") || sys.includes("FIRE");
        if (selectedDiscipline === "ELV") return sys.includes("ELV") || sys.includes("TEL");
        return true;
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      res = res.filter((d) =>
        [d.code, d.name, d.systemGroup, d.floorLabel, d.workPackageCode, d.workPackageName]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      );
    }
    return res;
  }, [items, search, selectedDiscipline]);

  const selected =
    items.find((d) => d.id === selectedId) ?? (filtered.length > 0 ? filtered[0] : null);

  // Thống kê nhanh KPI
  const stats = useMemo(() => {
    const total = items.length;
    const approved = items.filter(
      (d) => d.latestStatus === "approved" || d.latestStatus === "approved_with_comments",
    ).length;
    const pending = items.filter(
      (d) => d.latestStatus === "submitted" || d.latestStatus === "commented",
    ).length;
    const rejected = items.filter((d) => d.latestStatus === "rejected").length;
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, approved, pending, rejected, pct };
  }, [items]);

  const CurrentKindIcon = kindFilter === "all" ? FileText : KIND_ICON[kindFilter];

  if (loading && items.length === 0) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader
        title={
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-amber-400">
              <CurrentKindIcon className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-zinc-100 text-sm sm:text-base uppercase">
                  {kindFilter === "all"
                    ? "Hồ Sơ Bản Vẽ Kỹ Thuật"
                    : `Bản Vẽ: ${KIND_LABEL[kindFilter]}`}
                </span>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/20">
                  LOD 400 • TT AVIO
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 line-clamp-1">
                Tiến độ: <b className="text-zinc-200">{stats.pct}%</b> ({stats.approved}/
                {stats.total} bản vẽ) • Chờ duyệt: <b className="text-amber-400">{stats.pending}</b>
              </span>
            </div>
          </div>
        }
        bottomActions={
          tab === "drawings" ? (
            canCreate ? (
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Thêm bản vẽ"
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition shrink-0 text-white shadow-sm h-10"
              >
                <Plus className="w-4 h-4" /> <span>Thêm bản vẽ</span>
              </button>
            ) : undefined
          ) : canCreate ? (
            <button
              onClick={() => setDcAddOpen(true)}
              aria-label="Thêm thay đổi thiết kế"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition shrink-0 text-white shadow-sm h-10"
            >
              <Plus className="w-4 h-4" /> <span>Thêm thay đổi thiết kế</span>
            </button>
          ) : undefined
        }
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* ── TOP STATS STRIP & VIEW SWITCHER (CHUẨN MEPF-PROCESS) ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm">
          {/* Quick Info & Stats */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <CurrentKindIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-zinc-100 uppercase tracking-tight">
                {kindFilter === "all"
                  ? "BÀN LÀM VIỆC BẢN VẼ TÁC NGHIỆP"
                  : `QUẢN LÝ BẢN VẼ: ${KIND_LABEL[kindFilter].toUpperCase()}`}
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Tổng cộng: <b className="text-zinc-100">{stats.total}</b> • Đã duyệt:{" "}
                <b className="text-emerald-400">{stats.approved}</b> ({stats.pct}%) • Chờ duyệt:{" "}
                <b className="text-amber-400">{stats.pending}</b> • Từ chối:{" "}
                <b className="text-rose-400">{stats.rejected}</b>
              </p>
            </div>
          </div>

          {/* Tab Mode Switcher */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setTab("drawings")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                tab === "drawings"
                  ? "bg-amber-500 text-zinc-950 shadow-sm font-bold"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              Bản Vẽ & BPTC
            </button>
            <button
              onClick={() => setTab("design-changes")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                tab === "design-changes"
                  ? "bg-amber-500 text-zinc-950 shadow-sm font-bold"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
              Thay Đổi Thiết Kế
            </button>
          </div>
        </div>

        {tab === "drawings" ? (
          <>
            {/* ── 4 KPI STATS CARDS RIBBON ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase font-semibold">
                    Tổng Bản Vẽ
                  </span>
                  <p className="text-lg font-bold text-zinc-100 mt-0.5">{stats.total}</p>
                </div>
                <div className="p-2 rounded-lg bg-zinc-800 text-zinc-400">
                  <FolderOpen className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-emerald-500 uppercase font-semibold">
                    Đã Duyệt (AFC)
                  </span>
                  <p className="text-lg font-bold text-emerald-400 mt-0.5">
                    {stats.approved}{" "}
                    <span className="text-xs font-normal text-emerald-500 font-mono">
                      ({stats.pct}%)
                    </span>
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-amber-500 uppercase font-semibold">
                    Chờ Kỹ Sư Duyệt
                  </span>
                  <p className="text-lg font-bold text-amber-400 mt-0.5">{stats.pending}</p>
                </div>
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <Clock className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-rose-500 uppercase font-semibold">
                    Từ Chối / NCR
                  </span>
                  <p className="text-lg font-bold text-rose-400 mt-0.5">{stats.rejected}</p>
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                  <XCircle className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* ── WORKSPACE VIEW: MASTER-DETAIL 2-COLUMN ERGONOMIC LAYOUT (GIỐNG MEPF-PROCESS) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
              {/* ── CỘT TRÁI (4/12): DANH SÁCH BẢN VẼ (PIPELINE REGISTER) ── */}
              <div className="lg:col-span-4 p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3 shadow-sm">
                {/* 5-Trade Discipline Filter Pills */}
                <div className="space-y-1.5 pb-2.5 border-b border-zinc-800">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                    <span className="flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                      Lọc Phân Hệ:
                    </span>
                    <span className="font-mono text-zinc-500 text-[11px]">
                      {filtered.length} bản vẽ
                    </span>
                  </div>

                  <div className="grid grid-cols-6 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-[10px] font-mono font-bold text-center">
                    {(["all", "M", "E", "P", "F", "ELV"] as TradeDiscipline[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setSelectedDiscipline(d)}
                        className={`py-1 rounded-lg transition ${
                          selectedDiscipline === d
                            ? "bg-zinc-800 text-amber-300 shadow-xs border border-zinc-700"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {d === "all" ? "Tất Cả" : d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm mã, tên, hệ, tầng..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-amber-500 transition"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Chips */}
                <div className="flex flex-wrap gap-1">
                  <FilterChip
                    label="Tất cả"
                    active={statusFilter === "all"}
                    onClick={() => setStatusFilter("all")}
                  />
                  <FilterChip
                    label="Đã duyệt"
                    active={statusFilter === "approved"}
                    onClick={() => setStatusFilter("approved")}
                  />
                  <FilterChip
                    label="Chờ duyệt"
                    active={statusFilter === "submitted"}
                    onClick={() => setStatusFilter("submitted")}
                  />
                  <FilterChip
                    label="Từ chối"
                    active={statusFilter === "rejected"}
                    onClick={() => setStatusFilter("rejected")}
                  />
                </div>

                {/* List of Drawing Cards */}
                <div className="space-y-1.5 max-h-[calc(100vh-360px)] min-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {filtered.length === 0 ? (
                    <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                      Chưa có bản vẽ nào khớp bộ lọc.
                    </div>
                  ) : (
                    filtered.map((d) => {
                      const isSelected = selected?.id === d.id;
                      const isApproved =
                        d.latestStatus === "approved" ||
                        d.latestStatus === "approved_with_comments";
                      const isPending =
                        d.latestStatus === "submitted" || d.latestStatus === "commented";
                      const isRejected = d.latestStatus === "rejected";

                      return (
                        <button
                          key={d.id}
                          onClick={() => setSelectedId(d.id)}
                          className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-2.5 group ${
                            isSelected
                              ? "bg-zinc-900 border-amber-500/80 ring-1 ring-amber-500/40 shadow-sm"
                              : "bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
                          }`}
                        >
                          <div className="mt-0.5">
                            {isApproved ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : isPending ? (
                              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : isRejected ? (
                              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            ) : (
                              <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-[11px] font-bold text-amber-400 truncate">
                                {d.code}
                              </span>
                              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                                {d.latestRev ? `Rev ${d.latestRev}` : "Gốc"}
                              </span>
                            </div>

                            <p
                              className={`text-xs font-semibold leading-tight line-clamp-1 ${
                                isSelected
                                  ? "text-white"
                                  : "text-zinc-300 group-hover:text-amber-300"
                              }`}
                            >
                              {d.name}
                            </p>

                            <div className="flex items-center gap-2 text-[10px] text-zinc-400 flex-wrap">
                              {d.systemGroup && (
                                <span className="bg-zinc-900 px-1 py-0.2 rounded border border-zinc-800">
                                  Hệ {d.systemGroup}
                                </span>
                              )}
                              {d.floorLabel && <span>Tầng {d.floorLabel}</span>}
                              <span className="ml-auto font-mono text-[9px] text-zinc-500">
                                {isApproved
                                  ? "✓ Đã duyệt"
                                  : isPending
                                    ? "⏳ Chờ duyệt"
                                    : isRejected
                                      ? "✕ Từ chối"
                                      : "—"}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {canCreate && (
                  <button
                    onClick={() => setAddOpen(true)}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" /> Thêm Bản Vẽ Mới
                  </button>
                )}
              </div>

              {/* ── CỘT PHẢI (8/12): TRỌNG TÂM TÁC NGHIỆP BẢN VẼ (ACTIVE DRAWING FOCUS HUB) ── */}
              <div className="lg:col-span-8 p-5 sm:p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-5 shadow-sm">
                {selected ? (
                  <DrawingWorkspaceDetail
                    drawing={selected}
                    canManage={canCreate}
                    canDecide={canDecide}
                    onChanged={refresh}
                    onOpenEdit={() => setEditOpen(true)}
                  />
                ) : (
                  <div className="py-16 text-center space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-500">
                      <CurrentKindIcon className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-zinc-300">
                      Chọn một bản vẽ từ danh sách bên trái
                    </p>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                      Xem chi tiết revision, thẩm duyệt kỹ thuật, tải lên bản vẽ mới và kích hoạt
                      cổng phê duyệt kỹ sư.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* ── TAB THAY ĐỔI THIẾT KẾ ── */
          <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4">
            <DesignChangesTab
              me={me}
              addOpen={dcAddOpen}
              onCloseAdd={() => setDcAddOpen(false)}
              drawings={items}
            />
          </div>
        )}
      </main>

      {/* ── MODALS ── */}
      {addOpen && (
        <DrawingFormModal
          defaultKind={kindFilter === "all" ? undefined : kindFilter}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}

      {editOpen && selected && (
        <DrawingFormModal
          drawing={selected}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ── COMPONENT CHI TIẾT BẢN VẼ TRỌNG TÂM (CỘT PHẢI WORKSPACE) ──

function DrawingWorkspaceDetail({
  drawing,
  canManage,
  canDecide,
  onChanged,
  onOpenEdit,
}: {
  drawing: DrawingRow;
  canManage: boolean;
  canDecide: boolean;
  onChanged: () => void;
  onOpenEdit: () => void;
}) {
  const [revisions, setRevisions] = useState<DrawingRevisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyRevId, setBusyRevId] = useState<number | null>(null);
  const [newRev, setNewRev] = useState("");
  const [newSubmittedAt, setNewSubmittedAt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function loadRevs(opts?: { fresh?: boolean }) {
    setLoading(true);
    const url = `/api/drawings/${drawing.id}`;
    const req = opts?.fresh ? fetchFresh(url) : fetch(url);
    req
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const revs: DrawingRevisionRow[] = j?.revisions ?? [];
        setRevisions(revs);
        setNewRev(suggestNextRev(revs));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRevs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.id]);

  async function uploadRevision(file: File) {
    if (!newRev.trim()) {
      showToast("Nhập số rev trước khi tải lên", "error");
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("rev", newRev.trim());
    if (newSubmittedAt) form.append("submittedAt", newSubmittedAt);
    try {
      const res = await fetch(`/api/drawings/${drawing.id}/revisions`, {
        method: "POST",
        body: form,
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Tải lên thất bại", "error");
        return;
      }
      showToast("Đã tải lên rev mới");
      setNewSubmittedAt("");
      loadRevs({ fresh: true });
      onChanged();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setUploading(false);
    }
  }

  async function decide(rev: DrawingRevisionRow, status: RevisionStatus) {
    let decisionNote: string | null = null;
    if (status === "rejected" || status === "approved_with_comments" || status === "commented") {
      const note = await appPrompt(
        `Ghi chú cho quyết định "${STATUS_LABEL[status]}" (tuỳ chọn):`,
        "",
      );
      if (note === null) return;
      decisionNote = note.trim() || null;
    }
    setBusyRevId(rev.id);
    try {
      const res = await fetch(`/api/drawings/revisions/${rev.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, decisionNote }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Không cập nhật được trạng thái", "error");
        return;
      }
      loadRevs({ fresh: true });
      onChanged();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setBusyRevId(null);
    }
  }

  function viewFile(revId: number) {
    window.open(`/api/drawings/revisions/${revId}/file`, "_blank", "noopener,noreferrer");
  }

  const hasPendingNewerThanApproved =
    drawing.approvedRevisionId != null &&
    drawing.latestRevisionId !== drawing.approvedRevisionId &&
    drawing.latestStatus !== "approved" &&
    drawing.latestStatus !== "approved_with_comments";

  const KindIcon = KIND_ICON[drawing.kind];

  return (
    <div className="space-y-4">
      {/* ── HEADER CỦA BẢN VẼ ĐANG CHỌN ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
              <KindIcon className="w-3.5 h-3.5" />
              {drawing.code} • {KIND_LABEL[drawing.kind]}
            </span>
            {drawing.latestStatus && (
              <span
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border ${
                  STATUS_BADGE[drawing.latestStatus]
                }`}
              >
                {STATUS_LABEL[drawing.latestStatus].toUpperCase()}
              </span>
            )}
            {drawing.floorLabel && (
              <span className="text-[11px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-lg">
                Tầng {drawing.floorLabel}
              </span>
            )}
            {drawing.systemGroup && (
              <span className="text-[11px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-lg">
                Hệ {drawing.systemGroup}
              </span>
            )}
          </div>

          <h2 className="text-base sm:text-lg font-bold text-zinc-100">{drawing.name}</h2>
          {drawing.workPackageName && (
            <p className="text-xs text-zinc-400 leading-relaxed">
              Gói thầu liên kết:{" "}
              <b className="text-zinc-200">
                {drawing.workPackageCode} — {drawing.workPackageName}
              </b>
            </p>
          )}
        </div>

        {canManage && (
          <button
            onClick={onOpenEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 shrink-0 transition"
          >
            <Pencil className="w-3.5 h-3.5 text-amber-400" /> Sửa Thông Tin
          </button>
        )}
      </div>

      {/* ── NÚT TO: XEM BẢN VẼ MỚI NHẤT ĐÃ DUYỆT (AFC ACTION HERO) ── */}
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
        <button
          onClick={() => drawing.approvedRevisionId && viewFile(drawing.approvedRevisionId)}
          disabled={!drawing.approvedRevisionId}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition text-white shadow-md"
        >
          <ExternalLink className="w-4 h-4" />
          {drawing.approvedRevisionId
            ? `Xem Bản Mới Nhất Đã Duyệt Thi Công (Rev ${drawing.approvedRev})`
            : "Chưa có revision nào được phê duyệt thi công"}
        </button>

        {hasPendingNewerThanApproved && (
          <p className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg px-3 py-2">
            ⚠️ Revision <b>{drawing.latestRev}</b> đang chờ phê duyệt — hiện trường tiếp tục sử dụng
            bản duyệt <b>Rev {drawing.approvedRev ?? "—"}</b>.
          </p>
        )}
      </div>

      {/* ── 2 KHỐI TÁC NGHIỆP: GATE BPTC & TẢI LÊN REV MỚI ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Khối 1: Gate Biện Pháp Thi Công (nếu kind === 'method') hoặc Thông số kỹ thuật */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
          {drawing.kind === "method" ? (
            <MethodGateSection drawing={drawing} canManageGate={canDecide} onChanged={onChanged} />
          ) : (
            <div className="space-y-2">
              <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-sky-400" />
                Thông Tin Kỹ Thuật Hồ Sơ:
              </span>
              <div className="space-y-1.5 text-xs text-zinc-400 pt-1">
                <p>
                  Mã bản vẽ: <b className="font-mono text-zinc-200">{drawing.code}</b>
                </p>
                <p>
                  Loại hồ sơ: <b className="text-zinc-200">{KIND_LABEL[drawing.kind]}</b>
                </p>
                <p>
                  Vị trí thi công:{" "}
                  <b className="text-zinc-200">{drawing.floorLabel ?? "Toàn tháp"}</b>
                </p>
                <p>
                  Ngày khởi tạo:{" "}
                  <b className="font-mono text-zinc-300">{drawing.createdAt?.slice(0, 10)}</b>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Khối 2: Tải lên Revision Mới */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
          <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-emerald-400" />
            Tải Lên Revision Bản Vẽ Mới:
          </span>

          {canManage ? (
            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                <input
                  value={newRev}
                  onChange={(e) => setNewRev(e.target.value)}
                  placeholder="Rev (A, B...)"
                  className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="date"
                  value={newSubmittedAt}
                  onChange={(e) => setNewSubmittedAt(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*,.dwg,.dxf,.ifc,.zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadRevision(f);
                }}
              />

              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !newRev.trim()}
                className="w-full flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-zinc-700 rounded-lg py-2 text-xs font-bold transition"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />{" "}
                {uploading ? "Đang tải lên..." : "Chọn File Bản Vẽ (PDF, DWG, IFC)"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 pt-2">
              Chỉ Kỹ sư / Quản trị viên mới có quyền upload revision mới.
            </p>
          )}
        </div>
      </div>

      {/* ── CỔNG PHÊ DUYỆT KỸ SƯ & DÒNG THỜI GIAN REVISIONS (ENGINEER SIGN-OFF GATE) ── */}
      <div className="p-4 sm:p-5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
        <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          LỊCH SỬ REVISION & CỔNG DUYỆT KỸ SƯ 3 BÊN
        </h3>

        {loading ? (
          <p className="text-xs text-zinc-500">Đang tải danh sách revision...</p>
        ) : revisions.length === 0 ? (
          <p className="text-xs text-zinc-500 py-3">
            Chưa có revision nào được tải lên cho bản vẽ này.
          </p>
        ) : (
          <div className="space-y-2.5">
            {revisions.map((r) => {
              const StatusIcon = STATUS_ICON[r.status];
              const isBusy = busyRevId === r.id;
              const isApproved = r.status === "approved" || r.status === "approved_with_comments";

              return (
                <div
                  key={r.id}
                  className={`p-3.5 rounded-xl border transition ${
                    isApproved
                      ? "bg-zinc-900/90 border-emerald-500/30"
                      : r.status === "rejected"
                        ? "bg-zinc-900/90 border-rose-500/30"
                        : "bg-zinc-900/90 border-zinc-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-amber-400">
                        Rev {r.rev}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border ${STATUS_BADGE[r.status]}`}
                      >
                        <StatusIcon className="w-3 h-3" /> {STATUS_LABEL[r.status].toUpperCase()}
                      </span>
                    </div>

                    <button
                      onClick={() => viewFile(r.id)}
                      className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-semibold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Xem File (
                      {r.originalName || r.fileName})
                      {r.sizeBytes != null && (
                        <span className="text-zinc-500 ml-1 font-mono text-[10px]">
                          {fmtSize(r.sizeBytes)}
                        </span>
                      )}
                    </button>
                  </div>

                  <p className="text-[11px] text-zinc-400 mt-1 font-mono">
                    Trình: {r.submittedAt ?? "—"} • Duyệt: {r.decidedAt ?? "—"} • Người tải:{" "}
                    {r.uploaderName ?? "—"}
                  </p>

                  {r.decisionNote && (
                    <p className="text-xs text-zinc-300 italic mt-1.5 p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      &ldquo;{r.decisionNote}&rdquo;
                    </p>
                  )}

                  {canDecide && (r.status === "submitted" || r.status === "commented") && (
                    <div className="mt-2.5 pt-2 border-t border-zinc-800 flex gap-1.5 flex-wrap">
                      <button
                        disabled={isBusy}
                        onClick={() => decide(r, "approved")}
                        className="flex items-center gap-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => decide(r, "approved_with_comments")}
                        className="text-xs font-bold bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-emerald-200 px-3 py-1.5 rounded-lg transition"
                      >
                        Duyệt Kèm Ý Kiến
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => decide(r, "commented")}
                        className="flex items-center gap-1 text-xs font-semibold bg-amber-950 hover:bg-amber-900 disabled:opacity-50 text-amber-200 border border-amber-800 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Có Ý Kiến
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => decide(r, "rejected")}
                        className="flex items-center gap-1 text-xs font-semibold bg-rose-950 hover:bg-rose-900 disabled:opacity-50 text-rose-200 border border-rose-800 px-2.5 py-1.5 rounded-lg transition"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Từ Chối
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── FILTER CHIP COMPONENT ──

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
        active
          ? "bg-amber-500/10 border-amber-500/40 text-amber-300 font-semibold"
          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}

// ── FORM TẠO/SỬA BẢN VẼ MODAL ──

function DrawingFormModal({
  drawing,
  defaultKind,
  onClose,
  onSaved,
}: {
  drawing?: DrawingRow;
  defaultKind?: DrawingKind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!drawing;
  const [code, setCode] = useState(drawing?.code ?? "");
  const [name, setName] = useState(drawing?.name ?? "");
  const [kind, setKind] = useState<DrawingKind>(drawing?.kind ?? defaultKind ?? "shop");
  const [systemGroup, setSystemGroup] = useState(drawing?.systemGroup ?? "");
  const [floorLabel, setFloorLabel] = useState(drawing?.floorLabel ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = code.trim() && name.trim();

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const body = {
        code: code.trim(),
        name: name.trim(),
        kind,
        systemGroup: systemGroup.trim() || null,
        floorLabel: floorLabel.trim() || null,
      };
      const res = await fetch(editing ? `/api/drawings/${drawing!.id}` : "/api/drawings", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không lưu được bản vẽ");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg" zIndex="z-[60]">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">{editing ? "Sửa bản vẽ" : "Thêm bản vẽ mới"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Số bản vẽ
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ACMV-SD-T05-001"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Loại bản vẽ
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as DrawingKind)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(KIND_LABEL) as DrawingKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
            Tên bản vẽ
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hệ
            <input
              value={systemGroup}
              onChange={(e) => setSystemGroup(e.target.value)}
              placeholder="ACMV"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Tầng
            <input
              value={floorLabel}
              onChange={(e) => setFloorLabel(e.target.value)}
              placeholder="T05"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        {err && <p className="text-xs text-rose-400">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg"
          >
            Huỷ
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || saving}
            className="px-4 py-1.5 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg font-medium text-on-accent"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── GATE BIỆN PHÁP THI CÔNG ──

type PackageHit = { kind: string; id: number; code: string; name: string };

function MethodGateSection({
  drawing,
  canManageGate,
  onChanged,
}: {
  drawing: DrawingRow;
  canManageGate: boolean;
  onChanged: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PackageHit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`).catch(() => null);
      const j = r?.ok ? await r.json() : null;
      setHits(((j?.hits ?? []) as PackageHit[]).filter((h) => h.kind === "package"));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function assignPackage(pkgId: number) {
    setBusy(true);
    const res = await fetch(`/api/drawings/${drawing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workPackageId: pkgId }),
    });
    setBusy(false);
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      showToast(j?.error ?? "Không gán được nhóm công việc", "error");
      return;
    }
    setPicking(false);
    setQ("");
    setHits([]);
    onChanged();
  }

  async function toggleRequired(next: boolean) {
    if (!drawing.workPackageId) return;
    setBusy(true);
    const res = await fetch(`/api/workpackages/${drawing.workPackageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requiresMethodStatement: next }),
    });
    setBusy(false);
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      showToast(j?.error ?? "Không cập nhật được", "error");
      return;
    }
    onChanged();
  }

  const gateReady = drawing.approvedRevisionId != null;

  return (
    <div className="space-y-2">
      <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
        <HardHat className="w-4 h-4 text-amber-400" />
        Gate Biện Pháp Thi Công:
      </span>

      {drawing.workPackageId ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span>
            Nhóm áp dụng:{" "}
            <span className="font-mono text-amber-300">{drawing.workPackageCode}</span>{" "}
            {drawing.workPackageName}
          </span>
          {canManageGate && (
            <button
              onClick={() => setPicking(true)}
              className="text-xs text-sky-400 hover:underline shrink-0"
            >
              Đổi
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-zinc-400">Chưa gán nhóm công việc — gate chưa áp dụng.</p>
      )}

      {canManageGate && drawing.workPackageId && (
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={!!drawing.workPackageRequiresMethodStatement}
            disabled={busy}
            onChange={(e) => toggleRequired(e.target.checked)}
            className="accent-emerald-600"
          />
          Bắt buộc biện pháp thi công cho nhóm này (chặn tick tiến độ tới khi duyệt)
        </label>
      )}

      {drawing.workPackageId && drawing.workPackageRequiresMethodStatement && (
        <p
          className={`text-xs px-2.5 py-1.5 rounded-lg border ${
            gateReady
              ? "bg-emerald-950 border-emerald-900 text-emerald-200"
              : "bg-amber-950 border-amber-900 text-amber-200"
          }`}
        >
          {gateReady
            ? "Đủ điều kiện thi công — đã có rev duyệt."
            : "Đang chặn tick tiến độ — chờ duyệt biện pháp thi công."}
        </p>
      )}

      {canManageGate && (picking || !drawing.workPackageId) && (
        <div className="relative pt-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm nhóm công việc theo mã/tên..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white"
          />
          {hits.length > 0 && (
            <ul className="mt-1 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => assignPackage(h.id)}
                    disabled={busy}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800"
                  >
                    <span className="font-mono text-zinc-400">{h.code}</span> {h.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picking && (
            <button
              onClick={() => {
                setPicking(false);
                setQ("");
                setHits([]);
              }}
              className="mt-1 text-xs text-zinc-400 hover:text-white"
            >
              Huỷ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── TAB THAY ĐỔI THIẾT KẾ (DESIGN CHANGES) ──

type DesignChangeStatus = "submitted" | "assessing" | "approved" | "rejected" | "drawing_updated";

const DC_STATUS_LABEL: Record<DesignChangeStatus, string> = {
  submitted: "Đã trình",
  assessing: "Đang đánh giá",
  approved: "Được duyệt",
  rejected: "Từ chối",
  drawing_updated: "Đã cập nhật bản vẽ",
};
const DC_STATUS_BADGE: Record<DesignChangeStatus, string> = {
  submitted: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  assessing: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  rejected: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  drawing_updated: "bg-violet-500/10 text-violet-400 border-violet-500/30",
};
const DC_STATUS_ICON: Record<DesignChangeStatus, LucideIcon> = {
  submitted: Clock,
  assessing: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  drawing_updated: BadgeCheck,
};

type DesignChangeRow = {
  id: number;
  code: string;
  title: string;
  systemId: number | null;
  systemCode: string | null;
  systemName: string | null;
  drawingId: number | null;
  drawingCode: string | null;
  drawingName: string | null;
  requestedByNote: string | null;
  reason: string;
  impactTechnical: string | null;
  impactCost: string | null;
  impactSchedule: string | null;
  status: DesignChangeStatus;
  decisionNote: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdByName: string | null;
  createdAt: string;
};

function canDecideDesignChange(role?: string) {
  return role === "admin" || role === "pm";
}

function DesignChangesTab({
  me,
  addOpen,
  onCloseAdd,
  drawings,
}: {
  me: Me | null;
  addOpen: boolean;
  onCloseAdd: () => void;
  drawings: DrawingRow[];
}) {
  const [items, setItems] = useState<DesignChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<DesignChangeStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const canCreate = canManageDrawings(me?.role);
  const canDecide = canDecideDesignChange(me?.role);

  function buildQuery() {
    const sp = new URLSearchParams();
    if (statusFilter !== "all") sp.set("status", statusFilter);
    return sp.toString();
  }

  function load() {
    const qs = buildQuery();
    return fetch(`/api/design-changes${qs ? `?${qs}` : ""}`).then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    setLoading(true);
    load()
      .then((d) => setItems(d?.items ?? []))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function refresh() {
    const qs = buildQuery();
    const res = await fetchFresh(`/api/design-changes${qs ? `?${qs}` : ""}`);
    const d = res.ok ? await res.json() : null;
    setItems(d?.items ?? []);
  }

  const selected = items.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="Tất cả trạng thái"
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          {(Object.keys(DC_STATUS_LABEL) as DesignChangeStatus[]).map((s) => (
            <FilterChip
              key={s}
              label={DC_STATUS_LABEL[s]}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            />
          ))}
        </div>
      </div>

      {loading ? (
        <PageSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Pencil}
          title="Chưa có thay đổi thiết kế nào"
          message={
            canCreate
              ? 'Bấm "Thêm thay đổi thiết kế" để tiếp nhận yêu cầu mới.'
              : "Chưa có dữ liệu."
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((dc) => {
            const StatusIcon = DC_STATUS_ICON[dc.status];
            return (
              <button
                key={dc.id}
                onClick={() => setSelectedId(dc.id)}
                className="text-left bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-amber-400">{dc.code}</p>
                    <p className="font-semibold text-sm text-zinc-100 truncate">{dc.title}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border shrink-0 ${DC_STATUS_BADGE[dc.status]}`}
                  >
                    <StatusIcon className="w-3 h-3" /> {DC_STATUS_LABEL[dc.status]}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                  {dc.systemName && <span>Hệ {dc.systemName}</span>}
                  {dc.drawingCode && <span>Bản vẽ {dc.drawingCode}</span>}
                </div>
                <p className="text-xs text-zinc-400 line-clamp-2">{dc.reason}</p>
                <div className="text-[11px] text-zinc-500 font-mono">
                  {dc.createdAt?.slice(0, 10)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <DesignChangeDetailModal
          designChange={selected}
          canManage={canCreate}
          canDecide={canDecide}
          drawings={drawings}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
      {addOpen && (
        <DesignChangeFormModal
          drawings={drawings}
          onClose={onCloseAdd}
          onSaved={() => {
            onCloseAdd();
            refresh();
          }}
        />
      )}
    </div>
  );
}

function DesignChangeFormModal({
  drawings,
  onClose,
  onSaved,
}: {
  drawings: DrawingRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [drawingId, setDrawingId] = useState("");
  const [requestedByNote, setRequestedByNote] = useState("");
  const [impactTechnical, setImpactTechnical] = useState("");
  const [impactCost, setImpactCost] = useState("");
  const [impactSchedule, setImpactSchedule] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim() && reason.trim();

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/design-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          reason: reason.trim(),
          drawingId: drawingId ? Number(drawingId) : null,
          requestedByNote: requestedByNote.trim() || null,
          impactTechnical: impactTechnical.trim() || null,
          impactCost: impactCost.trim() || null,
          impactSchedule: impactSchedule.trim() || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không lưu được thay đổi thiết kế");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg" zIndex="z-[60]">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">Thêm thay đổi thiết kế</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tiêu đề
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Đổi cao độ trần kỹ thuật tầng 5"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-400 block">
          Bản vẽ liên quan (tuỳ chọn)
          <select
            value={drawingId}
            onChange={(e) => setDrawingId(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">— Chưa gắn bản vẽ —</option>
            {drawings.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400 block">
          Ai/đơn vị nào yêu cầu (tuỳ chọn)
          <input
            value={requestedByNote}
            onChange={(e) => setRequestedByNote(e.target.value)}
            placeholder="CĐT / TVGS / Nhà thầu ACMV"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-400 block">
          Lý do thay đổi
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-400 block">
          Tác động kỹ thuật (tuỳ chọn)
          <textarea
            value={impactTechnical}
            onChange={(e) => setImpactTechnical(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-400 block">
          Tác động chi phí (tuỳ chọn)
          <textarea
            value={impactCost}
            onChange={(e) => setImpactCost(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-400 block">
          Tác động tiến độ (tuỳ chọn)
          <textarea
            value={impactSchedule}
            onChange={(e) => setImpactSchedule(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {err && <p className="text-xs text-rose-400">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Huỷ
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || saving}
            className="px-3 py-2 text-sm rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 font-semibold text-on-accent"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DesignChangeDetailModal({
  designChange,
  canManage,
  canDecide,
  drawings,
  onClose,
  onChanged,
}: {
  designChange: DesignChangeRow;
  canManage: boolean;
  canDecide: boolean;
  drawings: DrawingRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const dc = designChange;
  const StatusIcon = DC_STATUS_ICON[dc.status];
  const isPending = dc.status === "submitted" || dc.status === "assessing";

  async function decide(decision: "approved" | "rejected") {
    const hasImpact = !!(dc.impactCost?.trim() || dc.impactSchedule?.trim());
    let decisionNote: string | null = null;
    if (decision === "rejected" || hasImpact) {
      decisionNote = await appPrompt(
        decision === "rejected"
          ? "Lý do từ chối:"
          : "Có tác động chi phí/tiến độ — ghi chú quyết định (bắt buộc):",
      );
      if (decisionNote == null) return;
      if (!decisionNote.trim() && (decision === "rejected" || hasImpact)) {
        await appAlert("Cần ghi rõ ghi chú quyết định");
        return;
      }
    } else {
      const ok = await appConfirm(
        decision === "approved" ? "Duyệt thay đổi thiết kế này?" : "Từ chối thay đổi thiết kế này?",
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/design-changes/${dc.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, decisionNote }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        await appAlert(j?.error ?? "Không quyết định được");
        return;
      }
      showToast(decision === "approved" ? "Đã duyệt" : "Đã từ chối");
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function markDrawingUpdated() {
    const ok = await appConfirm("Xác nhận đã cập nhật bản vẽ theo thay đổi thiết kế này?");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/design-changes/${dc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markDrawingUpdated: true }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        await appAlert(j?.error ?? "Không đánh dấu được");
        return;
      }
      showToast("Đã đánh dấu cập nhật bản vẽ");
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const linkedDrawing = dc.drawingId ? drawings.find((d) => d.id === dc.drawingId) : null;

  return (
    <Modal onClose={onClose} className="max-w-lg" zIndex="z-[60]">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs font-bold text-amber-400">{dc.code}</p>
            <h2 className="font-semibold text-base">{dc.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border ${DC_STATUS_BADGE[dc.status]}`}
        >
          <StatusIcon className="w-3 h-3" /> {DC_STATUS_LABEL[dc.status]}
        </span>

        <div className="text-xs text-zinc-400 space-y-1">
          {dc.systemName && <p>Hệ: {dc.systemName}</p>}
          {dc.requestedByNote && <p>Yêu cầu bởi: {dc.requestedByNote}</p>}
          <p>Người tạo: {dc.createdByName ?? "—"}</p>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-zinc-400 font-semibold">Lý do thay đổi:</p>
            <p className="whitespace-pre-wrap text-xs text-zinc-200 mt-0.5">{dc.reason}</p>
          </div>
          {dc.impactTechnical && (
            <div>
              <p className="text-xs text-zinc-400 font-semibold">Tác động kỹ thuật:</p>
              <p className="whitespace-pre-wrap text-xs text-zinc-200 mt-0.5">
                {dc.impactTechnical}
              </p>
            </div>
          )}
          {dc.impactCost && (
            <div>
              <p className="text-xs text-zinc-400 font-semibold">Tác động chi phí:</p>
              <p className="whitespace-pre-wrap text-xs text-zinc-200 mt-0.5">{dc.impactCost}</p>
            </div>
          )}
          {dc.impactSchedule && (
            <div>
              <p className="text-xs text-zinc-400 font-semibold">Tác động tiến độ:</p>
              <p className="whitespace-pre-wrap text-xs text-zinc-200 mt-0.5">
                {dc.impactSchedule}
              </p>
            </div>
          )}
          {dc.decisionNote && (
            <div>
              <p className="text-xs text-zinc-400 font-semibold">Ghi chú quyết định:</p>
              <p className="whitespace-pre-wrap text-xs text-zinc-200 mt-0.5">{dc.decisionNote}</p>
              {dc.decidedByName && (
                <p className="text-[11px] text-zinc-400 font-mono mt-1">
                  Quyết bởi {dc.decidedByName}
                  {dc.decidedAt ? ` — ${dc.decidedAt.slice(0, 10)}` : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {linkedDrawing ? (
          <div className="text-xs text-zinc-400 border-t border-zinc-800 pt-2">
            Bản vẽ liên quan:{" "}
            <span className="font-mono text-zinc-200">
              {linkedDrawing.code} — {linkedDrawing.name}
            </span>
          </div>
        ) : dc.status === "approved" ? (
          <p className="text-xs text-amber-300 border-t border-zinc-800 pt-2">
            Chưa gắn bản vẽ — tạo bản vẽ mới ở tab &quot;Bản vẽ&quot; rồi quay lại gắn sau.
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-zinc-800">
          {isPending && canDecide && (
            <>
              <button
                onClick={() => decide("rejected")}
                disabled={busy}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-rose-700 text-rose-200 hover:bg-rose-900 disabled:opacity-50"
              >
                Từ chối
              </button>
              <button
                onClick={() => decide("approved")}
                disabled={busy}
                className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent"
              >
                Duyệt
              </button>
            </>
          )}
          {dc.status === "approved" && canManage && (
            <button
              onClick={markDrawingUpdated}
              disabled={busy}
              className="px-3 py-2 text-xs font-bold rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-on-accent"
            >
              Đánh dấu đã cập nhật bản vẽ
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
