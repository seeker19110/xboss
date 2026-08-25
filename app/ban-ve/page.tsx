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
  SlidersHorizontal,
  FolderOpen,
  Building2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ShieldCheck,
  Cpu,
  type LucideIcon,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appPrompt, appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

// ── TYPES & INTERFACES ──

export type DrawingKind = "design" | "shop" | "asbuilt" | "bim" | "method";
export type RevisionStatus =
  "submitted" | "commented" | "approved" | "approved_with_comments" | "rejected" | "superseded";

export type TradeDiscipline = "all" | "M" | "E" | "P" | "F" | "ELV";

export type DrawingViewTab =
  "all" | "design" | "approved" | "submitted" | "unapproved" | "rejected";

const KIND_LABEL: Record<DrawingKind, string> = {
  design: "Bản vẽ thiết kế",
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
  submitted: "Chờ duyệt",
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
  // M99 PR5 — revision do plugin AutoCAD đẩy lên mang kèm ngữ cảnh chuẩn hóa; tải tay từ web
  // (sourceTool = null) thì các trường này rỗng, chip "Từ plugin" tự ẩn.
  sourceTool: string | null;
  rulePackVersion: string | null;
  kiemDinh: { ok: boolean; soLoi: number; soCanhBao: number; canhBao: string[] } | null;
  contentSha256: string | null;
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
  if (/^[0-9]+$/.test(last)) return String(parseInt(last, 10) + 1);
  if (!last) return "A";
  return "";
}

function parseFloorSortKey(label: string | null): number {
  if (!label) return 9999;
  const clean = label.trim().toUpperCase();
  if (clean.includes("B") || clean.includes("HẦM") || clean.includes("HAM")) {
    const match = clean.match(/\d+/);
    const num = match ? parseInt(match[0], 10) : 1;
    return -100 - (10 - num);
  }
  if (
    clean.includes("MÁI") ||
    clean.includes("MAI") ||
    clean.includes("TUM") ||
    clean.includes("ROOF")
  ) {
    return 9000;
  }
  const match = clean.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }
  return 8000;
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
  const defaultKind: DrawingKind | "all" =
    fixedKind ??
    ((DRAWING_KIND_VALUES as readonly string[]).includes(kindParam ?? "")
      ? (kindParam as DrawingKind)
      : "all");

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<DrawingRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Top Tabs: Tất cả | Bản vẽ thiết kế | Bản vẽ trình duyệt | Bản vẽ đã duyệt | Bản vẽ chưa duyệt
  const [viewTab, setViewTab] = useState<DrawingViewTab>("all");
  const [selectedDiscipline, setSelectedDiscipline] = useState<TradeDiscipline>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [collapsedFloors, setCollapsedFloors] = useState<Record<string, boolean>>({});

  const canCreate = canManageDrawings(me?.role);
  const canDecide = canDecideRevision(me?.role);

  function load() {
    return fetch(`/api/drawings`).then((r) => (r.ok ? r.json() : null));
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
  }, []);

  async function refresh() {
    const res = await fetchFresh(`/api/drawings`);
    const d = res.ok ? await res.json() : null;
    const drawings: DrawingRow[] = d?.drawings ?? [];
    setItems(drawings);
    if (drawings.length > 0 && !drawings.some((x) => x.id === selectedId)) {
      setSelectedId(drawings[0].id);
    }
  }

  // Base scope for the current page (if fixedKind is specified)
  const pageBaseItems = useMemo(() => {
    if (defaultKind !== "all") {
      return items.filter((d) => d.kind === defaultKind);
    }
    return items;
  }, [items, defaultKind]);

  // Tab Counts across relevant dataset
  const tabCounts = useMemo(() => {
    const designCount = items.filter((d) => d.kind === "design").length;
    const base = defaultKind === "all" ? items : pageBaseItems;
    const allCount = base.length;
    const submittedCount = base.filter(
      (d) => d.latestStatus === "submitted" || d.latestStatus === "commented",
    ).length;
    const approvedCount = base.filter(
      (d) =>
        d.latestStatus === "approved" ||
        d.latestStatus === "approved_with_comments" ||
        d.approvedRevisionId != null,
    ).length;
    const unapprovedCount = base.filter(
      (d) => d.latestStatus !== "approved" && d.latestStatus !== "approved_with_comments",
    ).length;
    const rejectedCount = base.filter((d) => d.latestStatus === "rejected").length;

    return {
      all: allCount,
      design: designCount,
      submitted: submittedCount,
      approved: approvedCount,
      unapproved: unapprovedCount,
      rejected: rejectedCount,
    };
  }, [items, pageBaseItems, defaultKind]);

  // Filter by Top Tab
  const tabFiltered = useMemo(() => {
    if (viewTab === "design") {
      return items.filter((d) => d.kind === "design");
    }

    const base = defaultKind === "all" ? items : pageBaseItems;

    if (viewTab === "approved") {
      return base.filter(
        (d) =>
          d.latestStatus === "approved" ||
          d.latestStatus === "approved_with_comments" ||
          d.approvedRevisionId != null,
      );
    }
    if (viewTab === "submitted") {
      return base.filter((d) => d.latestStatus === "submitted" || d.latestStatus === "commented");
    }
    if (viewTab === "unapproved") {
      return base.filter(
        (d) => d.latestStatus !== "approved" && d.latestStatus !== "approved_with_comments",
      );
    }
    if (viewTab === "rejected") {
      return base.filter((d) => d.latestStatus === "rejected");
    }
    return base;
  }, [items, pageBaseItems, viewTab, defaultKind]);

  // Filter by Discipline & Search
  const filtered = useMemo(() => {
    let res = tabFiltered;
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
  }, [tabFiltered, search, selectedDiscipline]);

  // Group drawings by floor
  const floorGroups = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        floorKey: string;
        floorLabel: string;
        drawings: DrawingRow[];
        approvedCount: number;
        pendingCount: number;
        rejectedCount: number;
      }
    >();

    for (const d of filtered) {
      const key = d.floorLabel?.trim() || "Toàn tháp / Chung";
      const existing = groupsMap.get(key);
      const isApproved =
        d.latestStatus === "approved" ||
        d.latestStatus === "approved_with_comments" ||
        d.approvedRevisionId != null;
      const isPending = d.latestStatus === "submitted" || d.latestStatus === "commented";
      const isRejected = d.latestStatus === "rejected";

      if (existing) {
        existing.drawings.push(d);
        if (isApproved) existing.approvedCount++;
        if (isPending) existing.pendingCount++;
        if (isRejected) existing.rejectedCount++;
      } else {
        groupsMap.set(key, {
          floorKey: key,
          floorLabel: key,
          drawings: [d],
          approvedCount: isApproved ? 1 : 0,
          pendingCount: isPending ? 1 : 0,
          rejectedCount: isRejected ? 1 : 0,
        });
      }
    }

    return Array.from(groupsMap.values()).sort(
      (a, b) => parseFloorSortKey(a.floorKey) - parseFloorSortKey(b.floorKey),
    );
  }, [filtered]);

  const selected =
    filtered.find((d) => d.id === selectedId) ??
    items.find((d) => d.id === selectedId) ??
    (filtered.length > 0 ? filtered[0] : null);

  // Quick stats
  const stats = useMemo(() => {
    const base = defaultKind === "all" ? items : pageBaseItems;
    const total = base.length;
    const approved = base.filter(
      (d) =>
        d.latestStatus === "approved" ||
        d.latestStatus === "approved_with_comments" ||
        d.approvedRevisionId != null,
    ).length;
    const pending = base.filter(
      (d) => d.latestStatus === "submitted" || d.latestStatus === "commented",
    ).length;
    const rejected = base.filter((d) => d.latestStatus === "rejected").length;
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, approved, pending, rejected, pct };
  }, [items, pageBaseItems, defaultKind]);

  const CurrentKindIcon = defaultKind === "all" ? FileText : KIND_ICON[defaultKind];

  const pageTitle =
    defaultKind === "all"
      ? "HỒ SƠ BẢN VẼ KỸ THUẬT"
      : defaultKind === "shop"
        ? "QUẢN LÝ BẢN VẼ: SHOP DRAWING"
        : defaultKind === "design"
          ? "QUẢN LÝ BẢN VẼ: THIẾT KẾ"
          : `QUẢN LÝ BẢN VẼ: ${KIND_LABEL[defaultKind].toUpperCase()}`;

  function toggleFloor(floorKey: string) {
    setCollapsedFloors((prev) => ({
      ...prev,
      [floorKey]: !prev[floorKey],
    }));
  }

  function toggleAllFloors(collapse: boolean) {
    const next: Record<string, boolean> = {};
    for (const g of floorGroups) {
      next[g.floorKey] = collapse;
    }
    setCollapsedFloors(next);
  }

  const allCollapsed =
    floorGroups.length > 0 && floorGroups.every((g) => !!collapsedFloors[g.floorKey]);

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
                  {pageTitle}
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
          canCreate ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Thêm bản vẽ"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition shrink-0 text-on-accent shadow-sm h-10 min-h-[44px]"
            >
              <Plus className="w-4 h-4" /> <span>Thêm bản vẽ</span>
            </button>
          ) : undefined
        }
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* ── VIEW TABS ── */}
        <div className="p-2 sm:p-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {/* Tab Tất cả */}
            <button
              onClick={() => setViewTab("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 min-h-[38px] ${
                viewTab === "all"
                  ? "bg-amber-500 text-on-accent-dark font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Tất cả</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                  viewTab === "all" ? "bg-zinc-950/20 text-zinc-950" : "bg-zinc-900 text-zinc-400"
                }`}
              >
                {tabCounts.all}
              </span>
            </button>

            {/* Tab Bản vẽ thiết kế */}
            <button
              onClick={() => setViewTab("design")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 min-h-[38px] ${
                viewTab === "design"
                  ? "bg-amber-500 text-on-accent-dark font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Bản vẽ thiết kế</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                  viewTab === "design"
                    ? "bg-zinc-950/20 text-zinc-950"
                    : "bg-zinc-900 text-zinc-400"
                }`}
              >
                {tabCounts.design}
              </span>
            </button>

            {/* Tab Bản vẽ đã duyệt */}
            <button
              onClick={() => setViewTab("approved")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 min-h-[38px] ${
                viewTab === "approved"
                  ? "bg-amber-500 text-on-accent-dark font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Bản vẽ đã duyệt</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                  viewTab === "approved"
                    ? "bg-zinc-950/20 text-zinc-950"
                    : "bg-zinc-900 text-emerald-400"
                }`}
              >
                {tabCounts.approved}
              </span>
            </button>

            {/* Tab Bản vẽ trình duyệt */}
            <button
              onClick={() => setViewTab("submitted")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 min-h-[38px] ${
                viewTab === "submitted"
                  ? "bg-amber-500 text-on-accent-dark font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Bản vẽ trình duyệt</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                  viewTab === "submitted"
                    ? "bg-zinc-950/20 text-zinc-950"
                    : "bg-zinc-900 text-amber-400"
                }`}
              >
                {tabCounts.submitted}
              </span>
            </button>

            {/* Tab Bản vẽ chưa duyệt */}
            <button
              onClick={() => setViewTab("unapproved")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 min-h-[38px] ${
                viewTab === "unapproved"
                  ? "bg-amber-500 text-on-accent-dark font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Bản vẽ chưa duyệt</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                  viewTab === "unapproved"
                    ? "bg-zinc-950/20 text-zinc-950"
                    : "bg-zinc-900 text-rose-400"
                }`}
              >
                {tabCounts.unapproved}
              </span>
            </button>

            {/* Tab Từ chối */}
            <button
              onClick={() => setViewTab("rejected")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 min-h-[38px] ${
                viewTab === "rejected"
                  ? "bg-amber-500 text-on-accent-dark font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:text-white border border-zinc-700/60"
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Từ chối</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                  viewTab === "rejected"
                    ? "bg-zinc-950/20 text-zinc-950"
                    : "bg-zinc-900 text-rose-400"
                }`}
              >
                {tabCounts.rejected}
              </span>
            </button>
          </div>
        </div>

        {/* ── WORKSPACE VIEW: MASTER-DETAIL 2-COLUMN ERGONOMIC LAYOUT ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* ── CỘT TRÁI (5/12): DANH SÁCH THEO TẦNG (FLOOR GROUPED REGISTER) ── */}
          <div className="lg:col-span-5 p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3 shadow-sm">
            {/* Lọc Phân Hệ & Tìm Kiếm */}
            <div className="space-y-2 pb-2.5 border-b border-zinc-800">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  Lọc Phân Hệ:
                </span>
                <span className="font-mono text-zinc-400 text-[11px]">
                  {filtered.length} bản vẽ • {floorGroups.length} tầng
                </span>
              </div>

              <div className="grid grid-cols-6 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-[10px] font-mono font-bold text-center">
                {(["all", "M", "E", "P", "F", "ELV"] as TradeDiscipline[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDiscipline(d)}
                    className={`py-1 rounded-lg transition min-h-[30px] ${
                      selectedDiscipline === d
                        ? "bg-zinc-800 text-amber-300 shadow-xs border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {d === "all" ? "Tất Cả" : d}
                  </button>
                ))}
              </div>

              {/* Quick Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm mã, tên, hệ, tầng..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-7 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-amber-500 transition min-h-[38px]"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Header điều khiển tầng */}
              <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                <span className="font-semibold text-zinc-300 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" /> Danh sách theo tầng:
                </span>
                <button
                  onClick={() => toggleAllFloors(!allCollapsed)}
                  className="text-amber-400 hover:underline font-mono text-[10px]"
                >
                  {allCollapsed ? "Mở rộng tất cả" : "Thu gọn tất cả"}
                </button>
              </div>
            </div>

            {/* Danh Sách Bản Vẽ Nhóm Theo Tầng (Floor Accordion) */}
            <div className="space-y-2.5 max-h-[calc(100vh-360px)] min-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
              {floorGroups.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-800 rounded-xl space-y-1">
                  <p className="font-semibold text-zinc-300">Chưa có bản vẽ nào khớp bộ lọc.</p>
                  <p className="text-[11px] text-zinc-500">
                    Thử chọn lại phân hệ, xóa từ khóa tìm kiếm hoặc đổi tab trạng thái.
                  </p>
                </div>
              ) : (
                floorGroups.map((group) => {
                  const isCollapsed = !!collapsedFloors[group.floorKey];
                  return (
                    <div
                      key={group.floorKey}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/70 overflow-hidden shadow-xs"
                    >
                      {/* Tiêu đề nhóm tầng */}
                      <button
                        onClick={() => toggleFloor(group.floorKey)}
                        className="w-full flex items-center justify-between p-2.5 text-left bg-zinc-900/80 hover:bg-zinc-850 border-b border-zinc-800/80 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="font-bold text-xs text-zinc-100 truncate">
                            {group.floorLabel.startsWith("T") ||
                            group.floorLabel.startsWith("H") ||
                            group.floorLabel.includes("Tầng")
                              ? group.floorLabel
                              : `Tầng ${group.floorLabel}`}
                          </span>
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {group.drawings.length} bản vẽ
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {group.approvedCount > 0 && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              ✓ {group.approvedCount}
                            </span>
                          )}
                          {group.pendingCount > 0 && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              ⏳ {group.pendingCount}
                            </span>
                          )}
                          {group.rejectedCount > 0 && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              ✕ {group.rejectedCount}
                            </span>
                          )}
                          {isCollapsed ? (
                            <ChevronDown className="w-4 h-4 text-zinc-400 ml-1" />
                          ) : (
                            <ChevronUp className="w-4 h-4 text-zinc-400 ml-1" />
                          )}
                        </div>
                      </button>

                      {/* Danh sách bản vẽ thuộc tầng này */}
                      {!isCollapsed && (
                        <div className="p-1.5 space-y-1.5">
                          {group.drawings.map((d) => {
                            const isSelected = selected?.id === d.id;
                            const isApproved =
                              d.latestStatus === "approved" ||
                              d.latestStatus === "approved_with_comments" ||
                              d.approvedRevisionId != null;
                            const isPending =
                              d.latestStatus === "submitted" || d.latestStatus === "commented";
                            const isRejected = d.latestStatus === "rejected";

                            return (
                              <button
                                key={d.id}
                                onClick={() => setSelectedId(d.id)}
                                className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-start gap-2.5 group min-h-[44px] ${
                                  isSelected
                                    ? "bg-zinc-900 border-amber-500/80 ring-1 ring-amber-500/40 shadow-sm"
                                    : "bg-zinc-950/40 border-zinc-800/60 hover:bg-zinc-900 hover:border-zinc-700"
                                }`}
                              >
                                <div className="mt-0.5 shrink-0">
                                  {isApproved ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  ) : isPending ? (
                                    <Clock className="w-4 h-4 text-amber-400" />
                                  ) : isRejected ? (
                                    <XCircle className="w-4 h-4 text-rose-400" />
                                  ) : (
                                    <FileText className="w-4 h-4 text-zinc-500" />
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
                                    className={`text-xs font-semibold leading-tight line-clamp-2 ${
                                      isSelected
                                        ? "text-white"
                                        : "text-zinc-200 group-hover:text-amber-300"
                                    }`}
                                  >
                                    {d.name}
                                  </p>

                                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 flex-wrap">
                                    {d.systemGroup && (
                                      <span className="bg-zinc-900 px-1.5 py-0.2 rounded border border-zinc-800 text-zinc-300">
                                        Hệ {d.systemGroup}
                                      </span>
                                    )}
                                    {d.kind !== defaultKind && (
                                      <span className="bg-zinc-900 px-1.5 py-0.2 rounded border border-zinc-800 text-zinc-400">
                                        {KIND_LABEL[d.kind]}
                                      </span>
                                    )}
                                    <span className="ml-auto font-mono text-[9px]">
                                      {isApproved ? (
                                        <span className="text-emerald-400 font-semibold">
                                          ✓ Đã duyệt
                                        </span>
                                      ) : isPending ? (
                                        <span className="text-amber-400 font-semibold">
                                          ⏳ Chờ duyệt
                                        </span>
                                      ) : isRejected ? (
                                        <span className="text-rose-400 font-semibold">
                                          ✕ Từ chối
                                        </span>
                                      ) : (
                                        <span className="text-zinc-500">Chưa có file</span>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {canCreate && (
              <button
                onClick={() => setAddOpen(true)}
                className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 flex items-center justify-center gap-1.5 transition min-h-[44px]"
              >
                <Plus className="w-4 h-4 text-amber-400" /> Thêm Bản Vẽ Mới
              </button>
            )}
          </div>

          {/* ── CỘT PHẢI (7/12): LIỆT KÊ CÁC PHIÊN BẢN CHỈNH SỬA & CHI TIẾT BẢN VẼ (REVISION HISTORY HUB) ── */}
          <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-5 shadow-sm">
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
                <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400">
                  <CurrentKindIcon className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-zinc-200">
                  Chọn một bản vẽ từ danh sách theo tầng bên trái
                </p>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Xem toàn bộ lịch sử các phiên bản chỉnh sửa, tải file bản vẽ, phê duyệt kỹ sư và
                  tải lên revision mới.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── MODALS ── */}
      {addOpen && (
        <DrawingFormModal
          defaultKind={defaultKind === "all" ? undefined : defaultKind}
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

// ── COMPONENT CHI TIẾT & LIỆT KÊ CÁC PHIÊN BẢN CHỈNH SỬA (CỘT PHẢI) ──

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
      showToast("Nhập số hiệu phiên bản (Rev) trước khi tải lên", "error");
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("rev", newRev.trim().toUpperCase());
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
      showToast("Đã tải lên phiên bản chỉnh sửa mới thành công");
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
      showToast(`Đã cập nhật trạng thái: ${STATUS_LABEL[status]}`);
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

  const KindIcon = KIND_ICON[drawing.kind] ?? FileText;

  return (
    <div className="space-y-4">
      {/* ── HEADER CỦA BẢN VẼ ĐANG CHỌN ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="space-y-1.5 min-w-0">
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
              <span className="text-[11px] font-mono text-zinc-300 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-lg">
                Tầng {drawing.floorLabel}
              </span>
            )}
            {drawing.systemGroup && (
              <span className="text-[11px] font-mono text-zinc-300 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-lg">
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 shrink-0 transition min-h-[38px]"
          >
            <Pencil className="w-3.5 h-3.5 text-amber-400" /> Sửa Thông Tin
          </button>
        )}
      </div>

      {/* ── NÚT TO: XEM BẢN VẼ MỚI NHẤT ĐÃ DUYỆT THI CÔNG (AFC ACTION HERO) ── */}
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
        <button
          onClick={() => drawing.approvedRevisionId && viewFile(drawing.approvedRevisionId)}
          disabled={!drawing.approvedRevisionId}
          className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition text-on-accent shadow-md min-h-[44px]"
        >
          <ExternalLink className="w-4 h-4" />
          {drawing.approvedRevisionId
            ? `Xem Bản Mới Nhất Đã Duyệt Thi Công (Rev ${drawing.approvedRev})`
            : "Chưa có revision nào được phê duyệt thi công"}
        </button>

        {hasPendingNewerThanApproved && (
          <p className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg px-3 py-2">
            ⚠️ Phiên bản <b>Rev {drawing.latestRev}</b> đang chờ phê duyệt — hiện trường tiếp tục sử
            dụng bản duyệt <b>Rev {drawing.approvedRev ?? "—"}</b>.
          </p>
        )}
      </div>

      {/* ── KHỐI LIỆT KÊ CÁC PHIÊN BẢN CHỈNH SỬA & TẢI LÊN REV MỚI ── */}
      <div className="p-4 sm:p-5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            DANH SÁCH CÁC PHIÊN BẢN CHỈNH SỬA (REVISIONS)
          </h3>
          <span className="font-mono text-xs text-zinc-400">{revisions.length} phiên bản</span>
        </div>

        {/* Form Tải lên Revision Mới */}
        {canManage && (
          <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-3">
            <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-emerald-400" />
              Tải Lên Phiên Bản Chỉnh Sửa Mới:
            </span>

            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Mã phiên bản (Rev)</label>
                  <input
                    value={newRev}
                    onChange={(e) => setNewRev(e.target.value)}
                    placeholder="Rev (A, B, C, 0, 1...)"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white font-mono uppercase font-bold min-h-[38px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Ngày trình nộp</label>
                  <input
                    type="date"
                    value={newSubmittedAt}
                    onChange={(e) => setNewSubmittedAt(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white min-h-[38px]"
                  />
                </div>
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
                className="w-full flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-xl py-2.5 text-xs font-bold transition text-zinc-200 min-h-[44px]"
              >
                <Upload className="w-4 h-4 text-amber-400" />{" "}
                {uploading ? "Đang tải lên..." : "Chọn File Bản Vẽ (PDF, DWG, IFC, ZIP)"}
              </button>
            </div>
          </div>
        )}

        {/* Danh sách các phiên bản đã tải lên */}
        {loading ? (
          <p className="text-xs text-zinc-400 py-3">Đang tải danh sách phiên bản...</p>
        ) : revisions.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-400 border border-dashed border-zinc-800 rounded-xl space-y-1">
            <p className="font-semibold text-zinc-300">Chưa có phiên bản nào được tải lên.</p>
            {canManage && (
              <p className="text-[11px] text-zinc-500">
                Nhập số Rev và chọn file ở trên để tạo phiên bản đầu tiên.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {revisions.map((r) => {
              const StatusIcon = STATUS_ICON[r.status] ?? FileText;
              const isBusy = busyRevId === r.id;
              const isApproved = r.status === "approved" || r.status === "approved_with_comments";

              return (
                <div
                  key={r.id}
                  className={`p-3.5 rounded-xl border transition ${
                    isApproved
                      ? "bg-zinc-900/90 border-emerald-500/30 ring-1 ring-emerald-500/10"
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
                      className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-semibold min-h-[36px]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Xem File (
                      {r.originalName || r.fileName})
                      {r.sizeBytes != null && (
                        <span className="text-zinc-400 ml-1 font-mono text-[10px]">
                          {fmtSize(r.sizeBytes)}
                        </span>
                      )}
                    </button>
                  </div>

                  <p className="text-[11px] text-zinc-400 mt-1 font-mono">
                    Trình nộp: <b className="text-zinc-300">{r.submittedAt ?? "—"}</b> • Phê duyệt:{" "}
                    <b className="text-zinc-300">{r.decidedAt ?? "—"}</b> • Kỹ sư tải:{" "}
                    <b className="text-zinc-300">{r.uploaderName ?? "—"}</b>
                  </p>

                  {/* M99 PR5 — nguồn plugin AutoCAD: rulepack + kết quả kiểm định server (chip có
                      nhãn chữ, không truyền thông tin chỉ qua màu). */}
                  {r.sourceTool === "plugin" && (
                    <div className="mt-1.5">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border bg-violet-950/60 border-violet-800 text-violet-300"
                        title={
                          r.contentSha256
                            ? `Đẩy lên từ plugin AutoCAD — sha256 ${r.contentSha256.slice(0, 16)}…`
                            : "Đẩy lên từ plugin AutoCAD"
                        }
                      >
                        <Cpu className="w-3 h-3" />
                        Từ plugin
                        {r.rulePackVersion ? ` · rulepack ${r.rulePackVersion}` : ""}
                        {r.kiemDinh
                          ? ` · ${r.kiemDinh.soLoi} lỗi / ${r.kiemDinh.soCanhBao} cảnh báo`
                          : ""}
                      </span>
                    </div>
                  )}

                  {r.decisionNote && (
                    <p className="text-xs text-zinc-300 italic mt-1.5 p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      &ldquo;{r.decisionNote}&rdquo;
                    </p>
                  )}

                  {/* Nút phê duyệt kỹ sư */}
                  {canDecide && (r.status === "submitted" || r.status === "commented") && (
                    <div className="mt-2.5 pt-2.5 border-t border-zinc-800 flex gap-1.5 flex-wrap">
                      <button
                        disabled={isBusy}
                        onClick={() => decide(r, "approved")}
                        className="flex items-center gap-1 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent px-3 py-1.5 rounded-lg transition min-h-[38px]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => decide(r, "approved_with_comments")}
                        className="text-xs font-bold bg-emerald-900/80 hover:bg-emerald-800 disabled:opacity-50 text-emerald-200 border border-emerald-700 px-3 py-1.5 rounded-lg transition min-h-[38px]"
                      >
                        Duyệt Kèm Ý Kiến
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => decide(r, "commented")}
                        className="flex items-center gap-1 text-xs font-semibold bg-amber-950 hover:bg-amber-900 disabled:opacity-50 text-amber-200 border border-amber-800 px-2.5 py-1.5 rounded-lg transition min-h-[38px]"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Có Ý Kiến
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => decide(r, "rejected")}
                        className="flex items-center gap-1 text-xs font-semibold bg-rose-950 hover:bg-rose-900 disabled:opacity-50 text-rose-200 border border-rose-800 px-2.5 py-1.5 rounded-lg transition min-h-[38px]"
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

      {/* ── THÔNG TIN KỸ THUẬT & GATE BIỆN PHÁP THI CÔNG ── */}
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
        {drawing.kind === "method" ? (
          <MethodGateSection drawing={drawing} canManageGate={canDecide} onChanged={onChanged} />
        ) : (
          <div className="space-y-2">
            <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              Thông Số Kỹ Thuật Hồ Sơ:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 font-mono block">MÃ BẢN VẼ</span>
                <span className="font-mono font-bold text-zinc-200">{drawing.code}</span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 font-mono block">LOẠI HỒ SƠ</span>
                <span className="font-semibold text-zinc-200">{KIND_LABEL[drawing.kind]}</span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 font-mono block">VỊ TRÍ TẦNG</span>
                <span className="font-semibold text-zinc-200">
                  {drawing.floorLabel ? `Tầng ${drawing.floorLabel}` : "Toàn tháp"}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 font-mono block">NGÀY KHỞI TẠO</span>
                <span className="font-mono text-zinc-300">{drawing.createdAt?.slice(0, 10)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
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
          <h2 className="font-semibold text-base text-zinc-100">
            {editing ? "Sửa thông tin bản vẽ" : "Thêm bản vẽ mới"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="text-zinc-400 hover:text-white p-1"
          >
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
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white min-h-[38px]"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Loại bản vẽ
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as DrawingKind)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white min-h-[38px]"
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
              placeholder="Sơ đồ bố trí thiết bị và đường ống gió..."
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white min-h-[38px]"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hệ
            <input
              value={systemGroup}
              onChange={(e) => setSystemGroup(e.target.value)}
              placeholder="ACMV / Điện / PCCC"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white min-h-[38px]"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Tầng
            <input
              value={floorLabel}
              onChange={(e) => setFloorLabel(e.target.value)}
              placeholder="T05 / Hầm B1"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white min-h-[38px]"
            />
          </label>
        </div>

        {err && <p className="text-xs text-rose-400">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-300 min-h-[44px]"
          >
            Huỷ
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || saving}
            className="px-4 py-2 text-sm bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-xl font-bold text-on-accent shadow-sm min-h-[44px]"
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
            <span className="font-mono text-amber-300 font-bold">{drawing.workPackageCode}</span>{" "}
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
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white min-h-[36px]"
          />
          {hits.length > 0 && (
            <ul className="mt-1 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => assignPackage(h.id)}
                    disabled={busy}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 text-zinc-200"
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
