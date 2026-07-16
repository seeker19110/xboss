"use client";
// Trang admin khung tích hợp (M48 PR1 — bảng integrations + trạng thái đồng bộ). Đọc/ghi
// qua GET/POST /api/admin/integrations + POST /api/integrations/:provider/sync
// (lib/integrations/core.ts chỉ chạy server, dùng lib/db — KHÔNG import trực tiếp ở client).
//
// PR1 chưa đăng ký adapter thật nào → danh sách thường rỗng (EmptyState). Đây là trạng
// thái BÌNH THƯỜNG, không phải lỗi; adapter thật (kế toán, hoá đơn điện tử) bổ sung PR sau.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Cable,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleSlash,
  ExternalLink,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

type RunStats = Record<string, { pushed: number; pulled: number; errors: number }>;

type LastRun = {
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  stats: RunStats | null;
  error: string | null;
};

type IntegrationRow = {
  id: number;
  provider: string;
  projectId: number | null;
  projectName: string | null;
  active: boolean;
  config: unknown;
  lastRun: LastRun | null;
};

// Gộp stats mọi entity thành 1 bộ tổng để hiển thị rút gọn.
function totalStats(stats: RunStats | null): { pushed: number; pulled: number; errors: number } {
  const acc = { pushed: 0, pulled: 0, errors: 0 };
  if (!stats) return acc;
  for (const s of Object.values(stats)) {
    acc.pushed += s.pushed ?? 0;
    acc.pulled += s.pulled ?? 0;
    acc.errors += s.errors ?? 0;
  }
  return acc;
}

// Badge trạng thái lần chạy — kèm icon (không chỉ dựa màu, a11y).
function RunBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    ok: {
      label: "Thành công",
      cls: "bg-emerald-950 text-emerald-300 border-emerald-800",
      Icon: CheckCircle2,
    },
    running: {
      label: "Đang chạy",
      cls: "bg-sky-950 text-sky-300 border-sky-800",
      Icon: Loader2,
    },
    error: {
      label: "Lỗi",
      cls: "bg-rose-950 text-rose-300 border-rose-800",
      Icon: XCircle,
    },
  };
  const m = map[status] ?? {
    label: status,
    cls: "bg-zinc-800 text-zinc-300 border-zinc-700",
    Icon: CircleSlash,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 ${m.cls}`}
    >
      <m.Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} />
      {m.label}
    </span>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN");
  } catch {
    return iso;
  }
}

export default function IntegrationsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const canView = me?.role === "admin" || me?.role === "pm";
  const canManage = me?.role === "admin";

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/admin/integrations")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRows(j?.integrations ?? []))
      .catch(() => showToast("Không tải được danh sách tích hợp", "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMe()
      .then((u) => setMe(u))
      .finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!me || !canView) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function toggleActive(row: IntegrationRow) {
    setTogglingId(row.id);
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: row.provider,
          projectId: row.projectId,
          config: row.config ?? {},
          active: !row.active,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Không đổi được trạng thái", "error");
        return;
      }
      showToast(row.active ? "Đã tắt tích hợp" : "Đã bật tích hợp", "success");
      load();
    } catch {
      showToast("Mất kết nối — không đổi được trạng thái", "error");
    } finally {
      setTogglingId(null);
    }
  }

  async function syncNow(row: IntegrationRow) {
    setSyncing(row.provider);
    try {
      const res = await fetch(`/api/integrations/${encodeURIComponent(row.provider)}/sync`, {
        method: "POST",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        showToast(j?.error ?? "Đồng bộ thất bại", "error");
      } else {
        showToast("Đã đồng bộ xong", "success");
      }
      load();
    } catch {
      showToast("Mất kết nối — không đồng bộ được", "error");
    } finally {
      setSyncing(null);
    }
  }

  if (meLoading) return <PageSkeleton />;

  if (me && !canView) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Tích hợp hệ ngoài" subtitle="Khung đồng bộ dữ liệu với hệ thống ngoài" />
        <main className="p-4 sm:p-6">
          <EmptyState
            icon={Cable}
            title="Không có quyền truy cập"
            message="Chỉ Admin/PM mới xem được cấu hình tích hợp."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Tích hợp hệ ngoài"
        subtitle="Khung đồng bộ dữ liệu với hệ thống ngoài (kế toán, hoá đơn điện tử…) — bổ sung dần"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-6">
        {/* Dòng tĩnh: đồng bộ Google Sheet vật tư hiện có (không phải hàng bảng integrations) */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="font-semibold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-sky-300" />
                Đồng bộ Google Sheet (vật tư)
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Đồng bộ hai chiều bảng vật tư ↔ Google Sheet đã có sẵn — xem chi tiết và thao tác
                đồng bộ tại trang Vật tư.
              </p>
            </div>
            <Link
              href="/materials"
              className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Trang Vật tư
            </Link>
          </div>
        </section>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-xl h-24"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Cable}
            title="Chưa có tích hợp nào"
            message="Chưa có tích hợp nào — sẽ bổ sung ở các đợt sau (kế toán, hoá đơn điện tử)."
          />
        ) : (
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 bg-zinc-900/60 border-b border-zinc-800">
                    <th className="text-left font-medium px-4 py-2">Provider</th>
                    <th className="text-left font-medium px-4 py-2">Dự án</th>
                    <th className="text-left font-medium px-4 py-2">Trạng thái</th>
                    <th className="text-left font-medium px-4 py-2">Lần chạy gần nhất</th>
                    <th className="text-right font-medium px-4 py-2">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {rows.map((row) => {
                    const t = totalStats(row.lastRun?.stats ?? null);
                    return (
                      <tr key={row.id} className="hover:bg-zinc-900/40">
                        <td className="px-4 py-3 font-medium text-zinc-100">{row.provider}</td>
                        <td className="px-4 py-3 text-zinc-300">
                          {row.projectName ?? (row.projectId != null ? `#${row.projectId}` : "—")}
                        </td>
                        <td className="px-4 py-3">
                          {canManage ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={row.active}
                              aria-label={`${row.active ? "Tắt" : "Bật"} tích hợp ${row.provider}`}
                              disabled={togglingId === row.id}
                              onClick={() => toggleActive(row)}
                              className="inline-flex items-center gap-2 disabled:opacity-50"
                            >
                              <span
                                className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${
                                  row.active ? "bg-emerald-600" : "bg-zinc-700"
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                    row.active ? "translate-x-5" : ""
                                  }`}
                                />
                              </span>
                              <span className="text-xs text-zinc-400">
                                {row.active ? "Đang bật" : "Đang tắt"}
                              </span>
                            </button>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 ${
                                row.active
                                  ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
                              }`}
                            >
                              {row.active ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <CircleSlash className="w-3 h-3" />
                              )}
                              {row.active ? "Đang bật" : "Đang tắt"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.lastRun ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <RunBadge status={row.lastRun.status} />
                                <span className="text-xs text-zinc-500">
                                  {fmtTime(row.lastRun.finishedAt ?? row.lastRun.startedAt)}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-400">
                                Đẩy {t.pushed} · Kéo {t.pulled} ·{" "}
                                <span className={t.errors > 0 ? "text-rose-300" : ""}>
                                  Lỗi {t.errors}
                                </span>
                              </p>
                              {row.lastRun.error && (
                                <p className="text-xs text-rose-300 truncate max-w-xs">
                                  {row.lastRun.error}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500">Chưa chạy lần nào</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => syncNow(row)}
                            disabled={syncing === row.provider}
                            className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${syncing === row.provider ? "animate-spin" : ""}`}
                            />
                            Đồng bộ ngay
                          </button>
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
    </div>
  );
}
