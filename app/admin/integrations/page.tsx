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
  KeyRound,
  Plus,
  Trash2,
  Copy,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { Modal, appConfirm } from "@/app/components/dialogs";
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

type ApiKeyRow = {
  id: number;
  name: string;
  projectId: number | null;
  projectName: string | null;
  scopes: string[];
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type ProjectOption = { id: number; name: string };

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

  // API keys (M49 PR1) — chỉ Admin (canManage).
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyProject, setKeyProject] = useState<string>(""); // "" = toàn cục
  const [keyScopes, setKeyScopes] = useState<string[]>(["read"]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

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

  const loadKeys = useCallback(() => {
    setKeysLoading(true);
    return fetch("/api/admin/api-keys")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setApiKeys(j?.keys ?? []))
      .catch(() => showToast("Không tải được danh sách API key", "error"))
      .finally(() => setKeysLoading(false));
  }, []);

  useEffect(() => {
    if (!me || !canManage) return;
    loadKeys();
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setProjects(j?.projects ?? []))
      .catch(() => setProjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function createKey() {
    const name = keyName.trim();
    if (!name) {
      showToast("Nhập tên key", "error");
      return;
    }
    setCreatingKey(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          projectId: keyProject === "" ? null : Number(keyProject),
          scopes: keyScopes,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.key) {
        showToast(j?.error ?? "Tạo key thất bại", "error");
        return;
      }
      setCreatedKey(j.key);
      setKeyName("");
      setKeyProject("");
      setKeyScopes(["read"]);
      loadKeys();
    } catch {
      showToast("Mất kết nối — không tạo được key", "error");
    } finally {
      setCreatingKey(false);
    }
  }

  async function revokeKey(row: ApiKeyRow) {
    const ok = await appConfirm(
      `Thu hồi API key "${row.name}"? Mọi tích hợp dùng key này sẽ ngừng hoạt động.`,
      {
        danger: true,
        confirmLabel: "Thu hồi",
      },
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/api-keys/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Không thu hồi được key", "error");
        return;
      }
      showToast("Đã thu hồi key", "success");
      loadKeys();
    } catch {
      showToast("Mất kết nối — không thu hồi được key", "error");
    }
  }

  function closeKeyModal() {
    setShowKeyModal(false);
    setCreatedKey(null);
    setKeyName("");
    setKeyProject("");
    setKeyScopes(["read"]);
  }

  async function copyKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      showToast("Đã sao chép key", "success");
    } catch {
      showToast("Không sao chép được — hãy chọn và copy thủ công", "error");
    }
  }

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

        {/* API keys (M49 PR1) — chỉ Admin. Key thô chỉ hiện 1 lần lúc tạo. */}
        {canManage && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-violet-300" />
                  API keys (đọc-only)
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Cấp quyền đọc dữ liệu qua API mở <code className="text-zinc-300">/api/v1</code>{" "}
                  cho bên thứ ba. Key thô chỉ hiển thị 1 lần lúc tạo — hãy lưu lại ngay.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreatedKey(null);
                  setShowKeyModal(true);
                }}
                className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Tạo key
              </button>
            </div>

            {keysLoading ? (
              <div className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-xl h-24" />
            ) : apiKeys.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                title="Chưa có API key nào"
                message="Bấm “Tạo key” để cấp quyền đọc dữ liệu cho hệ thống ngoài."
              />
            ) : (
              <div className="rounded-xl border border-zinc-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-zinc-500 bg-zinc-900/60 border-b border-zinc-800">
                        <th className="text-left font-medium px-4 py-2">Tên</th>
                        <th className="text-left font-medium px-4 py-2">Dự án</th>
                        <th className="text-left font-medium px-4 py-2">Scopes</th>
                        <th className="text-left font-medium px-4 py-2">Tạo lúc</th>
                        <th className="text-left font-medium px-4 py-2">Dùng lần cuối</th>
                        <th className="text-left font-medium px-4 py-2">Trạng thái</th>
                        <th className="text-right font-medium px-4 py-2">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {apiKeys.map((k) => (
                        <tr key={k.id} className="hover:bg-zinc-900/40">
                          <td className="px-4 py-3 font-medium text-zinc-100">{k.name}</td>
                          <td className="px-4 py-3 text-zinc-300">
                            {k.projectName ??
                              (k.projectId != null ? `#${k.projectId}` : "Toàn cục")}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {k.scopes.map((s) => (
                                <span
                                  key={s}
                                  className="inline-flex items-center text-[11px] font-medium border rounded-full px-2 py-0.5 bg-zinc-800 text-zinc-300 border-zinc-700"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">
                            {fmtTime(k.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">
                            {fmtTime(k.lastUsedAt)}
                          </td>
                          <td className="px-4 py-3">
                            {k.revokedAt ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 bg-zinc-800 text-zinc-400 border-zinc-700">
                                <CircleSlash className="w-3 h-3" /> Đã thu hồi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 bg-emerald-950 text-emerald-300 border-emerald-800">
                                <CheckCircle2 className="w-3 h-3" /> Hoạt động
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!k.revokedAt && (
                              <button
                                type="button"
                                onClick={() => revokeKey(k)}
                                aria-label={`Thu hồi key ${k.name}`}
                                className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-rose-900 text-rose-300 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Thu hồi
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {showKeyModal && (
        <Modal onClose={closeKeyModal} className="max-w-md">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-violet-300" />
            <h3 className="font-semibold text-sm flex-1">
              {createdKey ? "Đã tạo API key" : "Tạo API key mới"}
            </h3>
          </div>

          {createdKey ? (
            <div className="p-4 space-y-3">
              <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-900 rounded-lg px-3 py-2">
                Sao chép và lưu key này ngay. Vì lý do bảo mật, hệ thống KHÔNG lưu bản thô và sẽ
                không hiển thị lại sau khi đóng hộp thoại.
              </p>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono break-all">
                  {createdKey}
                </code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-3 rounded-lg text-xs font-medium transition shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" /> Sao chép
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeKeyModal}
                  className="px-4 py-1.5 text-sm rounded-lg font-medium bg-emerald-600 hover:bg-emerald-700"
                >
                  Xong
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Tên key</label>
                <input
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="vd: Cổng BI phòng kế hoạch"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Dự án</label>
                <select
                  value={keyProject}
                  onChange={(e) => setKeyProject(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
                >
                  <option value="">Toàn cục (mọi dự án — cần ?project= khi gọi)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-2">Quyền truy cập</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keyScopes.includes("read")}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setKeyScopes([...keyScopes, "read"]);
                        } else {
                          setKeyScopes(keyScopes.filter((s) => s !== "read"));
                        }
                      }}
                      className="w-4 h-4 bg-zinc-800 border border-zinc-700 rounded cursor-pointer accent-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
                    />
                    <span className="text-sm text-zinc-300">read — đọc tiến độ/vật tư</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keyScopes.includes("read_finance")}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setKeyScopes([...keyScopes, "read_finance"]);
                        } else {
                          setKeyScopes(keyScopes.filter((s) => s !== "read_finance"));
                        }
                      }}
                      className="w-4 h-4 bg-zinc-800 border border-zinc-700 rounded cursor-pointer accent-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
                    />
                    <span className="text-sm text-zinc-300">
                      read_finance — thêm dữ liệu tài chính
                    </span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeKeyModal}
                  className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  onClick={createKey}
                  disabled={creatingKey || keyScopes.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50"
                  title={keyScopes.length === 0 ? "Chọn ít nhất 1 quyền" : undefined}
                >
                  {creatingKey && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Tạo key
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
