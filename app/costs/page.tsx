"use client";
import { useEffect, useRef, useState } from "react";
import { DollarSign, TriangleAlert, Settings2, X } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { ErrorState } from "@/app/components/ErrorState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appAlert } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, redirectToLogin, type Me } from "@/app/lib/me";
import {
  HEADER_TIEN_CHI_PHI,
  fmtTienRutGon as fmtVND,
  fmtTienDayDu as fmtFull,
  phanTramSuDung,
  type CostAmountsView,
} from "./_components/chiPhi";

// Tiền là chuỗi canonical decimal-string-v1 (S10) — không cộng/chia trên number.
type CostRow = { key: string; label: string; unassigned?: boolean } & CostAmountsView;
type Alert = { key: string; label: string; pct: number | null; over: boolean };
type Settings = { warnPct: number; overPct: number };
type Coverage = {
  reconciled: boolean;
  conflicts: { boq: number; purchaseOrders: number; floorContracts: number; payments: number };
  missingDirectScope: { payments: number };
  poQuantityNonFinite: number;
};
type Data = {
  rows: CostRow[];
  /** Tổng dự án (cơ sở BOQ, gồm chưa phân hệ) — KPI luôn dùng số này, không đổi theo tab. */
  projectTotals: CostAmountsView;
  /** Tổng đúng các dòng đang xem (tab tầng: proxy HĐ giao thầu tầng). */
  selectedTotals: CostAmountsView;
  coverage: Coverage;
  settings: Settings;
  alerts: Alert[];
  groupBy: "system" | "floor";
};

/** % hiển thị; ngân sách 0 → null. */
function usagePct(committed: string, budget: string) {
  return phanTramSuDung(committed, budget);
}
function soChungTuLoi(c: Coverage) {
  const k = c.conflicts;
  return (
    k.boq +
    k.purchaseOrders +
    k.floorContracts +
    k.payments +
    c.missingDirectScope.payments +
    c.poQuantityNonFinite
  );
}
function fmtPct(pct: number | null) {
  return pct == null ? "—" : `${Math.round(pct)}%`;
}
// Mức cảnh báo lấy từ `alerts` server (so ngưỡng exact bằng bigint), không so lại trên float.
function usageBadgeClass(alert: Alert | undefined) {
  if (alert?.over) return "bg-rose-950 text-rose-200 border-rose-800";
  if (alert) return "bg-amber-950 text-amber-200 border-amber-800";
  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

export default function CostsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"system" | "floor">("system");
  const [includeVo, setIncludeVo] = useState(true);
  const [selected, setSelected] = useState<CostRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Chỉ phản hồi của lần gọi MỚI NHẤT được áp dụng (bấm chuyển tab nhanh không để phản hồi cũ
  // ghi đè phản hồi mới).
  const lastRequest = useRef(0);

  async function load(gb: "system" | "floor", withVo = includeVo) {
    const requestId = ++lastRequest.current;
    setLoadError(null);
    try {
      const res = await fetch(`/api/costs?groupBy=${gb}&includeVo=${withVo ? 1 : 0}`, {
        headers: HEADER_TIEN_CHI_PHI,
      });
      if (requestId !== lastRequest.current) return;
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setLoadError(
          body?.code === "money_precision_unsupported"
            ? "Số tiền vượt giới hạn hiển thị của hệ thống — vui lòng liên hệ quản trị viên."
            : "Không tải được dữ liệu chi phí — kiểm tra kết nối mạng rồi thử lại.",
        );
        return;
      }
      const json = (await res.json()) as Data;
      if (requestId !== lastRequest.current) return;
      setData(json);
    } catch {
      if (requestId === lastRequest.current)
        setLoadError("Không tải được dữ liệu chi phí — kiểm tra kết nối mạng rồi thử lại.");
    } finally {
      if (requestId === lastRequest.current) setLoading(false);
    }
  }

  function retry() {
    setLoading(true);
    load(groupBy);
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
  if (loadError || !data)
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Chi phí" />
        <ErrorState message={loadError ?? "Không có dữ liệu chi phí."} onRetry={retry} />
      </div>
    );

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
        {/* Báo cáo chưa đủ điều kiện đối soát: chứng từ mâu thuẫn phạm vi KHÔNG được cộng vào tổng */}
        {!data.coverage.reconciled && (
          <div
            role="alert"
            className="bento-card p-4 border-rose-900/60 bg-rose-500/10 text-xs text-rose-300 space-y-1"
          >
            <p className="flex items-center gap-2 font-bold uppercase tracking-wide text-rose-300">
              <TriangleAlert className="w-4 h-4" aria-hidden="true" />
              Báo cáo chưa đủ điều kiện đối soát
            </p>
            <p>
              {soChungTuLoi(data.coverage)} chứng từ có dự án/hợp đồng/sheet mâu thuẫn hoặc số liệu
              không hợp lệ — chưa được cộng vào các tổng dưới đây. Cần đối soát dữ liệu nguồn.
            </p>
          </div>
        )}

        {/* KPI Bento Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bento-card p-4 flex flex-col justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Tổng ngân sách dự án
            </span>
            <p
              className="text-2xl font-bold font-mono tabular-nums text-zinc-100 mt-2"
              title={fmtFull(data.projectTotals.budget)}
            >
              {fmtVND(data.projectTotals.budget)}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1">Định mức BOQ + VO được duyệt</p>
          </div>

          <div className="bento-card p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Giá trị cam kết
              </span>
              <span className="text-xs font-bold font-mono text-sky-400">
                {fmtPct(usagePct(data.projectTotals.committed, data.projectTotals.budget))}
              </span>
            </div>
            <p
              className="text-2xl font-bold font-mono tabular-nums text-sky-400 mt-2"
              title={fmtFull(data.projectTotals.committed)}
            >
              {fmtVND(data.projectTotals.committed)}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1">Hợp đồng giao thầu + Đơn đặt hàng</p>
          </div>

          <div className="bento-card p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Thực chi tích lũy
              </span>
              <span className="text-xs font-bold font-mono text-emerald-400">
                {fmtPct(usagePct(data.projectTotals.actual, data.projectTotals.budget))}
              </span>
            </div>
            <p
              className="text-2xl font-bold font-mono tabular-nums text-emerald-400 mt-2"
              title={fmtFull(data.projectTotals.actual)}
            >
              {fmtVND(data.projectTotals.actual)}
            </p>
            <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden mt-2 border border-zinc-800">
              <div
                className="bg-emerald-500 h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.min(100, Math.round(usagePct(data.projectTotals.actual, data.projectTotals.budget) ?? 0))}%`,
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
                    {fmtPct(a.pct)} {a.over ? "(Đã vượt)" : ""}
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
              aria-pressed={groupBy === "system"}
              className={`px-3.5 min-h-[40px] rounded-lg text-xs font-semibold transition ${
                groupBy === "system"
                  ? "bg-zinc-800 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Theo hệ
            </button>
            <button
              onClick={() => switchGroup("floor")}
              aria-pressed={groupBy === "floor"}
              className={`px-3.5 min-h-[40px] rounded-lg text-xs font-semibold transition ${
                groupBy === "floor"
                  ? "bg-zinc-800 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Theo tầng
            </button>
          </div>

          <label className="inline-flex items-center gap-2 min-h-[40px] text-xs font-medium text-zinc-300 cursor-pointer select-none">
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
            giao thầu theo tầng. Tổng các dòng đang xem: ngân sách{" "}
            <span className="font-mono text-zinc-300">{fmtFull(data.selectedTotals.budget)}</span>,
            thực chi{" "}
            <span className="font-mono text-zinc-300">{fmtFull(data.selectedTotals.actual)}</span>{" "}
            (thẻ tổng phía trên là tổng dự án theo BOQ).
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
                    const actualPct = Math.min(usagePct(r.actual, r.budget) ?? 0, 100);
                    const committedPct = Math.min(pct ?? 0, 100);
                    const alert = data.alerts.find((a) => a.key === r.key);
                    return (
                      <tr
                        key={r.key}
                        onClick={() => setSelected(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(r);
                          }
                        }}
                        tabIndex={0}
                        aria-label={`Xem chi tiết ${r.label}`}
                        className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 cursor-pointer transition focus-visible:outline-2 focus-visible:outline-emerald-500"
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
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2 py-0.5 ${usageBadgeClass(alert)}`}
                          >
                            {alert && <TriangleAlert className="w-3 h-3" aria-hidden="true" />}
                            {pct == null ? "—" : fmtPct(pct)}
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
        {groupBy === "system" && !row.unassigned && (
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
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:border-emerald-600"
            inputMode="decimal"
          />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-400">Vượt ngân sách khi đạt (%)</span>
          <input
            type="number"
            value={overPct}
            onChange={(e) => setOverPct(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:border-emerald-600"
            inputMode="decimal"
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
