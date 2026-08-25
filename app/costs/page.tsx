"use client";
import { useEffect, useState } from "react";
import { DollarSign, TriangleAlert, Settings2, X } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appAlert } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, redirectToLogin, type Me } from "@/app/lib/me";

type CostRow = { key: string; label: string; budget: number; committed: number; actual: number };
type Alert = { key: string; label: string; pct: number; over: boolean };
type Settings = { warnPct: number; overPct: number };
type Data = {
  rows: CostRow[];
  totals: { budget: number; committed: number; actual: number };
  settings: Settings;
  alerts: Alert[];
  groupBy: "system" | "floor";
};

function fmtVND(n: number) {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  return n.toLocaleString("vi-VN") + " đ";
}
function fmtFull(n: number) {
  return n.toLocaleString("vi-VN") + " đ";
}

function usagePct(committed: number, budget: number) {
  return budget > 0 ? (committed / budget) * 100 : 0;
}
function usageBadgeClass(pct: number, warnPct: number, overPct: number) {
  if (pct >= overPct) return "bg-rose-950 text-rose-200 border-rose-800";
  if (pct >= warnPct) return "bg-amber-950 text-amber-200 border-amber-800";
  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

export default function CostsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [groupBy, setGroupBy] = useState<"system" | "floor">("system");
  const [includeVo, setIncludeVo] = useState(true);
  const [selected, setSelected] = useState<CostRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function load(gb: "system" | "floor", withVo = includeVo) {
    const res = await fetch(`/api/costs?groupBy=${gb}&includeVo=${withVo ? 1 : 0}`);
    if (res.status === 401) {
      redirectToLogin();
      return;
    }
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      showToast("Không tải được dữ liệu chi phí", "error");
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchMe().then((m) => setMe(m));
    load(groupBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchGroup(gb: "system" | "floor") {
    setGroupBy(gb);
    setSelected(null);
    setLoading(true);
    load(gb);
  }

  function toggleIncludeVo(checked: boolean) {
    setIncludeVo(checked);
    setSelected(null);
    setLoading(true);
    load(groupBy, checked);
  }

  const canEditSettings = me?.role === "admin" || me?.role === "pm";

  if (loading) return <PageSkeleton />;
  if (forbidden)
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Chi phí" />
        <main className="max-w-xl mx-auto px-4 py-16 text-center space-y-3">
          <p className="text-lg font-semibold">Không có quyền truy cập</p>
          <p className="text-sm text-zinc-400">Trang chi phí chỉ dành cho Admin, PM và BCH.</p>
        </main>
      </div>
    );
  if (!data) return null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Chi phí"
        subtitle="Ngân sách · Cam kết · Thực chi"
        bottomActions={
          canEditSettings ? (
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Sửa ngưỡng cảnh báo"
              className="flex items-center gap-1.5 text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-3 py-1.5 rounded-lg transition shrink-0"
            >
              <Settings2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Ngưỡng</span>
            </button>
          ) : undefined
        }
      />

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-6 pb-24 space-y-6">
        {/* KPI Bento Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bento-card p-4 flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Tổng ngân sách
            </span>
            <p
              className="text-2xl font-bold font-mono tabular-nums text-zinc-100 mt-2"
              title={fmtFull(data.totals.budget)}
            >
              {fmtVND(data.totals.budget)}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1">Định mức BOQ + VO được duyệt</p>
          </div>

          <div className="bento-card p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Giá trị cam kết
              </span>
              <span className="text-xs font-bold font-mono text-sky-400">
                {data.totals.budget > 0
                  ? `${Math.round((data.totals.committed / data.totals.budget) * 100)}%`
                  : "0%"}
              </span>
            </div>
            <p
              className="text-2xl font-bold font-mono tabular-nums text-sky-400 mt-2"
              title={fmtFull(data.totals.committed)}
            >
              {fmtVND(data.totals.committed)}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1">Hợp đồng giao thầu + Đơn đặt hàng</p>
          </div>

          <div className="bento-card p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Thực chi tích lũy
              </span>
              <span className="text-xs font-bold font-mono text-emerald-400">
                {data.totals.budget > 0
                  ? `${Math.round((data.totals.actual / data.totals.budget) * 100)}%`
                  : "0%"}
              </span>
            </div>
            <p
              className="text-2xl font-bold font-mono tabular-nums text-emerald-400 mt-2"
              title={fmtFull(data.totals.actual)}
            >
              {fmtVND(data.totals.actual)}
            </p>
            <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden mt-2 border border-zinc-800">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{
                  width: `${data.totals.budget > 0 ? Math.min(100, Math.round((data.totals.actual / data.totals.budget) * 100)) : 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Cảnh báo đang active */}
        {data.alerts.length > 0 && (
          <div className="bento-card p-4 border-amber-900/60 bg-amber-950/20 space-y-2">
            <p className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wide">
              <TriangleAlert className="w-4 h-4 text-amber-400" aria-hidden="true" />
              {data.alerts.length} nhóm cảnh báo vượt ngân sách
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {data.alerts.map((a) => (
                <div
                  key={a.key}
                  className="px-3 py-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 flex items-center justify-between"
                >
                  <span className="font-semibold text-zinc-200">{a.label}</span>
                  <span
                    className={`font-mono font-bold ${a.over ? "text-rose-400" : "text-amber-400"}`}
                  >
                    {a.pct.toFixed(0)}% {a.over ? "(Đã vượt)" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toggle nhóm & Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            <button
              onClick={() => switchGroup("system")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                groupBy === "system"
                  ? "bg-zinc-800 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Theo hệ
            </button>
            <button
              onClick={() => switchGroup("floor")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                groupBy === "floor"
                  ? "bg-zinc-800 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Theo tầng
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeVo}
              onChange={(e) => toggleIncludeVo(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-emerald-500"
            />
            Gồm phát sinh (VO)
          </label>
        </div>

        {groupBy === "floor" && (
          <p className="text-[11px] text-zinc-400">
            BOQ chưa có chiều tầng — ở chế độ này, ngân sách và cam kết dùng chung giá trị hợp đồng
            giao thầu theo tầng.
          </p>
        )}

        {/* Bảng */}
        {data.rows.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="Chưa có dữ liệu chi phí"
            message="Nhập BOQ (ngân sách), đơn đặt hàng/hợp đồng giao thầu (cam kết) hoặc bill thanh toán (thực chi) để xem báo cáo."
          />
        ) : (
          <div className="bento-card overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng chi phí">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">{groupBy === "system" ? "HỆ" : "TẦNG"}</th>
                    <th className="text-right p-3">NGÂN SÁCH</th>
                    <th className="text-right p-3">CAM KẾT</th>
                    <th className="text-right p-3">THỰC CHI</th>
                    <th className="text-left p-3 w-40">SỬ DỤNG</th>
                    <th className="text-right p-3">% DÙNG</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const pct = usagePct(r.committed, r.budget);
                    const actualPct = r.budget > 0 ? Math.min((r.actual / r.budget) * 100, 100) : 0;
                    const committedPct = r.budget > 0 ? Math.min(pct, 100) : 0;
                    return (
                      <tr
                        key={r.key}
                        onClick={() => setSelected(r)}
                        className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 cursor-pointer transition"
                      >
                        <td className="p-3 font-medium">{r.label}</td>
                        <td
                          className="p-3 text-right tabular-nums text-zinc-300"
                          title={fmtFull(r.budget)}
                        >
                          {fmtVND(r.budget)}
                        </td>
                        <td
                          className="p-3 text-right tabular-nums text-sky-300"
                          title={fmtFull(r.committed)}
                        >
                          {fmtVND(r.committed)}
                        </td>
                        <td
                          className="p-3 text-right tabular-nums text-emerald-300"
                          title={fmtFull(r.actual)}
                        >
                          {fmtVND(r.actual)}
                        </td>
                        <td className="p-3">
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden relative">
                            <div
                              className="h-full bg-sky-800/70 absolute inset-y-0 left-0 text-on-accent"
                              style={{ width: `${committedPct}%` }}
                            />
                            <div
                              className="h-full bg-emerald-500 absolute inset-y-0 left-0"
                              style={{ width: `${actualPct}%` }}
                            />
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2 py-0.5 ${usageBadgeClass(pct, data.settings.warnPct, data.settings.overPct)}`}
                          >
                            {pct >= data.settings.warnPct && (
                              <TriangleAlert className="w-3 h-3" aria-hidden="true" />
                            )}
                            {r.budget > 0 ? `${pct.toFixed(0)}%` : "—"}
                          </span>
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

      {selected && <DrillDown row={selected} groupBy={groupBy} onClose={() => setSelected(null)} />}
      {settingsOpen && (
        <SettingsModal
          settings={data.settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setData((prev) => (prev ? { ...prev, settings: s } : prev));
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function DrillDown({
  row,
  groupBy,
  onClose,
}: {
  row: CostRow;
  groupBy: "system" | "floor";
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">{row.label}</h2>
        <button onClick={onClose} aria-label="Đóng" className="text-zinc-500 hover:text-zinc-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-400">Ngân sách</span>
          <span className="tabular-nums">{fmtFull(row.budget)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Cam kết</span>
          <span className="tabular-nums text-sky-300">{fmtFull(row.committed)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Thực chi</span>
          <span className="tabular-nums text-emerald-300">{fmtFull(row.actual)}</span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2">
        <a
          href={groupBy === "system" ? "/procurement?tab=orders" : "/payments"}
          className="block text-xs text-emerald-400 hover:underline"
        >
          → Xem đơn đặt hàng / thanh toán chi tiết
        </a>
        {groupBy === "system" && (
          <a href={`/system/${row.key}`} className="block text-xs text-emerald-400 hover:underline">
            → Xem trang hệ {row.label}
          </a>
        )}
      </div>
    </Modal>
  );
}

function SettingsModal({
  settings,
  onClose,
  onSaved,
}: {
  settings: Settings;
  onClose: () => void;
  onSaved: (s: Settings) => void;
}) {
  const [warnPct, setWarnPct] = useState(String(settings.warnPct));
  const [overPct, setOverPct] = useState(String(settings.overPct));
  const [saving, setSaving] = useState(false);

  async function save() {
    const w = parseFloat(warnPct);
    const o = parseFloat(overPct);
    setSaving(true);
    try {
      const res = await fetch("/api/costs/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warnPct: w, overPct: o }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        await appAlert(e?.error ?? "Không lưu được ngưỡng");
        return;
      }
      onSaved({ warnPct: w, overPct: o });
    } catch {
      await appAlert("Mất kết nối — không lưu được ngưỡng");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-sm">
      <h2 className="text-sm font-bold mb-3">Ngưỡng cảnh báo chi phí</h2>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-zinc-400">Cảnh báo khi cam kết đạt (%)</span>
          <input
            type="number"
            value={warnPct}
            onChange={(e) => setWarnPct(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"
          />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-400">Vượt ngân sách khi đạt (%)</span>
          <input
            type="number"
            value={overPct}
            onChange={(e) => setOverPct(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-2">
          Huỷ
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="text-xs bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent px-3 py-2 rounded-lg transition"
        >
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}
