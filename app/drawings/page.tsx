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
  type LucideIcon,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appPrompt, appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

// M8 — Drawing register (bản vẽ shop/asbuilt/BIM + biện pháp thi công). Trang danh
// sách + chi tiết + upload rev + duyệt. Xem docs/nang-cap/M08-ban-ve.md.

type DrawingKind = "shop" | "asbuilt" | "bim" | "method";
type RevisionStatus =
  "submitted" | "commented" | "approved" | "approved_with_comments" | "rejected" | "superseded";

const KIND_LABEL: Record<DrawingKind, string> = {
  shop: "Shop drawing",
  asbuilt: "As-built",
  bim: "BIM",
  method: "Biện pháp thi công",
};
const KIND_ICON: Record<DrawingKind, LucideIcon> = {
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
  submitted: "bg-sky-900 text-sky-200",
  commented: "bg-amber-900 text-amber-200",
  approved: "bg-emerald-900 text-emerald-200",
  approved_with_comments: "bg-emerald-900 text-emerald-200",
  rejected: "bg-rose-900 text-rose-200",
  superseded: "bg-zinc-800 text-zinc-400 line-through decoration-zinc-600",
};
const STATUS_ICON: Record<RevisionStatus, LucideIcon> = {
  submitted: Clock,
  commented: MessageSquare,
  approved: CheckCircle2,
  approved_with_comments: CheckCircle2,
  rejected: XCircle,
  superseded: History,
};

type DrawingRow = {
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

type DrawingRevisionRow = {
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

// sw.js áp stale-while-revalidate cho mọi GET /api/* (đọc được khi mất mạng ngoài công
// trường) — nghĩa là gọi lại đúng URL ngay sau khi tự mình vừa ghi (upload/duyệt) có thể
// nhận lại bản cache cũ. Thêm query nonce để bỏ qua cache đúng những lần load lại này
// (đọc lần đầu/khi đổi filter vẫn dùng fetch thường, hưởng lợi ích offline).
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

export default function DrawingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DrawingsPageInner />
    </Suspense>
  );
}

const DRAWING_KIND_VALUES = ["shop", "asbuilt", "bim", "method"] as const;

function DrawingsPageInner() {
  const searchParams = useSearchParams();
  const initialKind = searchParams.get("kind");
  const validInitialKind = (DRAWING_KIND_VALUES as readonly string[]).includes(initialKind ?? "")
    ? (initialKind as DrawingKind)
    : "all";

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<DrawingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<DrawingKind | "all">(validInitialKind);
  const [statusFilter, setStatusFilter] = useState<RevisionStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Tab "Thay đổi thiết kế" (M32) — trang bản vẽ trở thành hub 2 tab, tab hiện có
  // ("Bản vẽ") giữ nguyên hành vi.
  const [tab, setTab] = useState<"drawings" | "design-changes">("drawings");
  const [dcAddOpen, setDcAddOpen] = useState(false);

  const canCreate = canManageDrawings(me?.role);

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
      .then((d) => setItems(d?.drawings ?? []))
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
    setItems(d?.drawings ?? []);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((d) =>
      [d.code, d.name, d.systemGroup, d.floorLabel, d.workPackageCode, d.workPackageName]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [items, search]);

  const selected = items.find((d) => d.id === selectedId) ?? null;

  if (loading && items.length === 0) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Bản vẽ"
        subtitle="Shop drawing · As-built · BIM · Biện pháp thi công · Thay đổi thiết kế"
        bottomActions={
          tab === "drawings" ? (
            canCreate ? (
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Thêm bản vẽ"
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
              >
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm bản vẽ</span>
              </button>
            ) : undefined
          ) : canCreate ? (
            <button
              onClick={() => setDcAddOpen(true)}
              aria-label="Thêm thay đổi thiết kế"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
            >
              <Plus className="w-4 h-4" />{" "}
              <span className="hidden sm:inline">Thêm thay đổi thiết kế</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="flex gap-1.5 border-b border-zinc-800">
          <button
            onClick={() => setTab("drawings")}
            className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
              tab === "drawings"
                ? "border-emerald-500 text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Bản vẽ
          </button>
          <button
            onClick={() => setTab("design-changes")}
            className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
              tab === "design-changes"
                ? "border-emerald-500 text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Thay đổi thiết kế
          </button>
        </div>

        {tab === "drawings" ? (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm mã, tên, hệ, tầng..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                label="Tất cả loại"
                active={kindFilter === "all"}
                onClick={() => setKindFilter("all")}
              />
              {(Object.keys(KIND_LABEL) as DrawingKind[]).map((k) => (
                <FilterChip
                  key={k}
                  label={KIND_LABEL[k]}
                  active={kindFilter === k}
                  onClick={() => setKindFilter(k)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                label="Tất cả trạng thái"
                active={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              />
              {(Object.keys(STATUS_LABEL) as RevisionStatus[]).map((s) => (
                <FilterChip
                  key={s}
                  label={STATUS_LABEL[s]}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                />
              ))}
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Chưa có bản vẽ nào"
                message={canCreate ? 'Bấm "Thêm bản vẽ" để bắt đầu.' : "Chưa có dữ liệu bản vẽ."}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map((d) => {
                  const KindIcon = KIND_ICON[d.kind];
                  const StatusIcon = d.latestStatus ? STATUS_ICON[d.latestStatus] : null;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      className="text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-3 transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-zinc-400">{d.code}</p>
                          <p className="font-semibold text-sm truncate">{d.name}</p>
                        </div>
                        {d.latestStatus && StatusIcon && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${STATUS_BADGE[d.latestStatus]}`}
                          >
                            <StatusIcon className="w-3 h-3" /> {STATUS_LABEL[d.latestStatus]}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <KindIcon className="w-3.5 h-3.5" /> {KIND_LABEL[d.kind]}
                        </span>
                        {d.systemGroup && <span>Hệ {d.systemGroup}</span>}
                        {d.floorLabel && <span>Tầng {d.floorLabel}</span>}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-zinc-400">
                          Rev hiện hành:{" "}
                          <span className="font-bold text-white text-sm">{d.latestRev ?? "—"}</span>
                        </span>
                        <span className="text-zinc-400">
                          {d.latestDecidedAt ?? d.latestSubmittedAt ?? "—"}
                        </span>
                      </div>
                      {d.kind === "method" && (
                        <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center justify-between gap-2 text-xs">
                          <span className="text-zinc-400 truncate">
                            Nhóm:{" "}
                            {d.workPackageCode
                              ? `${d.workPackageCode} — ${d.workPackageName}`
                              : "Chưa gán"}
                          </span>
                          {d.workPackageRequiresMethodStatement && (
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-full font-semibold ${
                                d.approvedRevisionId != null
                                  ? "bg-emerald-900 text-emerald-200"
                                  : "bg-amber-900 text-amber-200"
                              }`}
                            >
                              {d.approvedRevisionId != null
                                ? "Đủ điều kiện"
                                : "Chờ duyệt — đang chặn"}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <DesignChangesTab
            me={me}
            addOpen={dcAddOpen}
            onCloseAdd={() => setDcAddOpen(false)}
            drawings={items}
          />
        )}
      </main>

      {selected && (
        <DrawingDetailModal
          drawing={selected}
          canManage={canCreate}
          canDecide={canDecideRevision(me?.role)}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
      {addOpen && (
        <DrawingFormModal
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

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
      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
        active
          ? "bg-emerald-800/60 border-emerald-700 text-white"
          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600"
      }`}
    >
      {label}
    </button>
  );
}

// ── Form tạo/sửa bản vẽ ──────────────────────────────────────────────────────

function DrawingFormModal({
  drawing,
  onClose,
  onSaved,
}: {
  drawing?: DrawingRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!drawing;
  const [code, setCode] = useState(drawing?.code ?? "");
  const [name, setName] = useState(drawing?.name ?? "");
  const [kind, setKind] = useState<DrawingKind>(drawing?.kind ?? "shop");
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
          <h2 className="font-semibold">{editing ? "Sửa bản vẽ" : "Thêm bản vẽ"}</h2>
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
            Loại
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

// ── Chi tiết bản vẽ: timeline revision + upload + duyệt ──────────────────────

function suggestNextRev(revisions: DrawingRevisionRow[]): string {
  const last = revisions[0]?.rev ?? "";
  if (/^[A-Z]$/.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1);
  return "";
}

function DrawingDetailModal({
  drawing,
  canManage,
  canDecide,
  onClose,
  onChanged,
}: {
  drawing: DrawingRow;
  canManage: boolean;
  canDecide: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [revisions, setRevisions] = useState<DrawingRevisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyRevId, setBusyRevId] = useState<number | null>(null);
  const [newRev, setNewRev] = useState("");
  const [newSubmittedAt, setNewSubmittedAt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function load(opts?: { fresh?: boolean }) {
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
    load();
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
      load({ fresh: true });
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
      load({ fresh: true });
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

  return (
    <Modal onClose={onClose} className="max-w-2xl" zIndex="z-50">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-zinc-400">{drawing.code}</p>
            <h2 className="font-semibold text-lg truncate">{drawing.name}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {KIND_LABEL[drawing.kind]}
              {drawing.systemGroup ? ` · Hệ ${drawing.systemGroup}` : ""}
              {drawing.floorLabel ? ` · Tầng ${drawing.floorLabel}` : ""}
              {drawing.workPackageName ? ` · Nhóm: ${drawing.workPackageName}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canManage && (
              <button
                onClick={() => setEditOpen(true)}
                aria-label="Sửa bản vẽ"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <button
          onClick={() => drawing.approvedRevisionId && viewFile(drawing.approvedRevisionId)}
          disabled={!drawing.approvedRevisionId}
          className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-4 py-2.5 text-sm font-semibold transition text-on-accent"
        >
          <ExternalLink className="w-4 h-4" />
          {drawing.approvedRevisionId
            ? `Xem bản mới nhất đã duyệt (rev ${drawing.approvedRev})`
            : "Chưa có rev nào được duyệt"}
        </button>

        {hasPendingNewerThanApproved && (
          <p className="text-xs bg-amber-950 border border-amber-900 text-amber-200 rounded-lg px-3 py-2">
            Rev {drawing.latestRev} đang chờ duyệt — hiện trường vẫn dùng rev{" "}
            {drawing.approvedRev ?? "—"} (bản đã duyệt).
          </p>
        )}

        {drawing.kind === "method" && (
          <MethodGateSection drawing={drawing} canManageGate={canDecide} onChanged={onChanged} />
        )}

        {canManage && (
          <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-zinc-300">Tải lên rev mới</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={newRev}
                onChange={(e) => setNewRev(e.target.value)}
                placeholder="Rev (A, B...)"
                className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm"
              />
              <input
                type="date"
                value={newSubmittedAt}
                onChange={(e) => setNewSubmittedAt(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm"
              />
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
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
                className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm transition"
              >
                <Upload className="w-4 h-4" /> {uploading ? "Đang tải..." : "Chọn file"}
              </button>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-zinc-400 mb-2">Lịch sử revision</p>
          {loading ? (
            <p className="text-sm text-zinc-400">Đang tải...</p>
          ) : revisions.length === 0 ? (
            <p className="text-sm text-zinc-400">Chưa có revision nào.</p>
          ) : (
            <div className="space-y-2">
              {revisions.map((r) => {
                const StatusIcon = STATUS_ICON[r.status];
                const isBusy = busyRevId === r.id;
                return (
                  <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{r.rev}</span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_BADGE[r.status]}`}
                        >
                          <StatusIcon className="w-3 h-3" /> {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <button
                        onClick={() => viewFile(r.id)}
                        className="flex items-center gap-1 text-xs text-sky-400 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> Xem file
                        {r.sizeBytes != null && (
                          <span className="text-zinc-400 ml-1">{fmtSize(r.sizeBytes)}</span>
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Trình: {r.submittedAt ?? "—"} · Quyết định: {r.decidedAt ?? "—"} · Người tải:{" "}
                      {r.uploaderName ?? "—"}
                    </p>
                    {r.decisionNote && (
                      <p className="text-xs text-zinc-300 italic mt-1">
                        &ldquo;{r.decisionNote}&rdquo;
                      </p>
                    )}
                    {canDecide && (r.status === "submitted" || r.status === "commented") && (
                      <div className="mt-2 flex gap-1.5 flex-wrap">
                        <button
                          disabled={isBusy}
                          onClick={() => decide(r, "approved")}
                          className="flex items-center gap-1 text-[11px] bg-emerald-800 hover:bg-emerald-700/60 disabled:opacity-50 text-emerald-200 px-2 py-1 rounded-lg transition"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Duyệt
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => decide(r, "approved_with_comments")}
                          className="text-[11px] bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-emerald-200 px-2 py-1 rounded-lg transition"
                        >
                          Duyệt kèm ý kiến
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => decide(r, "commented")}
                          className="flex items-center gap-1 text-[11px] bg-amber-900 hover:bg-amber-800 disabled:opacity-50 text-amber-200 px-2 py-1 rounded-lg transition"
                        >
                          <MessageSquare className="w-3 h-3" /> Có ý kiến
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => decide(r, "rejected")}
                          className="flex items-center gap-1 text-[11px] bg-rose-900 hover:bg-rose-800 disabled:opacity-50 text-rose-200 px-2 py-1 rounded-lg transition"
                        >
                          <XCircle className="w-3 h-3" /> Từ chối
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

      {editOpen && (
        <DrawingFormModal
          drawing={drawing}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load({ fresh: true });
            onChanged();
          }}
        />
      )}
    </Modal>
  );
}

// ── Gate biện pháp thi công (M8 PR 3/3): gán nhóm công việc + đánh dấu bắt buộc ──────

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
    <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-zinc-300">Gate biện pháp thi công</p>

      {drawing.workPackageId ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>
            Nhóm áp dụng: <span className="font-mono text-xs">{drawing.workPackageCode}</span>{" "}
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
        <p className="text-sm text-zinc-400">Chưa gán nhóm công việc — gate chưa áp dụng.</p>
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
        <div className="relative">
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

// ── Tab "Thay đổi thiết kế" (M32) ────────────────────────────────────────────

type DesignChangeStatus = "submitted" | "assessing" | "approved" | "rejected" | "drawing_updated";

const DC_STATUS_LABEL: Record<DesignChangeStatus, string> = {
  submitted: "Đã trình",
  assessing: "Đang đánh giá",
  approved: "Được duyệt",
  rejected: "Từ chối",
  drawing_updated: "Đã cập nhật bản vẽ",
};
const DC_STATUS_BADGE: Record<DesignChangeStatus, string> = {
  submitted: "bg-sky-900 text-sky-200",
  assessing: "bg-amber-900 text-amber-200",
  approved: "bg-emerald-900 text-emerald-200",
  rejected: "bg-rose-900 text-rose-200",
  drawing_updated: "bg-violet-900 text-violet-200",
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
  disciplineId: number | null;
  disciplineCode: string | null;
  disciplineName: string | null;
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

  // Gọi sau khi tự ghi (tạo/quyết định/đánh dấu) — dùng fetchFresh để bỏ qua cache SW
  // (stale-while-revalidate), khác với load() ở trên chỉ dùng cho tải lần đầu/đổi filter.
  async function refresh() {
    const qs = buildQuery();
    const res = await fetchFresh(`/api/design-changes${qs ? `?${qs}` : ""}`);
    const d = res.ok ? await res.json() : null;
    setItems(d?.items ?? []);
  }

  const selected = items.find((d) => d.id === selectedId) ?? null;

  return (
    <>
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
                className="text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-3 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-zinc-400">{dc.code}</p>
                    <p className="font-semibold text-sm truncate">{dc.title}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${DC_STATUS_BADGE[dc.status]}`}
                  >
                    <StatusIcon className="w-3 h-3" /> {DC_STATUS_LABEL[dc.status]}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                  {dc.disciplineName && <span>Hệ {dc.disciplineName}</span>}
                  {dc.drawingCode && <span>Bản vẽ {dc.drawingCode}</span>}
                </div>
                <p className="mt-2 text-xs text-zinc-400 line-clamp-2">{dc.reason}</p>
                <div className="mt-2 text-xs text-zinc-400">{dc.createdAt?.slice(0, 10)}</div>
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
    </>
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
          <h2 className="font-semibold">Thêm thay đổi thiết kế</h2>
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
          Tác động chi phí (mô tả định tính, tuỳ chọn)
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
            <p className="font-mono text-xs text-zinc-400">{dc.code}</p>
            <h2 className="font-semibold">{dc.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${DC_STATUS_BADGE[dc.status]}`}
        >
          <StatusIcon className="w-3 h-3" /> {DC_STATUS_LABEL[dc.status]}
        </span>

        <div className="text-xs text-zinc-400 space-y-1">
          {dc.disciplineName && <p>Hệ: {dc.disciplineName}</p>}
          {dc.requestedByNote && <p>Yêu cầu bởi: {dc.requestedByNote}</p>}
          <p>Người tạo: {dc.createdByName ?? "—"}</p>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-zinc-500">Lý do thay đổi</p>
            <p className="whitespace-pre-wrap">{dc.reason}</p>
          </div>
          {dc.impactTechnical && (
            <div>
              <p className="text-xs text-zinc-500">Tác động kỹ thuật</p>
              <p className="whitespace-pre-wrap">{dc.impactTechnical}</p>
            </div>
          )}
          {dc.impactCost && (
            <div>
              <p className="text-xs text-zinc-500">Tác động chi phí</p>
              <p className="whitespace-pre-wrap">{dc.impactCost}</p>
            </div>
          )}
          {dc.impactSchedule && (
            <div>
              <p className="text-xs text-zinc-500">Tác động tiến độ</p>
              <p className="whitespace-pre-wrap">{dc.impactSchedule}</p>
            </div>
          )}
          {dc.decisionNote && (
            <div>
              <p className="text-xs text-zinc-500">Ghi chú quyết định</p>
              <p className="whitespace-pre-wrap">{dc.decisionNote}</p>
              {dc.decidedByName && (
                <p className="text-xs text-zinc-500 mt-1">
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
            <span className="font-mono">
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
                className="px-3 py-2 text-sm rounded-lg border border-rose-700 text-rose-200 hover:bg-rose-900 disabled:opacity-50"
              >
                Từ chối
              </button>
              <button
                onClick={() => decide("approved")}
                disabled={busy}
                className="px-3 py-2 text-sm rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 font-semibold text-on-accent"
              >
                Duyệt
              </button>
            </>
          )}
          {dc.status === "approved" && canManage && (
            <button
              onClick={markDrawingUpdated}
              disabled={busy}
              className="px-3 py-2 text-sm rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-50 font-semibold text-on-accent"
            >
              Đánh dấu đã cập nhật bản vẽ
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
