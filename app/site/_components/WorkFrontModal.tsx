"use client";
// Modal 1 ô mặt bằng thi công (work_fronts): đổi trạng thái/ngày/vướng mắc + biên bản & ảnh
// hiện trạng. Backend có sẵn: PATCH /api/work-fronts/:id, GET/POST /api/work-fronts/:id/documents,
// GET/DELETE /api/work-front-documents/:id. Bố cục khối tài liệu bám HsePhotosModal.
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Hammer,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { Button, Chip } from "@/app/components/ui";
import type { ChipTone } from "@/app/components/ui/Chip";
import { taiJsonMoi } from "@/app/lib/taiDuLieu";
import type { Me } from "@/app/lib/me";
import { formatDateTimeVN } from "@/lib/nen/date";
import {
  STEP_ORDER,
  WORK_FRONT_STATUSES,
  WORK_FRONT_STATUS_LABEL,
  type WorkFrontStatus,
} from "@/lib/tien-do/workfront-status";

// Bản client của WorkFrontRow (lib/tien-do/workfronts.ts chạm DB nên không import được).
export type WorkFront = {
  id: number;
  sheetTypeId: number;
  sheetCode: string;
  floorLabel: string;
  status: WorkFrontStatus;
  handedOverAt: string | null;
  returnedAt: string | null;
  blocker: string | null;
  note: string | null;
  updatedAt: string;
};

type WorkFrontDocument = {
  id: number;
  fileName: string;
  mime: string;
  createdAt: string;
  uploadedBy: number | null;
  uploaderName: string | null;
};

// Màu + icon theo trạng thái — dùng chung cho ô ma trận (WorkFrontsTab) và chip trong modal.
export const WORK_FRONT_STATUS_UI: Record<
  WorkFrontStatus,
  { icon: LucideIcon; tone: ChipTone; cell: string; short: string }
> = {
  pending: {
    icon: Clock,
    tone: "neutral",
    cell: "bg-zinc-500/10 border-zinc-600 text-zinc-300",
    short: "Chưa BG",
  },
  handed_over: {
    icon: ArrowRightLeft,
    tone: "info",
    cell: "bg-sky-500/10 border-sky-500/40 text-sky-300",
    short: "Đã BG",
  },
  in_progress: {
    icon: Hammer,
    tone: "warning",
    cell: "bg-amber-500/10 border-amber-500/40 text-amber-300",
    short: "Đang TC",
  },
  returned: {
    icon: CheckCircle2,
    tone: "success",
    cell: "bg-emerald-500/10 border-emerald-500/40 text-emerald-300",
    short: "Đã trả",
  },
};

const INPUT =
  "w-full min-h-10 bg-zinc-950 border border-zinc-700 rounded-lg px-3 text-sm text-zinc-100 focus:outline-none focus:border-emerald-400";

export default function WorkFrontModal({
  front,
  me,
  onClose,
  onChanged,
}: {
  front: WorkFront;
  me: Me | null;
  onClose: () => void;
  /** Gọi sau khi lưu thành công để tab tải lại ma trận. */
  onChanged: () => void;
}) {
  // Cùng luật với route (CAN.manageWorkFronts = admin/pm/engineer; chỉ admin lùi trạng thái).
  // API vẫn là ranh giới thật, ở đây chỉ ẩn/hiện điều khiển.
  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const isAdmin = me?.role === "admin";

  const [status, setStatus] = useState<WorkFrontStatus>(front.status);
  const [handedOverAt, setHandedOverAt] = useState(front.handedOverAt ?? "");
  const [returnedAt, setReturnedAt] = useState(front.returnedAt ?? "");
  const [blocker, setBlocker] = useState(front.blocker ?? "");
  const [note, setNote] = useState(front.note ?? "");
  const [saving, setSaving] = useState(false);

  const [docs, setDocs] = useState<WorkFrontDocument[] | null>(null);
  const [loiDocs, setLoiDocs] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const statusOptions = WORK_FRONT_STATUSES.filter(
    (s) => isAdmin || STEP_ORDER[s] >= STEP_ORDER[front.status],
  );

  const loadDocs = useCallback(async () => {
    const kq = await taiJsonMoi<{ documents?: WorkFrontDocument[] }>(
      `/api/work-fronts/${front.id}/documents`,
    );
    if (!kq.ok) {
      setLoiDocs(kq.loi);
      return;
    }
    setLoiDocs(null);
    setDocs(kq.data.documents ?? []);
  }, [front.id]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/work-fronts/${front.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Ngày bị ẩn (trạng thái chưa tới bước đó) gửi rỗng → server lưu NULL.
      body: JSON.stringify({
        status,
        handedOverAt: STEP_ORDER[status] >= STEP_ORDER.handed_over ? handedOverAt : "",
        returnedAt: STEP_ORDER[status] >= STEP_ORDER.returned ? returnedAt : "",
        blocker,
        note,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      showToast(j?.error ?? "Không lưu được mặt bằng", "error");
      return;
    }
    showToast("Đã cập nhật mặt bằng");
    onChanged();
  }

  async function upload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/work-fronts/${front.id}/documents`, {
      method: "POST",
      body: form,
    }).catch(() => null);
    setUploading(false);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      showToast(j?.error ?? "Tải tài liệu lên thất bại", "error");
      return;
    }
    await loadDocs();
  }

  async function remove(d: WorkFrontDocument) {
    if (!(await appConfirm(`Xoá "${d.fileName}"?`, { danger: true, confirmLabel: "Xoá" }))) return;
    const res = await fetch(`/api/work-front-documents/${d.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      showToast(j?.error ?? "Không xoá được tài liệu", "error");
      return;
    }
    await loadDocs();
  }

  const ui = WORK_FRONT_STATUS_UI[front.status];
  const canDelete = (d: WorkFrontDocument) => me != null && (d.uploadedBy === me.id || canManage);

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm text-zinc-100 truncate">
            {front.sheetCode} · Tầng {front.floorLabel}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Chip tone={ui.tone} icon={ui.icon}>
              {WORK_FRONT_STATUS_LABEL[front.status]}
            </Chip>
            <span className="text-xs text-zinc-500">
              Cập nhật {formatDateTimeVN(front.updatedAt)}
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {canManage ? (
          <div className="space-y-3">
            <label className="block text-xs text-zinc-400">
              Trạng thái
              <select
                className={`${INPUT} mt-1`}
                value={status}
                onChange={(e) => setStatus(e.target.value as WorkFrontStatus)}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {WORK_FRONT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            {STEP_ORDER[status] >= STEP_ORDER.handed_over && (
              <label className="block text-xs text-zinc-400">
                Ngày bàn giao
                <input
                  type="date"
                  className={`${INPUT} mt-1`}
                  value={handedOverAt}
                  onChange={(e) => setHandedOverAt(e.target.value)}
                />
              </label>
            )}
            {STEP_ORDER[status] >= STEP_ORDER.returned && (
              <label className="block text-xs text-zinc-400">
                Ngày trả mặt bằng
                <input
                  type="date"
                  className={`${INPUT} mt-1`}
                  value={returnedAt}
                  onChange={(e) => setReturnedAt(e.target.value)}
                />
              </label>
            )}
            <label className="block text-xs text-zinc-400">
              Vướng mắc
              <input
                className={`${INPUT} mt-1`}
                value={blocker}
                placeholder="Lý do chưa bàn giao được"
                onChange={(e) => setBlocker(e.target.value)}
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Ghi chú
              <textarea
                className={`${INPUT} mt-1 py-2`}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="flex justify-end">
              <Button variant="primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Đang lưu…" : "Lưu"}
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Ngày bàn giao</dt>
            <dd className="text-zinc-200">{front.handedOverAt ?? "—"}</dd>
            <dt className="text-zinc-500">Ngày trả mặt bằng</dt>
            <dd className="text-zinc-200">{front.returnedAt ?? "—"}</dd>
            <dt className="text-zinc-500">Vướng mắc</dt>
            <dd className="text-zinc-200">
              {front.blocker ? (
                <span className="inline-flex items-center gap-1 text-rose-300">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  {front.blocker}
                </span>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-zinc-500">Ghi chú</dt>
            <dd className="text-zinc-200 whitespace-pre-line">{front.note ?? "—"}</dd>
          </dl>
        )}

        <div className="border-t border-zinc-800 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-zinc-100 flex-1">
              Biên bản &amp; ảnh hiện trạng
            </h4>
            {canManage && (
              <label className="shrink-0 flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-on-accent px-3 h-10 rounded-lg text-xs font-semibold cursor-pointer focus-within:ring-2 focus-within:ring-emerald-400">
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                {uploading ? "Đang tải…" : "Tải lên"}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {loiDocs && <p className="text-sm text-red-400">{loiDocs}</p>}
          {docs === null && !loiDocs && <p className="text-sm text-zinc-500">Đang tải…</p>}
          {docs?.length === 0 && (
            <p className="text-sm text-zinc-500">Chưa có biên bản hay ảnh hiện trạng nào.</p>
          )}
          {!!docs?.length && (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-3 bg-zinc-950/70 border border-zinc-800 rounded-lg p-2"
                >
                  {d.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/work-front-documents/${d.id}`}
                      alt={d.fileName}
                      loading="lazy"
                      className="h-16 w-16 object-cover rounded-md shrink-0"
                    />
                  ) : (
                    <div className="h-16 w-16 flex items-center justify-center rounded-md bg-zinc-900 shrink-0">
                      <FileText className="w-6 h-6 text-zinc-400" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate" title={d.fileName}>
                      {d.fileName}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {d.uploaderName ?? "—"} · {formatDateTimeVN(d.createdAt)}
                    </p>
                  </div>
                  <a
                    href={`/api/work-front-documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Mở ${d.fileName}`}
                    title="Mở tab mới"
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  {canDelete(d) && (
                    <button
                      type="button"
                      onClick={() => void remove(d)}
                      aria-label={`Xoá ${d.fileName}`}
                      title="Xoá"
                      className="w-10 h-10 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
