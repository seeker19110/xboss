"use client";
import { useEffect, useState } from "react";
import { Plus, Download, Pencil } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appPrompt, appConfirm } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN } from "@/lib/nen/date";
import { sortFloorsDesc } from "@/lib/nen/floors";

type Stage = { id: number; name: string; sortOrder: number; active: boolean; durationDays: number };
type Front = {
  id: number;
  floorLabel: string;
  stageId: number;
  receivedAt: string | null;
  handedOverAt: string | null;
  plannedReceivedAt: string | null;
  plannedHandedOverAt: string | null;
  note: string | null;
  updatedAt: string;
};

// Ô lưới hiện 2 dòng: ngày nhận mặt bằng / ngày bàn giao mặt bằng. Chưa có thực tế → hiện
// ngày kế hoạch (tính nối tiếp từ duration_days) màu nhạt, không tích; đã ghi nhận thực tế
// → hiện ngày thực tế màu nổi bật kèm dấu ✓.
function FrontCell({ front }: { front: Front | undefined }) {
  const received = front?.receivedAt ?? front?.plannedReceivedAt ?? null;
  const receivedActual = !!front?.receivedAt;
  const handedOver = front?.handedOverAt ?? front?.plannedHandedOverAt ?? null;
  const handedOverActual = !!front?.handedOverAt;

  if (!received && !handedOver) return <span className="text-zinc-700">—</span>;

  return (
    <div className="flex flex-col items-center gap-0.5 text-[11px] leading-tight">
      <span className={receivedActual ? "text-emerald-300 font-medium" : "text-zinc-500"}>
        {received ? formatDateVN(received) : "—"}
        {receivedActual && " ✓"}
      </span>
      <span className={handedOverActual ? "text-emerald-300 font-medium" : "text-zinc-500"}>
        {handedOver ? formatDateVN(handedOver) : "—"}
        {handedOverActual && " ✓"}
      </span>
    </div>
  );
}

// Modal sửa tên/số ngày thi công hoặc ẩn hẳn 1 công tác khỏi ma trận (Admin/PM; công tác
// dùng chung project_id NULL chỉ Admin sửa được — route trả lỗi, hiện đúng error).
function EditStageModal({
  stage,
  onClose,
  onSaved,
}: {
  stage: Stage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(stage.name);
  const [durationDays, setDurationDays] = useState(String(stage.durationDays));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    const duration = Number(durationDays);
    if (!trimmed) {
      setErr("Tên công tác không được để trống");
      return;
    }
    if (!Number.isInteger(duration) || duration <= 0) {
      setErr("Số ngày thi công phải là số nguyên dương");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/construction-stages/${stage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, durationDays: duration }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Lưu công tác thất bại");
        return;
      }
      showToast("Đã lưu công tác", "success");
      onSaved();
      onClose();
    } catch {
      setErr("Lỗi mạng — thử lại");
    } finally {
      setSaving(false);
    }
  }

  async function hide() {
    const ok = await appConfirm(
      `Ẩn công tác "${stage.name}" khỏi ma trận? Dữ liệu mặt trận đã ghi vẫn giữ trong hệ thống.`,
      { danger: true, confirmLabel: "Ẩn công tác" },
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/construction-stages/${stage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Ẩn công tác thất bại", "error");
        return;
      }
      showToast("Đã ẩn công tác", "success");
      onSaved();
      onClose();
    } catch {
      showToast("Lỗi mạng — thử lại", "error");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition";

  return (
    <Modal onClose={onClose}>
      <div className="p-5">
        <h3 className="font-semibold mb-4">Sửa công tác thi công</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Tên công tác</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Số ngày thi công</label>
            <input
              type="number"
              min={1}
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              className={field}
            />
          </div>
        </div>
        {err && <p className="text-xs text-red-400 mt-3">{err}</p>}
        <div className="flex items-center justify-between gap-2 mt-5">
          <Button variant="danger" onClick={hide} disabled={saving}>
            Ẩn công tác
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose} disabled={saving}>
              Huỷ
            </Button>
            <Button variant="primary" onClick={save} disabled={saving || !name.trim()}>
              Lưu
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function WorkFrontsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [floors, setFloors] = useState<string[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [fronts, setFronts] = useState<Front[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm";
  const canExportReport = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/floor-stage-fronts").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, data]) => {
        if (!meData) return;
        setMe(meData);
        setFloors((data?.floors ?? []).slice().sort(sortFloorsDesc));
        setStages(data?.stages ?? []);
        setFronts(data?.fronts ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const data = await load();
    setFloors((data?.floors ?? []).slice().sort(sortFloorsDesc));
    setStages(data?.stages ?? []);
    setFronts(data?.fronts ?? []);
  }

  async function addStage() {
    const name = await appPrompt("Tên công tác mới:");
    if (!name?.trim()) return;
    const durationStr = await appPrompt("Số ngày thi công (số nguyên dương):", "1");
    const durationDays = Number(durationStr);
    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      showToast("Số ngày thi công phải là số nguyên dương", "error");
      return;
    }
    const res = await fetch("/api/construction-stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), durationDays }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Thêm công tác thất bại", "error");
      return;
    }
    refresh();
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Mặt bằng thi công"
        subtitle="Bàn giao mặt bằng theo tầng × công tác thi công"
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
        {floors.length === 0 ? (
          <p className="text-sm text-zinc-400">Chưa có dữ liệu tầng.</p>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Ma trận mặt bằng thi công"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-right p-2 sticky left-0 z-10 bg-zinc-900">TẦNG</th>
                    {stages.map((s) => (
                      <th key={s.id} className="text-center p-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {s.name}
                          {canManage && (
                            <button
                              onClick={() => setEditingStage(s)}
                              aria-label={`Sửa công tác ${s.name}`}
                              title={`Sửa công tác ${s.name}`}
                              className="inline-flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      </th>
                    ))}
                    {canManage && (
                      <th className="text-center p-2">
                        <button
                          onClick={addStage}
                          aria-label="Thêm công tác mới"
                          title="Thêm công tác mới"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {floors.map((floor) => (
                    <tr
                      key={floor}
                      className="border-b border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-800/40"
                      onClick={() => {
                        window.location.href = `/work-fronts/${encodeURIComponent(floor)}`;
                      }}
                    >
                      <td className="p-2 font-mono text-xs text-right sticky left-0 z-10 bg-zinc-900 tabular-nums">
                        <a
                          href={`/work-fronts/${encodeURIComponent(floor)}`}
                          className="hover:text-emerald-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {floor}
                        </a>
                      </td>
                      {stages.map((stage) => {
                        const front = fronts.find(
                          (f) => f.floorLabel === floor && f.stageId === stage.id,
                        );
                        return (
                          <td key={stage.id} className="p-2 text-center">
                            <FrontCell front={front} />
                          </td>
                        );
                      })}
                      {canManage && <td />}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {editingStage && (
        <EditStageModal
          stage={editingStage}
          onClose={() => setEditingStage(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
