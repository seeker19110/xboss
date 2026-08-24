"use client";
import { useEffect, useState } from "react";
import {
  ShieldAlert,
  Power,
  Play,
  KeyRound,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
  Zap,
  Sliders,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import ThuNghiemBanner from "@/app/components/ThuNghiemBanner";
import EngineeringNav from "@/app/components/EngineeringNav";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

type AutonomyCapability = {
  key: string;
  label: string;
  maxAutonomyLevel: "A0" | "A1" | "A2";
  riskClass: string;
  isReversible: boolean;
  isActive: boolean;
};

type ExecutionRequest = {
  id: string;
  projectId: number;
  capabilityKey: string;
  autonomyLevel: "A0" | "A1" | "A2";
  intent: string;
  dryRunDiff: Record<string, unknown>;
  riskClass: string;
  status:
    | "draft"
    | "dry_run_passed"
    | "pending_approval"
    | "authorized"
    | "executing"
    | "completed"
    | "compensated"
    | "rejected"
    | "killed";
  approvalToken: string | null;
  tokenExpiresAt: string | null;
  executionResult: Record<string, unknown> | null;
  createdAt: string;
};

const STATUS_BADGE: Record<ExecutionRequest["status"], { label: string; cls: string }> = {
  draft: { label: "Bản nháp", cls: "bg-zinc-800 text-zinc-400" },
  dry_run_passed: { label: "Dry-run Passed", cls: "bg-sky-950 text-sky-300 border-sky-800" },
  pending_approval: { label: "Chờ phê duyệt", cls: "bg-amber-950 text-amber-300 border-amber-800" },
  authorized: { label: "Đã cấp Token", cls: "bg-purple-950 text-purple-300 border-purple-800" },
  executing: {
    label: "Đang thực thi",
    cls: "bg-blue-950 text-blue-300 border-blue-800 animate-pulse",
  },
  completed: {
    label: "Hoàn tất an toàn",
    cls: "bg-emerald-950 text-emerald-300 border-emerald-800",
  },
  compensated: {
    label: "Đã hoàn tác (Rollback)",
    cls: "bg-zinc-800 text-zinc-400 border-zinc-700",
  },
  rejected: { label: "Từ chối", cls: "bg-rose-950 text-rose-300 border-rose-800" },
  killed: {
    label: "Dừng khẩn cấp (Kill)",
    cls: "bg-rose-950 text-rose-400 font-bold border-rose-700",
  },
};

export default function ControlledAutonomyPage() {
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<AutonomyCapability[]>([]);
  const [requests, setRequests] = useState<ExecutionRequest[]>([]);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [selectedCap, setSelectedCap] = useState("");
  const [intentInput, setIntentInput] = useState("");
  const [levelInput, setLevelInput] = useState<"A0" | "A1" | "A2">("A1");
  const [creating, setCreating] = useState(false);

  // Authorize & Execute action tokens
  const [actionTokens, setActionTokens] = useState<Record<string, string>>({});

  async function loadData() {
    try {
      setLoading(true);
      const [pRes, rRes] = await Promise.all([
        fetch("/api/engineering/autonomy/policies"),
        fetch("/api/engineering/autonomy/requests"),
      ]);

      if (pRes.status === 401 || rRes.status === 401) {
        redirectToLogin();
        return;
      }

      if (pRes.ok) {
        const pData = await pRes.json();
        setCapabilities(pData.capabilities || []);
        if (pData.capabilities?.length > 0 && !selectedCap) {
          setSelectedCap(pData.capabilities[0].key);
        }
      }

      if (rRes.ok) {
        const rData = await rRes.json();
        setRequests(rData.requests || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleKillSwitch() {
    const nextState = !killSwitchActive;
    const reason = nextState
      ? prompt("Nhập lý do kích hoạt dừng khẩn cấp toàn bộ tự động hóa:") ||
        "Thao tác quản trị khẩn cấp"
      : "Quản trị viên bỏ kích hoạt";

    try {
      const res = await fetch("/api/engineering/autonomy/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextState, reason }),
      });
      if (res.ok) {
        setKillSwitchActive(nextState);
        alert(nextState ? "Đã bật Kill Switch khẩn cấp!" : "Đã hủy kích hoạt Kill Switch!");
      }
    } catch {
      alert("Lỗi kết nối");
    }
  }

  async function handleCreateRequest() {
    if (!selectedCap || !intentInput.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/engineering/autonomy/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capabilityKey: selectedCap,
          autonomyLevel: levelInput,
          intent: intentInput.trim(),
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Không thể tạo yêu cầu");
        return;
      }

      setOpenCreateModal(false);
      setIntentInput("");
      await loadData();
    } catch {
      alert("Lỗi kết nối");
    } finally {
      setCreating(false);
    }
  }

  async function handleAuthorize(id: string) {
    try {
      const res = await fetch(`/api/engineering/autonomy/requests/${id}/authorize`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Phê duyệt thất bại");
        return;
      }
      const data = await res.json();
      setActionTokens((prev) => ({ ...prev, [id]: data.token }));
      await loadData();
    } catch {
      alert("Lỗi kết nối");
    }
  }

  async function handleExecute(id: string) {
    const token = actionTokens[id];
    if (!token) {
      alert("Thiếu mã Approval Token");
      return;
    }

    try {
      const res = await fetch(`/api/engineering/autonomy/requests/${id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Thực thi thất bại");
        return;
      }

      alert("Thực thi an toàn hoàn tất!");
      await loadData();
    } catch {
      alert("Lỗi kết nối");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader title="Controlled Autonomy (Tự động hóa an toàn A0–A2)" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ThuNghiemBanner />
        <EngineeringNav />

        {/* Top Autonomy Control Banner */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldAlert size={20} className="text-amber-400" />
                <h2 className="text-base font-semibold text-zinc-100">
                  Ranh giới tự động hóa có kiểm soát (A0: Quan sát → A1: Đề xuất → A2: Chuẩn bị
                  Draft)
                </h2>
              </div>
              <p className="mt-1 text-xs text-zinc-400 max-w-2xl">
                Áp dụng quy tắc Deny-by-default, bắt buộc Dry-run diff, Single-use approval token và
                công tắc ngắt khẩn cấp (Kill Switch). Mọi mức A3+ bị cấm mặc định.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleKillSwitch}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white transition-colors ${
                  killSwitchActive
                    ? "bg-rose-600 hover:bg-rose-500 animate-bounce"
                    : "bg-zinc-800 hover:bg-rose-900/70 border border-zinc-700"
                }`}
              >
                <Power size={15} />
                <span>{killSwitchActive ? "KILL SWITCH ĐANG BẬT" : "BẬT KILL SWITCH"}</span>
              </button>

              <button
                type="button"
                onClick={() => setOpenCreateModal(true)}
                disabled={killSwitchActive}
                className="flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-on-accent hover:bg-amber-500 disabled:opacity-50"
              >
                <Play size={14} />
                <span>Tạo yêu cầu mới</span>
              </button>
            </div>
          </div>

          {/* Capabilities Badges */}
          <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-zinc-800">
            {capabilities.map((c) => (
              <div
                key={c.key}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-400"
              >
                <Lock size={12} className="text-amber-400" />
                <span className="font-mono text-zinc-300">{c.key}</span>
                <span className="rounded bg-zinc-800 px-1 py-0.2 font-semibold text-zinc-300">
                  {c.maxAutonomyLevel}
                </span>
                <span className="text-zinc-500">· {c.riskClass.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Execution Requests Queue */}
        {loading ? (
          <PageSkeleton />
        ) : requests.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Chưa có yêu cầu tự động hóa nào"
            message="Nhấn 'Tạo yêu cầu mới' để gửi yêu cầu dry-run và chuẩn bị quy trình thực thi có kiểm soát."
          />
        ) : (
          <div className="space-y-4">
            {requests.map((r) => {
              const statusInfo = STATUS_BADGE[r.status] || {
                label: r.status,
                cls: "bg-zinc-800 text-zinc-400",
              };
              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-[300px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono font-semibold text-amber-300">
                          {r.capabilityKey}
                        </span>
                        <span className="rounded bg-purple-950/70 border border-purple-800 px-2 py-0.5 font-semibold text-purple-300">
                          Cấp {r.autonomyLevel}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 font-semibold ${statusInfo.cls}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      <div className="mt-2 text-sm font-medium text-zinc-100">{r.intent}</div>

                      {/* Dry-run diff box */}
                      <div className="mt-3">
                        <span className="text-[11px] font-semibold text-zinc-400">
                          Dry-run Simulation Diff:
                        </span>
                        <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300 border border-zinc-800">
                          {JSON.stringify(r.dryRunDiff, null, 2)}
                        </pre>
                      </div>

                      {r.executionResult && (
                        <div className="mt-3">
                          <span className="text-[11px] font-semibold text-emerald-400">
                            Kết quả thực thi:
                          </span>
                          <pre className="mt-1 max-h-24 overflow-auto rounded-lg bg-emerald-950/20 p-2 font-mono text-[11px] text-emerald-300 border border-emerald-900/50">
                            {JSON.stringify(r.executionResult, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* Action Controls */}
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-[11px] text-zinc-500">
                        {new Date(r.createdAt).toLocaleString("vi-VN")}
                      </span>

                      {r.status === "dry_run_passed" && (
                        <button
                          type="button"
                          onClick={() => handleAuthorize(r.id)}
                          disabled={killSwitchActive}
                          className="flex items-center gap-1 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
                        >
                          <KeyRound size={13} /> Cấp Approval Token
                        </button>
                      )}

                      {r.status === "authorized" && (
                        <button
                          type="button"
                          onClick={() => handleExecute(r.id)}
                          disabled={killSwitchActive}
                          className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-emerald-600 disabled:opacity-50"
                        >
                          <Zap size={13} /> Thực thi có kiểm soát
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Tạo yêu cầu */}
        {openCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-xs">
              <h3 className="mb-3 text-base font-semibold text-zinc-100">
                Tạo yêu cầu tự động hóa có kiểm soát
              </h3>

              <div className="space-y-3">
                <div>
                  <label htmlFor="cap-select" className="mb-1 block text-zinc-400">
                    Khả năng tự động hóa (Capability)
                  </label>
                  <select
                    id="cap-select"
                    value={selectedCap}
                    onChange={(e) => setSelectedCap(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
                  >
                    {capabilities.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label} ({c.maxAutonomyLevel})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="level-select" className="mb-1 block text-zinc-400">
                    Mức độ tự động hóa (Max A2)
                  </label>
                  <select
                    id="level-select"
                    value={levelInput}
                    onChange={(e) => setLevelInput(e.target.value as typeof levelInput)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
                  >
                    <option value="A0">A0: Quan sát / Đo lường</option>
                    <option value="A1">A1: Đề xuất hành động</option>
                    <option value="A2">A2: Chuẩn bị Draft Workflow</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="intent-input" className="mb-1 block text-zinc-400">
                    Mô tả mục tiêu (Intent)
                  </label>
                  <textarea
                    id="intent-input"
                    rows={3}
                    value={intentInput}
                    onChange={(e) => setIntentInput(e.target.value)}
                    placeholder="vd: Đồng bộ các thông số áp suất từ BMS vào Digital Twin..."
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpenCreateModal(false)}
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-700"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={creating || !intentInput.trim()}
                  onClick={handleCreateRequest}
                  className="rounded-lg bg-amber-700 px-3 py-1.5 font-medium text-on-accent hover:bg-amber-500 disabled:opacity-50"
                >
                  {creating ? "Đang tạo..." : "Tạo & Chạy Dry-run"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
