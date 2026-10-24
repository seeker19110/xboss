"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Plus, Download, Pencil } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { TableSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import { showToast } from "@/app/components/Toast";
import { fetchMe, invalidateMe, redirectToLogin, type Me } from "@/app/lib/me";
import { formatDateVN } from "@/lib/nen/date";
import { sortFloorsDesc } from "@/lib/nen/floors";
import { buildWorkFrontIndex } from "@/lib/hien-truong/work-front-index";

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
type Matrix = { floors: string[]; stages: Stage[]; fronts: Front[] };

const LOAD_ERROR = "Không tải được mặt bằng thi công. Vui lòng thử lại.";

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

// Cùng form thêm/sửa giữ bản nhập khi API lỗi (Admin/PM; công tác
// dùng chung project_id NULL chỉ Admin sửa được — route trả lỗi, hiện đúng error).
function StageFormModal({
  stage,
  onClose,
  onSaved,
}: {
  stage: Stage | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(stage?.name ?? "");
  const [durationDays, setDurationDays] = useState(String(stage?.durationDays ?? 1));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const formId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function close() {
    if (!pending.current) onClose();
  }

  async function save(hide = false) {
    // Guard đồng bộ: submit/Enter liên tiếp có thể đến trước lượt render disabled.
    if (pending.current) return;
    const trimmed = name.trim();
    const duration = Number(durationDays);
    setErr("");
    if (!hide && !trimmed) {
      setErr("Tên công tác không được để trống");
      return;
    }
    if (!hide && (!Number.isInteger(duration) || duration <= 0)) {
      setErr("Số ngày thi công phải là số nguyên dương");
      return;
    }
    pending.current = true;
    try {
      if (hide) {
        if (!stage) return;
        const ok = await appConfirm(
          `Ẩn công tác "${stage.name}" khỏi ma trận? Dữ liệu mặt trận đã ghi vẫn giữ trong hệ thống.`,
          { danger: true, confirmLabel: "Ẩn công tác" },
        );
        if (!ok || !mounted.current) return;
      }
      setSaving(true);
      const res = await fetch(
        stage ? `/api/construction-stages/${stage.id}` : "/api/construction-stages",
        {
          method: stage ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            hide ? { active: false } : { name: trimmed, durationDays: duration },
          ),
        },
      );
      const j = await res.json().catch(() => null);
      if (!mounted.current) return;
      if (!res.ok) {
        setErr(
          typeof j?.error === "string"
            ? j.error
            : hide
              ? "Ẩn công tác thất bại"
              : stage
                ? "Lưu công tác thất bại"
                : "Thêm công tác thất bại",
        );
        return;
      }
      showToast(
        hide ? "Đã ẩn công tác" : stage ? "Đã lưu công tác" : "Đã thêm công tác",
        "success",
      );
      onSaved();
      onClose();
    } catch {
      if (mounted.current) setErr("Lỗi mạng — thử lại");
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  const field =
    "w-full min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base outline-none focus:border-emerald-600 transition";

  return (
    <Modal onClose={close}>
      <form
        className="p-5"
        onSubmit={submit}
        noValidate
        aria-describedby={err ? `${formId}-error` : undefined}
      >
        <h3 className="font-semibold mb-4">{stage ? "Sửa" : "Thêm"} công tác thi công</h3>
        <fieldset disabled={saving} aria-busy={saving} className="min-w-0 space-y-3">
          <div>
            <label htmlFor={`${formId}-name`} className="block text-xs text-zinc-400 mb-1">
              Tên công tác
            </label>
            <input
              id={`${formId}-name`}
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-duration`} className="block text-xs text-zinc-400 mb-1">
              Số ngày thi công
            </label>
            <input
              id={`${formId}-duration`}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              className={field}
            />
          </div>
          {err && (
            <p id={`${formId}-error`} role="alert" className="text-sm text-red-400">
              {err}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {stage && (
              <Button
                variant="danger"
                onClick={() => void save(true)}
                className="min-h-11 mr-auto"
                disabled={saving}
              >
                Ẩn công tác
              </Button>
            )}
            <Button onClick={close} className="min-h-11" disabled={saving}>
              Huỷ
            </Button>
            <Button variant="primary" type="submit" className="min-h-11" disabled={saving}>
              {saving ? "Đang lưu..." : stage ? "Lưu" : "Thêm công tác"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

export default function WorkFrontsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const request = useRef<{ id: number; controller: AbortController | null }>({
    id: 0,
    controller: null,
  });
  const mounted = useRef(false);
  const { floors = [], stages = [] } = data ?? {};
  const frontIndex = useMemo(() => buildWorkFrontIndex(data?.fronts ?? []), [data?.fronts]);

  const canManage = me?.role === "admin" || me?.role === "pm";
  const canExportReport = me?.role === "admin" || me?.role === "pm";

  const refresh = useCallback(async () => {
    const id = ++request.current.id;
    request.current.controller?.abort();
    const controller = new AbortController();
    request.current.controller = controller;
    setLoading(true);
    setError("");
    try {
      const [meData, response] = await Promise.all([
        fetchMe(),
        fetch("/api/floor-stage-fronts", { signal: controller.signal }),
      ]);
      if (!mounted.current || request.current.id !== id || controller.signal.aborted) return;
      if (response.status === 401) {
        void redirectToLogin();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!mounted.current || request.current.id !== id || controller.signal.aborted) return;
      // fetchMe giữ cả Promise<null>: bỏ cache lỗi để nút retry có thể xác minh lại tài khoản.
      if (!meData) invalidateMe();
      if (!response.ok) {
        setError(typeof body?.error === "string" ? body.error : LOAD_ERROR);
        return;
      }
      if (
        !meData ||
        !Array.isArray(body?.floors) ||
        !Array.isArray(body?.stages) ||
        !Array.isArray(body?.fronts)
      ) {
        setError(LOAD_ERROR);
        return;
      }
      setMe(meData);
      setData({
        floors: body.floors.slice().sort(sortFloorsDesc),
        stages: body.stages,
        fronts: body.fronts,
      });
    } catch {
      if (mounted.current && request.current.id === id && !controller.signal.aborted) {
        invalidateMe();
        setError(LOAD_ERROR);
      }
    } finally {
      if (mounted.current && request.current.id === id) {
        request.current.controller = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const activeRequest = request.current;
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      activeRequest.id++;
      activeRequest.controller?.abort();
      activeRequest.controller = null;
    };
  }, [refresh]);

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
        {loading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải mặt bằng thi công...
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 space-y-3"
          >
            <p className="text-sm text-red-400">{error}</p>
            {data && (
              <p className="text-xs text-zinc-400">Đang hiển thị ma trận đã tải trước đó.</p>
            )}
            <Button onClick={() => void refresh()} className="min-h-11">
              Thử lại
            </Button>
          </div>
        )}
        {!data && loading && <TableSkeleton cols={4} />}
        {data &&
          (floors.length === 0 ? (
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
                                className="inline-flex items-center justify-center min-w-11 min-h-11 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 shrink-0"
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
                            onClick={() => setAddingStage(true)}
                            aria-label="Thêm công tác mới"
                            title="Thêm công tác mới"
                            className="inline-flex items-center justify-center min-w-11 min-h-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white"
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
                          const front = frontIndex.get(floor)?.get(stage.id);
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
          ))}
      </main>

      {(addingStage || editingStage) && (
        <StageFormModal
          stage={editingStage}
          onClose={() => {
            setAddingStage(false);
            setEditingStage(null);
          }}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
}
