"use client";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Plus,
  X,
  Upload,
  PencilRuler,
  Clock,
  MessageSquare,
  CheckCircle2,
  XCircle,
  History,
  FileSearch,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

// M8 — Drawing register UI (PR 2/3: trang register + chi tiết + viewer + menu).
// Xem docs/nang-cap/M08-ban-ve.md — API/logic thuần đã có ở PR 1 (lib/drawings.ts,
// app/api/drawings/**). Gate biện pháp thi công (kind=method) + notification duyệt
// bản vẽ để lại PR 3.

type DrawingKind = "shop" | "asbuilt" | "bim" | "method";
type RevisionStatus =
  "submitted" | "commented" | "approved" | "approved_with_comments" | "rejected" | "superseded";

const KIND_LABEL: Record<DrawingKind, string> = {
  shop: "Shop drawing",
  asbuilt: "As-built",
  bim: "BIM",
  method: "Biện pháp thi công",
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
  superseded: "bg-zinc-800 text-zinc-400",
};
const STATUS_ICON: Record<RevisionStatus, LucideIcon> = {
  submitted: Clock,
  commented: MessageSquare,
  approved: CheckCircle2,
  approved_with_comments: CheckCircle2,
  rejected: XCircle,
  superseded: History,
};

const fmtSize = (b: number) =>
  b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;

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

type DrawingDetail = {
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
};

type Revision = {
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

export default function DrawingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<DrawingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const [kindFilter, setKindFilter] = useState<DrawingKind | "">("");
  const [statusFilter, setStatusFilter] = useState<RevisionStatus | "">("");
  const [systemFilter, setSystemFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [q, setQ] = useState("");

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const canDecide = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/drawings").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, d]) => {
        if (!meData) return;
        setMe(meData);
        setItems(d?.drawings ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const d = await load();
    setItems(d?.drawings ?? []);
  }

  const systems = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.systemGroup).filter((v): v is string => !!v))).sort(),
    [items],
  );
  const floors = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.floorLabel).filter((v): v is string => !!v))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (kindFilter && it.kind !== kindFilter) return false;
      if (statusFilter && it.latestStatus !== statusFilter) return false;
      if (systemFilter && it.systemGroup !== systemFilter) return false;
      if (floorFilter && it.floorLabel !== floorFilter) return false;
      if (
        needle &&
        !it.code.toLowerCase().includes(needle) &&
        !it.name.toLowerCase().includes(needle)
      )
        return false;
      return true;
    });
  }, [items, kindFilter, statusFilter, systemFilter, floorFilter, q]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Bản vẽ"
        subtitle="Shop drawing / As-built / BIM / biện pháp thi công"
        bottomActions={
          canManage ? (
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
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã / tên bản vẽ…"
            aria-label="Tìm bản vẽ"
            className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
          />
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as DrawingKind | "")}
            aria-label="Lọc theo loại"
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">Mọi loại</option>
            {(Object.keys(KIND_LABEL) as DrawingKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RevisionStatus | "")}
            aria-label="Lọc theo trạng thái"
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">Mọi trạng thái</option>
            {(Object.keys(STATUS_LABEL) as RevisionStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {systems.length > 0 && (
            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              aria-label="Lọc theo hệ"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Mọi hệ</option>
              {systems.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {floors.length > 0 && (
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              aria-label="Lọc theo tầng"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Mọi tầng</option>
              {floors.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={PencilRuler}
            title="Chưa có bản vẽ nào"
            message={canManage ? 'Bấm "Thêm bản vẽ" để bắt đầu.' : "Chưa có dữ liệu bản vẽ."}
          />
        ) : filtered.length === 0 ? (
          <EmptyState message="Không có bản vẽ khớp bộ lọc." compact />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng bản vẽ">
              <table className="w-full text-sm sm:min-w-[760px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">MÃ</th>
                    <th className="text-left p-3">TÊN</th>
                    <th className="text-left p-3 hidden sm:table-cell">HỆ / TẦNG</th>
                    <th className="text-left p-3">REV HIỆN HÀNH</th>
                    <th className="text-left p-3">TRẠNG THÁI</th>
                    <th className="text-left p-3 hidden sm:table-cell">NGÀY</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const StatusIcon = d.latestStatus ? STATUS_ICON[d.latestStatus] : null;
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelectedId(d.id)}
                        className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 cursor-pointer"
                      >
                        <td className="p-3 font-mono text-xs">{d.code}</td>
                        <td className="p-3">
                          <p className="truncate max-w-[220px]">{d.name}</p>
                          <p className="text-xs text-zinc-400">{KIND_LABEL[d.kind]}</p>
                        </td>
                        <td className="p-3 hidden sm:table-cell text-xs text-zinc-400">
                          {[d.systemGroup, d.floorLabel].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="p-3">
                          <span className="inline-block px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 text-xs font-mono font-medium">
                            {d.latestRev ?? "—"}
                          </span>
                        </td>
                        <td className="p-3">
                          {d.latestStatus ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                STATUS_BADGE[d.latestStatus]
                              } ${d.latestStatus === "superseded" ? "line-through" : ""}`}
                            >
                              {StatusIcon && <StatusIcon className="w-3 h-3" />}
                              {STATUS_LABEL[d.latestStatus]}
                            </span>
                          ) : (
                            <span className="text-zinc-500 text-xs">Chưa có rev</span>
                          )}
                        </td>
                        <td className="p-3 hidden sm:table-cell text-xs text-zinc-400">
                          {d.latestDecidedAt ?? d.latestSubmittedAt ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {selectedId != null && (
        <DrawingDetailModal
          drawingId={selectedId}
          canManage={canManage}
          canDecide={canDecide}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
      {addOpen && (
        <AddDrawingModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AddDrawingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DrawingKind>("shop");
  const [systemGroup, setSystemGroup] = useState("");
  const [floorLabel, setFloorLabel] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = code.trim() && name.trim();

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/drawings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          kind,
          systemGroup: systemGroup.trim() || null,
          floorLabel: floorLabel.trim() || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được bản vẽ");
        return;
      }
      onCreated();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm bản vẽ</h2>
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
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Tầng
            <input
              value={floorLabel}
              onChange={(e) => setFloorLabel(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang tạo…" : "Tạo bản vẽ"}
        </button>
      </div>
    </Modal>
  );
}

function DrawingDetailModal({
  drawingId,
  canManage,
  canDecide,
  onClose,
  onChanged,
}: {
  drawingId: number;
  canManage: boolean;
  canDecide: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [drawing, setDrawing] = useState<DrawingDetail | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<DrawingKind>("shop");
  const [editSystem, setEditSystem] = useState("");
  const [editFloor, setEditFloor] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [uploadRev, setUploadRev] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSubmittedAt, setUploadSubmittedAt] = useState("");
  const [uploading, setUploading] = useState(false);

  const [decisionDraft, setDecisionDraft] = useState<
    Record<number, { status: RevisionStatus; note: string }>
  >({});
  const [deciding, setDeciding] = useState<number | null>(null);

  function load() {
    setLoading(true);
    return fetch(`/api/drawings/${drawingId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        setDrawing(j?.drawing ?? null);
        setRevisions(j?.revisions ?? []);
        if (j?.drawing) {
          setEditName(j.drawing.name);
          setEditKind(j.drawing.kind);
          setEditSystem(j.drawing.systemGroup ?? "");
          setEditFloor(j.drawing.floorLabel ?? "");
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingId]);

  const approvedRevision = revisions.find(
    (r) => r.status === "approved" || r.status === "approved_with_comments",
  );

  async function saveEdit() {
    if (!drawing) return;
    setSavingEdit(true);
    const res = await fetch(`/api/drawings/${drawing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        kind: editKind,
        systemGroup: editSystem.trim() || null,
        floorLabel: editFloor.trim() || null,
      }),
    });
    setSavingEdit(false);
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      showToast(j?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    setEditing(false);
    await load();
    onChanged();
  }

  async function submitUpload() {
    if (!uploadFile || !uploadRev.trim()) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("rev", uploadRev.trim());
      if (uploadSubmittedAt) form.append("submittedAt", uploadSubmittedAt);
      const res = await fetch(`/api/drawings/${drawingId}/revisions`, {
        method: "POST",
        body: form,
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Upload thất bại", "error");
        return;
      }
      setUploadRev("");
      setUploadFile(null);
      setUploadSubmittedAt("");
      showToast(`Đã tải lên rev ${j.rev}`, "success");
      await load();
      onChanged();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setUploading(false);
    }
  }

  async function decide(revId: number, current: RevisionStatus) {
    const draft = decisionDraft[revId] ?? { status: current, note: "" };
    const label =
      draft.status === "rejected"
        ? "Từ chối revision này?"
        : `Đổi trạng thái sang "${STATUS_LABEL[draft.status]}"?`;
    if (!(await appConfirm(label, { danger: draft.status === "rejected" }))) return;
    setDeciding(revId);
    const res = await fetch(`/api/drawings/revisions/${revId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: draft.status, decisionNote: draft.note.trim() || null }),
    });
    setDeciding(null);
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      showToast(j?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    await load();
    onChanged();
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        {loading || !drawing ? (
          <p className="text-sm text-zinc-400">Đang tải…</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold font-mono text-sm">{drawing.code}</h2>
                {editing ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label="Tên bản vẽ"
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                  />
                ) : (
                  <p className="text-sm text-zinc-300 truncate">{drawing.name}</p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Đóng"
                className="text-zinc-400 hover:text-white shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editing ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-zinc-400">
                  Loại
                  <select
                    value={editKind}
                    onChange={(e) => setEditKind(e.target.value as DrawingKind)}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                  >
                    {(Object.keys(KIND_LABEL) as DrawingKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <div />
                <label className="text-xs text-zinc-400">
                  Hệ
                  <input
                    value={editSystem}
                    onChange={(e) => setEditSystem(e.target.value)}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Tầng
                  <input
                    value={editFloor}
                    onChange={(e) => setEditFloor(e.target.value)}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <div className="col-span-2 flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={savingEdit || !editName.trim()}
                    className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                  >
                    Lưu
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="text-zinc-400 hover:text-white text-xs px-3 py-1.5"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span>{KIND_LABEL[drawing.kind]}</span>
                {drawing.systemGroup && <span>· {drawing.systemGroup}</span>}
                {drawing.floorLabel && <span>· Tầng {drawing.floorLabel}</span>}
                {drawing.workPackageCode && <span>· Nhóm {drawing.workPackageCode}</span>}
                {canManage && (
                  <button
                    onClick={() => setEditing(true)}
                    className="text-sky-300 hover:text-sky-200 ml-1"
                  >
                    Sửa
                  </button>
                )}
              </div>
            )}

            {approvedRevision ? (
              <a
                href={`/api/drawings/revisions/${approvedRevision.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-emerald-700 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-lg text-sm"
              >
                <FileSearch className="w-4 h-4" /> Xem bản mới nhất đã duyệt (rev{" "}
                {approvedRevision.rev})
              </a>
            ) : (
              <p className="text-xs text-zinc-500 text-center py-2">Chưa có rev nào được duyệt.</p>
            )}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Lịch sử revision
              </h3>
              {revisions.length === 0 ? (
                <EmptyState message="Chưa có revision nào." compact />
              ) : (
                <ul className="space-y-2">
                  {revisions.map((r) => {
                    const StatusIcon = STATUS_ICON[r.status];
                    const draft = decisionDraft[r.id] ?? {
                      status: r.status,
                      note: r.decisionNote ?? "",
                    };
                    const canDecideThis =
                      canDecide && (r.status === "submitted" || r.status === "commented");
                    return (
                      <li
                        key={r.id}
                        className={`border border-zinc-800 rounded-lg p-3 space-y-1.5 ${
                          r.status === "superseded" ? "opacity-60" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-mono font-medium">Rev {r.rev}</span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                              STATUS_BADGE[r.status]
                            } ${r.status === "superseded" ? "line-through" : ""}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {STATUS_LABEL[r.status]}
                          </span>
                          <a
                            href={`/api/drawings/revisions/${r.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-300 hover:underline text-xs ml-auto"
                          >
                            Xem file
                          </a>
                        </div>
                        <p className="text-xs text-zinc-400">
                          {r.originalName ?? r.fileName}
                          {r.sizeBytes != null && ` · ${fmtSize(r.sizeBytes)}`}
                          {r.uploaderName && ` · ${r.uploaderName}`}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Trình: {r.submittedAt ?? r.createdAt.slice(0, 10)}
                          {r.decidedAt && ` · Quyết định: ${r.decidedAt}`}
                        </p>
                        {r.decisionNote && (
                          <p className="text-xs text-zinc-400">Ghi chú: {r.decisionNote}</p>
                        )}

                        {canDecideThis && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-zinc-800/60">
                            <select
                              value={draft.status}
                              onChange={(e) =>
                                setDecisionDraft((prev) => ({
                                  ...prev,
                                  [r.id]: { ...draft, status: e.target.value as RevisionStatus },
                                }))
                              }
                              aria-label={`Trạng thái mới rev ${r.rev}`}
                              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                            >
                              {(
                                [
                                  "approved",
                                  "approved_with_comments",
                                  "commented",
                                  "rejected",
                                ] as RevisionStatus[]
                              ).map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                            <input
                              value={draft.note}
                              onChange={(e) =>
                                setDecisionDraft((prev) => ({
                                  ...prev,
                                  [r.id]: { ...draft, note: e.target.value },
                                }))
                              }
                              placeholder="Ghi chú TVGS (tuỳ chọn)"
                              aria-label={`Ghi chú duyệt rev ${r.rev}`}
                              className="flex-1 min-w-[120px] bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                            />
                            <button
                              onClick={() => decide(r.id, r.status)}
                              disabled={deciding === r.id}
                              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium px-2.5 py-1 rounded"
                            >
                              Lưu
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {canManage && (
              <section className="space-y-2 border-t border-zinc-800 pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Tải lên revision mới
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={uploadRev}
                    onChange={(e) => setUploadRev(e.target.value)}
                    placeholder="Rev (VD: B)"
                    aria-label="Số rev"
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                  <input
                    type="date"
                    value={uploadSubmittedAt}
                    onChange={(e) => setUploadSubmittedAt(e.target.value)}
                    aria-label="Ngày trình"
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadFile ? uploadFile.name : "Chọn file"}
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    onClick={submitUpload}
                    disabled={uploading || !uploadFile || !uploadRev.trim()}
                    className="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                  >
                    {uploading ? "Đang tải lên…" : "Tải lên"}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
