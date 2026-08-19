"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AppHeader from "@/app/components/AppHeader";
import { Skeleton } from "@/app/components/Skeleton";
import {
  BotMessageSquare,
  ChevronRight,
  Wind,
  Zap,
  Droplets,
  Flame,
  BoxSelect,
  FileText,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskType =
  | "mepf.hvac.calc"
  | "mepf.cad.analyze"
  | "mepf.bim.clash.detect"
  | "mepf.qs.takeoff"
  | "mepf.ff.hydraulics"
  | "mepf.electrical.calc"
  | "mepf.plumbing.calc"
  | "mepf.agent.run";

type TaskStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

interface MepfTask {
  id: string;
  taskType: string;
  status: TaskStatus;
  progressPercent: number;
  workerId: string | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  elapsedMs: number | null;
  // Thêm trường local để hiển thị
  _localTaskType?: TaskType;
  _localLabel?: string;
}

// ---------------------------------------------------------------------------
// Cấu hình loại tác vụ
// ---------------------------------------------------------------------------

const TASK_TYPES: {
  value: TaskType;
  label: string;
  icon: React.ReactNode;
  description: string;
  defaultPayload: Record<string, unknown>;
}[] = [
  {
    value: "mepf.hvac.calc",
    label: "Tính toán HVAC",
    icon: <Wind size={18} />,
    description: "Tải lạnh, ống gió, chiller/AHU, thông gió, tiếng ồn NC",
    defaultPayload: {
      cooling_load: {
        area_m2: 100,
        floor_height_m: 3.5,
        u_wall: 0.5,
        u_roof: 0.3,
        solar_gain_w: 2000,
      },
    },
  },
  {
    value: "mepf.cad.analyze",
    label: "Phân tích bản vẽ CAD",
    icon: <BoxSelect size={18} />,
    description: "Đọc file DXF, chuẩn hóa layer, trích xuất mạng ống/thiết bị",
    defaultPayload: { dxf_path: "/app/workspace/sample.dxf" },
  },
  {
    value: "mepf.bim.clash.detect",
    label: "Kiểm tra xung đột BIM",
    icon: <AlertTriangle size={18} />,
    description: "Phát hiện xung đột giữa các hệ M/E/P/F theo bề dày",
    defaultPayload: { ifc_paths: [], tolerance_mm: 50 },
  },
  {
    value: "mepf.qs.takeoff",
    label: "Bóc tách khối lượng QS",
    icon: <FileText size={18} />,
    description: "Bóc tách hình học đa hệ, lập dự toán BOQ có giá trị tiền VND",
    defaultPayload: { takeoff_params: { system: "HVAC", area_m2: 500 } },
  },
  {
    value: "mepf.ff.hydraulics",
    label: "Thủy lực PCCC",
    icon: <Flame size={18} />,
    description: "Tính sprinkler, bơm chữa cháy, họng nước, kiểm soát khói",
    defaultPayload: {
      sprinkler: { area_m2: 200, hazard: "light", k_factor: 80 },
    },
  },
  {
    value: "mepf.electrical.calc",
    label: "Tính toán Điện",
    icon: <Zap size={18} />,
    description: "Cáp điện, sụt áp, ngắn mạch, chiếu sáng, tủ điện",
    defaultPayload: {
      cable: { load_kw: 50, voltage_v: 380, length_m: 100, power_factor: 0.85 },
    },
  },
  {
    value: "mepf.plumbing.calc",
    label: "Tính toán Cấp thoát nước",
    icon: <Droplets size={18} />,
    description: "Cấp nước lạnh/nóng, thoát nước thải, bơm, bể",
    defaultPayload: {
      pipe: { flow_lps: 2.5, length_m: 50, fittings_count: 10 },
    },
  },
  {
    value: "mepf.agent.run",
    label: "Hỏi Agent MEPF",
    icon: <BotMessageSquare size={18} />,
    description: "Chạy Multi-Agent với prompt tự do (Supervisor điều phối 7 bộ phận)",
    defaultPayload: { prompt: "Tính toán tải lạnh cho văn phòng 500m² tại TP.HCM" },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: {
    label: "Chờ xử lý",
    color: "text-amber-400",
    icon: <Clock size={14} />,
  },
  processing: {
    label: "Đang xử lý",
    color: "text-sky-400",
    icon: <Loader2 size={14} className="animate-spin" />,
  },
  completed: {
    label: "Hoàn tất",
    color: "text-emerald-400",
    icon: <CheckCircle2 size={14} />,
  },
  failed: {
    label: "Lỗi",
    color: "text-rose-400",
    icon: <XCircle size={14} />,
  },
  cancelled: {
    label: "Đã huỷ",
    color: "text-zinc-500",
    icon: <XCircle size={14} />,
  },
};

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}ph ${Math.floor((ms % 60000) / 1000)}s`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ pct, status }: { pct: number; status: TaskStatus }) {
  const color =
    status === "completed" ? "bg-emerald-500" : status === "failed" ? "bg-rose-500" : "bg-sky-500";

  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-700">
      <div
        className={`h-1.5 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function TaskCard({
  task,
  taskLabel,
  onCancel,
}: {
  task: MepfTask;
  taskLabel: string;
  onCancel: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[task.status];

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-4">
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100">{taskLabel}</p>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{task.id}</p>
        </div>
        <div className={`flex shrink-0 items-center gap-1 text-xs ${cfg.color}`}>
          {cfg.icon}
          <span>{cfg.label}</span>
        </div>
      </div>

      {/* Progress */}
      <ProgressBar pct={task.progressPercent} status={task.status} />
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        <span>{task.progressPercent.toFixed(0)}%</span>
        {task.workerId && <span>worker: {task.workerId}</span>}
        <span>{fmtDate(task.createdAt)}</span>
      </div>

      {/* Elapsed */}
      {task.elapsedMs != null && task.status === "processing" && (
        <p className="mt-1 text-[10px] text-sky-500">Đã chạy: {fmtMs(task.elapsedMs)}</p>
      )}

      {/* Error */}
      {task.errorMessage && (
        <div className="mt-2 rounded-lg bg-rose-900/30 p-2 text-[11px] text-rose-300">
          {task.errorMessage}
        </div>
      )}

      {/* Result */}
      {task.result && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Xem kết quả
          </button>
          {expanded && (
            <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-zinc-900 p-2 text-[10px] text-zinc-300">
              {JSON.stringify(task.result, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Cancel button */}
      {(task.status === "pending" || task.status === "processing") && (
        <button
          onClick={() => onCancel(task.id)}
          className="mt-2 text-[11px] text-zinc-500 hover:text-rose-400"
        >
          Huỷ tác vụ
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MepfStudioPage() {
  const [selectedType, setSelectedType] = useState<TaskType>("mepf.hvac.calc");
  const [payloadJson, setPayloadJson] = useState(
    JSON.stringify(TASK_TYPES[0].defaultPayload, null, 2),
  );
  const [priority, setPriority] = useState(10);
  const [tasks, setTasks] = useState<MepfTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Khi đổi loại tác vụ → cập nhật payload mặc định
  useEffect(() => {
    const def = TASK_TYPES.find((t) => t.value === selectedType);
    if (def) setPayloadJson(JSON.stringify(def.defaultPayload, null, 2));
  }, [selectedType]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/queue/tasks?limit=30");
      if (!res.ok) {
        if (res.status === 401) window.location.href = "/login";
        return;
      }
      const data = await res.json();
      const rawTasks: MepfTask[] = (data.tasks ?? []).filter((t: MepfTask) =>
        t.taskType.startsWith("mepf."),
      );

      // Cho các task đang xử lý, lấy thêm tiến độ chính xác
      const enriched = await Promise.all(
        rawTasks.map(async (t) => {
          if (t.status === "processing" || t.status === "pending") {
            try {
              const pr = await fetch(`/api/engineering/queue/tasks/${t.id}/progress`);
              if (pr.ok) {
                const prog = await pr.json();
                return { ...t, ...prog };
              }
            } catch {
              // Ignore
            }
          }
          return t;
        }),
      );

      setTasks(enriched);
      setLoading(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(false);
    }
  }, []);

  // Poll mỗi 3 giây
  useEffect(() => {
    fetchTasks();
    pollingRef.current = setInterval(fetchTasks, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchTasks]);

  const handleSubmit = async () => {
    setError(null);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      setError("Payload JSON không hợp lệ.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/engineering/queue/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType: selectedType, payload, priority }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Lỗi không xác định");
      }
      await fetchTasks();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await fetch(`/api/engineering/queue/tasks/${taskId}/cancel`, {
        method: "POST",
      });
      await fetchTasks();
    } catch {
      // Ignore
    }
  };

  const selectedDef = TASK_TYPES.find((t) => t.value === selectedType)!;
  const activeTasks = tasks.filter((t) => t.status === "pending" || t.status === "processing");
  const doneTasks = tasks.filter(
    (t) => t.status === "completed" || t.status === "failed" || t.status === "cancelled",
  );

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Tiêu đề */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400">
            <BotMessageSquare size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">MEPF Studio</h1>
            <p className="text-sm text-zinc-400">
              Điều phối AI Agent kỹ thuật — HVAC · Điện · Cấp thoát nước · PCCC · CAD · BIM · QS
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* ----------------------------------------------------------------
              Panel trái — Gửi tác vụ mới
          ---------------------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-4">
              <h2 className="mb-3 text-sm font-semibold text-zinc-200">Tác vụ mới</h2>

              {/* Chọn loại tác vụ */}
              <div className="mb-3 space-y-1">
                {TASK_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedType(t.value)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      selectedType === t.value
                        ? "bg-violet-600/30 text-violet-300"
                        : "text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
                    }`}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                    {selectedType === t.value && <ChevronRight size={14} className="ml-auto" />}
                  </button>
                ))}
              </div>

              {/* Mô tả */}
              <p className="mb-3 rounded-lg bg-zinc-700/40 px-3 py-2 text-[11px] text-zinc-400">
                {selectedDef.description}
              </p>

              {/* Priority */}
              <div className="mb-3">
                <label className="mb-1 block text-[11px] text-zinc-500">Độ ưu tiên (0–100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                />
              </div>

              {/* Payload JSON */}
              <div className="mb-3">
                <label className="mb-1 block text-[11px] text-zinc-500">Payload (JSON)</label>
                <textarea
                  value={payloadJson}
                  onChange={(e) => setPayloadJson(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 font-mono text-[11px] text-zinc-200 focus:border-violet-500 focus:outline-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="mb-3 rounded-lg bg-rose-900/30 px-3 py-2 text-[11px] text-rose-300">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    Gửi tác vụ
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ----------------------------------------------------------------
              Panel phải — Danh sách tác vụ
          ---------------------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">
                Hàng đợi MEPF
                {activeTasks.length > 0 && (
                  <span className="ml-2 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] text-white">
                    {activeTasks.length} đang chạy
                  </span>
                )}
              </h2>
              <button
                onClick={fetchTasks}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
              >
                <RefreshCw size={12} />
                Làm mới
              </button>
            </div>

            {/* Loading */}
            {loading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            )}

            {/* Active tasks */}
            {!loading && activeTasks.length > 0 && (
              <div className="space-y-3">
                {activeTasks.map((task) => {
                  const def = TASK_TYPES.find((t) => t.value === task.taskType);
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      taskLabel={def?.label ?? task.taskType}
                      onCancel={handleCancel}
                    />
                  );
                })}
              </div>
            )}

            {/* Done tasks */}
            {!loading && doneTasks.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] text-zinc-500">Đã hoàn tất / lỗi</p>
                <div className="space-y-3">
                  {doneTasks.slice(0, 10).map((task) => {
                    const def = TASK_TYPES.find((t) => t.value === task.taskType);
                    return (
                      <TaskCard
                        key={task.id}
                        task={task}
                        taskLabel={def?.label ?? task.taskType}
                        onCancel={handleCancel}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty */}
            {!loading && tasks.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-12 text-zinc-500">
                <BotMessageSquare size={32} className="mb-3 opacity-40" />
                <p className="text-sm">Chưa có tác vụ MEPF nào</p>
                <p className="mt-1 text-[11px]">
                  Chọn loại tác vụ và nhấn &quot;Gửi tác vụ&quot; để bắt đầu
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
