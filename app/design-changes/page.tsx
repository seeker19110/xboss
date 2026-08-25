"use client";

// Trang "Thay đổi thiết kế" (M32). Trước đây là TAB bên trong /drawings; commit fde16b8
// đổi route /drawings → /ban-ve và làm rơi mất tab này, trong khi API
// (/api/design-changes), lib (lib/ky-thuat/designchanges.ts), bảng design_changes, unit
// test và cả engine thông báo (pendingDesignChanges trong lib/dich-vu/thong-bao.ts) đều
// vẫn sống — tức người dùng vẫn nhận thông báo "thay đổi thiết kế chờ duyệt" mà không có
// màn hình nào để mở. Khôi phục nguyên trạng component từ fde16b8^ thành route riêng
// (sạch hơn là ghép lại vào trang /ban-ve đã tái thiết Bento Grid 2.0 sau đó).

import { useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2, Clock, Pencil, X, XCircle, type LucideIcon } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appPrompt, appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

// Chỉ 3 trường được tab này đọc (d.id/d.code/d.name) — không kéo cả DrawingRow đầy đủ.
type DrawingRow = { id: number; code: string; name: string };

// Hai helper dùng chung với trang bản vẽ cũ — chép kèm để trang này tự đứng được.
function fetchFresh(url: string): Promise<Response> {
  const sep = url.includes("?") ? "&" : "?";
  return fetch(`${url}${sep}_=${Date.now()}`, { cache: "no-store" });
}

function canManageDrawings(role?: string) {
  return role === "admin" || role === "pm" || role === "engineer";
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
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
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
                className="text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 transition"
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
                  {dc.systemName && <span>Hệ {dc.systemName}</span>}
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
            className="px-3 py-2 text-sm rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 font-semibold text-on-accent"
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
          {dc.systemName && <p>Hệ: {dc.systemName}</p>}
          {dc.requestedByNote && <p>Yêu cầu bởi: {dc.requestedByNote}</p>}
          <p>Người tạo: {dc.createdByName ?? "—"}</p>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-zinc-400">Lý do thay đổi</p>
            <p className="whitespace-pre-wrap">{dc.reason}</p>
          </div>
          {dc.impactTechnical && (
            <div>
              <p className="text-xs text-zinc-400">Tác động kỹ thuật</p>
              <p className="whitespace-pre-wrap">{dc.impactTechnical}</p>
            </div>
          )}
          {dc.impactCost && (
            <div>
              <p className="text-xs text-zinc-400">Tác động chi phí</p>
              <p className="whitespace-pre-wrap">{dc.impactCost}</p>
            </div>
          )}
          {dc.impactSchedule && (
            <div>
              <p className="text-xs text-zinc-400">Tác động tiến độ</p>
              <p className="whitespace-pre-wrap">{dc.impactSchedule}</p>
            </div>
          )}
          {dc.decisionNote && (
            <div>
              <p className="text-xs text-zinc-400">Ghi chú quyết định</p>
              <p className="whitespace-pre-wrap">{dc.decisionNote}</p>
              {dc.decidedByName && (
                <p className="text-xs text-zinc-400 mt-1">
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
                className="px-3 py-2 text-sm rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 font-semibold text-on-accent"
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

export default function DesignChangesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [drawings, setDrawings] = useState<DrawingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetchMe(), fetch("/api/drawings").then((r) => (r.ok ? r.json() : { items: [] }))])
      .then(([user, dw]) => {
        setMe(user);
        setDrawings(dw?.items ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nút hành động riêng của trang đặt ở bottomActions (khuôn mẫu chung, xem
          app/equipment/page.tsx): đặt trong children thì trên mobile nó chen vào hàng
          header vốn đã chật (chuông, theme, online, avatar) và không bấm được. */}
      <AppHeader
        title="Thay đổi thiết kế"
        subtitle="Đề xuất thay đổi thiết kế (M32) — trình, đánh giá, duyệt, cập nhật bản vẽ"
        bottomActions={
          <button
            onClick={() => setAddOpen(true)}
            aria-label="Thêm thay đổi thiết kế"
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition shrink-0 text-on-accent h-10 min-h-[44px]"
          >
            <Pencil className="w-4 h-4" /> <span>Thêm thay đổi thiết kế</span>
          </button>
        }
      />
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full">
        {loading ? (
          <PageSkeleton />
        ) : (
          <DesignChangesTab
            me={me}
            addOpen={addOpen}
            onCloseAdd={() => setAddOpen(false)}
            drawings={drawings}
          />
        )}
      </main>
    </div>
  );
}
