"use client";
import { useEffect, useState } from "react";
import { X, Lock, Hammer, CheckCircle2, RotateCcw, Paperclip, Download } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN } from "@/lib/date";
import { sortFloorsDesc } from "@/lib/floors";

type WorkFrontStatus = "pending" | "handed_over" | "in_progress" | "returned";
const WORK_FRONT_STATUS_LABEL: Record<WorkFrontStatus, string> = {
  pending: "Chưa bàn giao",
  handed_over: "Đã bàn giao",
  in_progress: "Đang thi công",
  returned: "Đã trả",
};

const STATUS_ICON: Record<WorkFrontStatus, typeof Lock> = {
  pending: Lock,
  handed_over: CheckCircle2,
  in_progress: Hammer,
  returned: RotateCcw,
};
const STATUS_CELL: Record<WorkFrontStatus, string> = {
  pending: "bg-zinc-800 text-zinc-400",
  handed_over: "bg-sky-900 text-sky-200",
  in_progress: "bg-emerald-900 text-emerald-200",
  returned: "bg-zinc-800/60 text-zinc-500",
};

type WorkFront = {
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

export default function WorkFrontsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<WorkFront[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const canExportReport = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/work-fronts").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, w]) => {
        if (!meData) return;
        setMe(meData);
        setItems(w?.workFronts ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const w = await load();
    setItems(w?.workFronts ?? []);
  }

  const selected = items.find((w) => w.id === selectedId) ?? null;

  if (loading) return <PageSkeleton />;

  const sheets = Array.from(new Set(items.map((w) => w.sheetCode))).sort();
  const floors = Array.from(new Set(items.map((w) => w.floorLabel))).sort(sortFloorsDesc);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Mặt bằng thi công"
        subtitle="Trạng thái bàn giao mặt bằng theo tầng/hệ"
        bottomActions={
          canExportReport && (
            <a
              href="/api/work-fronts/report"
              target="_blank"
              rel="noreferrer"
              aria-label="Báo cáo mặt bằng (EOT)"
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition shrink-0"
            >
              <Download className="w-4 h-4" />{" "}
              <span className="hidden sm:inline">Báo cáo mặt bằng (EOT)</span>
            </a>
          )
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">Chưa có dữ liệu tầng/hệ.</p>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Ma trận mặt bằng"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-2 sticky left-0 bg-zinc-900">TẦNG</th>
                    {sheets.map((s) => (
                      <th key={s} className="text-center p-2">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {floors.map((floor) => (
                    <tr key={floor} className="border-b border-zinc-800/60 last:border-0">
                      <td className="p-2 font-mono text-xs sticky left-0 bg-zinc-900">{floor}</td>
                      {sheets.map((sheet) => {
                        const wf = items.find(
                          (w) => w.sheetCode === sheet && w.floorLabel === floor,
                        );
                        if (!wf)
                          return (
                            <td key={sheet} className="p-2 text-center text-zinc-700">
                              —
                            </td>
                          );
                        const Icon = STATUS_ICON[wf.status];
                        return (
                          <td key={sheet} className="p-2 text-center">
                            <button
                              onClick={() => setSelectedId(wf.id)}
                              title={`${WORK_FRONT_STATUS_LABEL[wf.status]}${wf.blocker ? ` — ${wf.blocker}` : ""}`}
                              aria-label={`${sheet} tầng ${floor}: ${WORK_FRONT_STATUS_LABEL[wf.status]}`}
                              className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${STATUS_CELL[wf.status]} hover:opacity-80`}
                            >
                              <Icon className="w-4 h-4" />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
          {(Object.keys(WORK_FRONT_STATUS_LABEL) as WorkFrontStatus[]).map((s) => {
            const Icon = STATUS_ICON[s];
            return (
              <span key={s} className="inline-flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" /> {WORK_FRONT_STATUS_LABEL[s]}
              </span>
            );
          })}
        </div>
      </main>

      {selected && (
        <WorkFrontDetailModal
          workFront={selected}
          canManage={canManage}
          isAdmin={me?.role === "admin"}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

type WorkFrontDoc = { id: number; fileName: string; mime: string; uploaderName: string | null };

function WorkFrontDetailModal({
  workFront,
  canManage,
  isAdmin,
  onClose,
  onSaved,
}: {
  workFront: WorkFront;
  canManage: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<WorkFrontStatus>(workFront.status);
  const [handedOverAt, setHandedOverAt] = useState(workFront.handedOverAt ?? "");
  const [returnedAt, setReturnedAt] = useState(workFront.returnedAt ?? "");
  const [blocker, setBlocker] = useState(workFront.blocker ?? "");
  const [note, setNote] = useState(workFront.note ?? "");
  const [docs, setDocs] = useState<WorkFrontDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  function loadDocs() {
    fetch(`/api/work-fronts/${workFront.id}/documents`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDocs(j?.documents ?? []));
  }

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workFront.id]);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/work-fronts/${workFront.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        handedOverAt: handedOverAt || null,
        returnedAt: returnedAt || null,
        blocker: blocker.trim() || null,
        note: note.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Lưu thất bại", "error");
      return;
    }
    onSaved();
    onClose();
  }

  async function uploadDoc(f: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`/api/work-fronts/${workFront.id}/documents`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Upload thất bại", "error");
        return;
      }
      loadDocs();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setUploading(false);
    }
  }

  const statuses = Object.keys(WORK_FRONT_STATUS_LABEL) as WorkFrontStatus[];

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {workFront.sheetCode} · Tầng {workFront.floorLabel}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {canManage ? (
          <div className="space-y-3">
            <label className="text-xs text-zinc-400 block">
              Trạng thái
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WorkFrontStatus)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {WORK_FRONT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              {!isAdmin && (
                <span className="text-[11px] text-zinc-500">
                  Chỉ Admin được chuyển ngược trạng thái.
                </span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400">
                Ngày bàn giao
                <input
                  type="date"
                  value={handedOverAt}
                  onChange={(e) => setHandedOverAt(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-zinc-400">
                Ngày trả
                <input
                  type="date"
                  value={returnedAt}
                  onChange={(e) => setReturnedAt(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <label className="text-xs text-zinc-400 block">
              Vướng mắc (nếu còn pending)
              <input
                value={blocker}
                onChange={(e) => setBlocker(e.target.value)}
                placeholder="Chưa xây tô, vướng nhà thầu khác…"
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400 block">
              Ghi chú
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              onClick={save}
              disabled={busy}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
            >
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        ) : (
          <dl className="space-y-1 text-sm text-zinc-300">
            <div>Trạng thái: {WORK_FRONT_STATUS_LABEL[workFront.status]}</div>
            {workFront.handedOverAt && <div>Bàn giao: {formatDateVN(workFront.handedOverAt)}</div>}
            {workFront.blocker && <div>Vướng mắc: {workFront.blocker}</div>}
          </dl>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Biên bản / ảnh hiện trạng
          </h3>
          {docs.length > 0 ? (
            <ul className="space-y-1.5">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <Paperclip className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <a
                    href={`/api/work-front-documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-0 truncate text-sky-300 hover:underline"
                  >
                    {d.uploaderName ?? "File"} — {d.mime}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">Chưa có file nào.</p>
          )}
          {canManage && (
            <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg">
              <Paperclip className="w-4 h-4" />
              {uploading ? "Đang tải lên…" : "Tải biên bản/ảnh"}
              <input
                type="file"
                accept="application/pdf,image/*"
                capture="environment"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadDoc(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </section>
      </div>
    </Modal>
  );
}
