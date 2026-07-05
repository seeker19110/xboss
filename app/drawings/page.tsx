"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Modal, appPrompt } from "@/app/components/dialogs";
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
  submitted: "bg-sky-900/40 text-sky-300",
  commented: "bg-amber-900/40 text-amber-300",
  approved: "bg-emerald-900/40 text-emerald-300",
  approved_with_comments: "bg-emerald-900/40 text-emerald-300",
  rejected: "bg-rose-900/40 text-rose-300",
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
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<DrawingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<DrawingKind | "all">("all");
  const [statusFilter, setStatusFilter] = useState<RevisionStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

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
        subtitle="Shop drawing · As-built · BIM · Biện pháp thi công"
        bottomActions={
          canCreate ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Thêm bản vẽ"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm bản vẽ</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
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
                </button>
              );
            })}
          </div>
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
          ? "bg-emerald-800/60 border-emerald-700 text-emerald-200"
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
            className="px-4 py-1.5 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg font-medium"
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
          className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-4 py-2.5 text-sm font-semibold transition"
        >
          <ExternalLink className="w-4 h-4" />
          {drawing.approvedRevisionId
            ? `Xem bản mới nhất đã duyệt (rev ${drawing.approvedRev})`
            : "Chưa có rev nào được duyệt"}
        </button>

        {hasPendingNewerThanApproved && (
          <p className="text-xs bg-amber-950/60 border border-amber-900 text-amber-300 rounded-lg px-3 py-2">
            Rev {drawing.latestRev} đang chờ duyệt — hiện trường vẫn dùng rev{" "}
            {drawing.approvedRev ?? "—"} (bản đã duyệt).
          </p>
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
                          className="flex items-center gap-1 text-[11px] bg-emerald-800/60 hover:bg-emerald-700/60 disabled:opacity-50 text-emerald-200 px-2 py-1 rounded-lg transition"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Duyệt
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => decide(r, "approved_with_comments")}
                          className="text-[11px] bg-emerald-900/40 hover:bg-emerald-800/60 disabled:opacity-50 text-emerald-300 px-2 py-1 rounded-lg transition"
                        >
                          Duyệt kèm ý kiến
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => decide(r, "commented")}
                          className="flex items-center gap-1 text-[11px] bg-amber-900/40 hover:bg-amber-800/60 disabled:opacity-50 text-amber-300 px-2 py-1 rounded-lg transition"
                        >
                          <MessageSquare className="w-3 h-3" /> Có ý kiến
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => decide(r, "rejected")}
                          className="flex items-center gap-1 text-[11px] bg-rose-900/40 hover:bg-rose-800/60 disabled:opacity-50 text-rose-300 px-2 py-1 rounded-lg transition"
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
