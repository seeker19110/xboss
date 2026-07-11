"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  Leaf,
  FileText,
  Paperclip,
  Trash2,
  Pencil,
  AlertTriangle,
  Upload,
  Waves,
  Trash,
  ClipboardList,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN, todayISO } from "@/lib/date";

// ===== Giấy phép môi trường =====

type PermitKind = "dtm" | "giay_phep_mt" | "giay_phep_xa_thai" | "khac";
const PERMIT_KIND_LABEL: Record<PermitKind, string> = {
  dtm: "ĐTM",
  giay_phep_mt: "Giấy phép môi trường",
  giay_phep_xa_thai: "Giấy phép xả thải",
  khac: "Khác",
};

type PermitStatus = "valid" | "expired" | "superseded";
const PERMIT_STATUS_LABEL: Record<PermitStatus, string> = {
  valid: "Còn hiệu lực",
  expired: "Hết hạn",
  superseded: "Đã thay thế",
};
const PERMIT_STATUS_BADGE: Record<PermitStatus, string> = {
  valid: "bg-emerald-900 text-emerald-200",
  expired: "bg-rose-900 text-rose-200",
  superseded: "bg-zinc-800 text-zinc-500",
};

const EXPIRY_WARN_DAYS = 30;

type Permit = {
  id: number;
  kind: PermitKind;
  code: string | null;
  title: string;
  issuedBy: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: PermitStatus;
  fileName: string | null;
  originalName: string | null;
};

function isExpiringSoon(d: Permit): boolean {
  if (d.status !== "valid" || !d.expiryDate) return false;
  const limit = new Date(Date.now() + EXPIRY_WARN_DAYS * 86400_000).toISOString().slice(0, 10);
  return d.expiryDate <= limit;
}
function isExpired(d: Permit): boolean {
  return d.status === "valid" && !!d.expiryDate && d.expiryDate < todayISO();
}

// ===== Quan trắc môi trường =====

type MonCategory = "nuoc_thai" | "khi_bui" | "on_rung" | "khac";
const MON_CATEGORY_LABEL: Record<MonCategory, string> = {
  nuoc_thai: "Nước thải",
  khi_bui: "Khí thải / Bụi",
  on_rung: "Tiếng ồn / Rung",
  khac: "Khác",
};

type MonRecord = {
  id: number;
  measuredAt: string;
  category: MonCategory;
  indicator: string;
  value: number | null;
  unit: string | null;
  threshold: number | null;
  passed: boolean | null;
  location: string | null;
  note: string | null;
};

// ===== Chất thải =====

type WasteType = "ran_xd" | "nguy_hai" | "nuoc_thai" | "khac";
const WASTE_TYPE_LABEL: Record<WasteType, string> = {
  ran_xd: "Rắn xây dựng",
  nguy_hai: "Nguy hại",
  nuoc_thai: "Nước thải",
  khac: "Khác",
};

type WasteLog = {
  id: number;
  logDate: string;
  wasteType: WasteType;
  quantity: number | null;
  unit: string | null;
  disposalMethod: string | null;
  handler: string | null;
  note: string | null;
};

type Tab = "permits" | "monitoring" | "waste" | "report";
const TABS: { key: Tab; label: string; icon: typeof Leaf }[] = [
  { key: "permits", label: "Giấy phép", icon: FileText },
  { key: "monitoring", label: "Quan trắc", icon: Waves },
  { key: "waste", label: "Chất thải", icon: Trash },
  { key: "report", label: "Báo cáo", icon: ClipboardList },
];

export default function EnvironmentPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [monitoring, setMonitoring] = useState<MonRecord[]>([]);
  const [waste, setWaste] = useState<WasteLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("permits");
  const [addPermitOpen, setAddPermitOpen] = useState(false);
  const [editPermit, setEditPermit] = useState<Permit | null>(null);
  const [addMonOpen, setAddMonOpen] = useState(false);
  const [editMon, setEditMon] = useState<MonRecord | null>(null);
  const [addWasteOpen, setAddWasteOpen] = useState(false);
  const [editWaste, setEditWaste] = useState<WasteLog | null>(null);
  const [chartFilter, setChartFilter] = useState<{
    category: MonCategory | "";
    indicator: string;
  }>({ category: "", indicator: "" });

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";

  function load() {
    return Promise.all([
      fetch("/api/env-permits").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/env-monitoring").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/waste-logs").then((r) => (r.ok ? r.json() : null)),
    ]);
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, [permitsRes, monRes, wasteRes]]) => {
        if (!meData) return;
        setMe(meData);
        setPermits(permitsRes?.permits ?? []);
        setMonitoring(monRes?.records ?? []);
        setWaste(wasteRes?.logs ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const [permitsRes, monRes, wasteRes] = await load();
    setPermits(permitsRes?.permits ?? []);
    setMonitoring(monRes?.records ?? []);
    setWaste(wasteRes?.logs ?? []);
  }

  const expiringCount = useMemo(() => permits.filter((d) => isExpiringSoon(d)).length, [permits]);

  // Số chỉ tiêu vượt ngưỡng ở kỳ gần nhất mỗi tổ hợp category/indicator/location.
  const exceededCount = useMemo(() => {
    const latestByKey = new Map<string, MonRecord>();
    for (const r of monitoring) {
      const key = `${r.category}|${r.indicator}|${r.location ?? ""}`;
      const cur = latestByKey.get(key);
      if (
        !cur ||
        r.measuredAt > cur.measuredAt ||
        (r.measuredAt === cur.measuredAt && r.id > cur.id)
      )
        latestByKey.set(key, r);
    }
    return [...latestByKey.values()].filter((r) => r.passed === false).length;
  }, [monitoring]);

  const indicatorOptions = useMemo(() => {
    const set = new Set(
      monitoring
        .filter((r) => !chartFilter.category || r.category === chartFilter.category)
        .map((r) => r.indicator),
    );
    return [...set];
  }, [monitoring, chartFilter.category]);

  const chartData = useMemo(() => {
    const filtered = monitoring
      .filter((r) => !chartFilter.category || r.category === chartFilter.category)
      .filter((r) => !chartFilter.indicator || r.indicator === chartFilter.indicator)
      .slice()
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    return filtered.map((r) => ({
      date: r.measuredAt,
      value: r.value,
      threshold: r.threshold,
      passed: r.passed,
    }));
  }, [monitoring, chartFilter]);

  async function deletePermit(id: number) {
    if (!(await appConfirm("Xoá hồ sơ môi trường này? Không thể hoàn tác.", { danger: true })))
      return;
    const res = await fetch(`/api/env-permits/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refresh();
  }

  async function deleteMon(id: number) {
    if (!(await appConfirm("Xoá kỳ quan trắc này? Không thể hoàn tác.", { danger: true }))) return;
    const res = await fetch(`/api/env-monitoring/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refresh();
  }

  async function deleteWaste(id: number) {
    if (!(await appConfirm("Xoá lượt ghi chất thải này? Không thể hoàn tác.", { danger: true })))
      return;
    const res = await fetch(`/api/waste-logs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refresh();
  }

  if (loading) return <PageSkeleton />;

  const wasteTotals = WASTE_TYPES_LIST.map((t) => ({
    type: t,
    total: waste.filter((w) => w.wasteType === t).reduce((s, w) => s + (w.quantity ?? 0), 0),
  }));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Môi trường & Giấy phép"
        subtitle="Hồ sơ môi trường, quan trắc định kỳ, quản lý chất thải"
        bottomActions={
          canManage ? (
            <div className="flex items-center gap-2">
              {tab === "permits" && (
                <button
                  onClick={() => setAddPermitOpen(true)}
                  aria-label="Thêm hồ sơ"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
                >
                  <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm hồ sơ</span>
                </button>
              )}
              {tab === "monitoring" && (
                <button
                  onClick={() => setAddMonOpen(true)}
                  aria-label="Thêm kỳ quan trắc"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm kỳ quan trắc</span>
                </button>
              )}
              {tab === "waste" && (
                <button
                  onClick={() => setAddWasteOpen(true)}
                  aria-label="Ghi nhận chất thải"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Ghi nhận chất thải</span>
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${expiringCount > 0 ? "text-amber-400" : ""}`}>
              {expiringCount}
            </p>
            <p className="text-xs text-zinc-400">Giấy phép sắp/đã hết hạn</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${exceededCount > 0 ? "text-rose-400" : ""}`}>
              {exceededCount}
            </p>
            <p className="text-xs text-zinc-400">Chỉ tiêu vượt ngưỡng (kỳ gần nhất)</p>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Nhóm môi trường & giấy phép"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
                tab === t.key
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "permits" &&
          (permits.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Chưa có hồ sơ môi trường"
              message="Bấm “Thêm hồ sơ” để thêm ĐTM/giấy phép MT/giấy phép xả thải."
            />
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Hồ sơ môi trường"
              >
                <table className="w-full text-sm sm:min-w-[720px]">
                  <thead>
                    <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                      <th className="text-left p-3">LOẠI</th>
                      <th className="text-left p-3">TÊN / SỐ</th>
                      <th className="text-left p-3">HẠN</th>
                      <th className="text-left p-3">TRẠNG THÁI</th>
                      <th className="text-left p-3">FILE</th>
                      <th className="text-left p-3 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {permits.map((d) => {
                      const expiringSoon = isExpiringSoon(d);
                      const expired = isExpired(d);
                      return (
                        <tr key={d.id} className="border-b border-zinc-800/60 last:border-0">
                          <td className="p-3 text-xs text-zinc-400">{PERMIT_KIND_LABEL[d.kind]}</td>
                          <td className="p-3">
                            <p className="truncate max-w-[240px]">{d.title}</p>
                            {d.code && <p className="text-xs text-zinc-500">{d.code}</p>}
                          </td>
                          <td className="p-3 text-xs">
                            {d.expiryDate ? (
                              <span
                                className={
                                  expired
                                    ? "text-rose-400 font-medium"
                                    : expiringSoon
                                      ? "text-amber-400 font-medium"
                                      : "text-zinc-400"
                                }
                              >
                                {(expired || expiringSoon) && (
                                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                                )}
                                {formatDateVN(d.expiryDate)}
                              </span>
                            ) : (
                              <span className="text-zinc-500">Không hạn</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${PERMIT_STATUS_BADGE[d.status]}`}
                            >
                              {PERMIT_STATUS_LABEL[d.status]}
                            </span>
                          </td>
                          <td className="p-3">
                            {d.fileName ? (
                              <a
                                href={`/api/env-permits/${d.id}/file`}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="Xem file đính kèm"
                                className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                              >
                                <Paperclip className="w-4 h-4" />
                                <span className="hidden sm:inline text-xs truncate max-w-[120px]">
                                  {d.originalName ?? "File"}
                                </span>
                              </a>
                            ) : (
                              <span className="text-zinc-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {canManage && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setEditPermit(d)}
                                  aria-label="Sửa hồ sơ"
                                  className="text-zinc-400 hover:text-white"
                                  title="Sửa"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deletePermit(d.id)}
                                  aria-label="Xoá hồ sơ"
                                  className="text-zinc-400 hover:text-rose-400"
                                  title="Xoá"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

        {tab === "monitoring" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <h2 className="font-semibold text-sm text-zinc-300 flex items-center gap-2">
                  <Waves className="w-4 h-4 text-sky-400" /> Biểu đồ theo thời gian
                </h2>
                <div className="ml-auto flex items-center gap-2">
                  <select
                    value={chartFilter.category}
                    onChange={(e) =>
                      setChartFilter({
                        category: e.target.value as MonCategory | "",
                        indicator: "",
                      })
                    }
                    aria-label="Lọc biểu đồ theo nhóm"
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs outline-none text-zinc-300"
                  >
                    <option value="">Mọi nhóm</option>
                    {(Object.keys(MON_CATEGORY_LABEL) as MonCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {MON_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={chartFilter.indicator}
                    onChange={(e) => setChartFilter((f) => ({ ...f, indicator: e.target.value }))}
                    aria-label="Lọc biểu đồ theo chỉ tiêu"
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs outline-none text-zinc-300"
                  >
                    <option value="">Mọi chỉ tiêu</option>
                    {indicatorOptions.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {chartData.length < 2 ? (
                <EmptyState compact message="Cần ít nhất 2 kỳ quan trắc để vẽ biểu đồ" />
              ) : (
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                      <XAxis
                        dataKey="date"
                        stroke="var(--color-zinc-500)"
                        fontSize={10}
                        tickFormatter={(d) => formatDateVN(String(d))}
                        minTickGap={40}
                      />
                      <YAxis stroke="var(--color-zinc-500)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-zinc-900)",
                          border: "1px solid var(--color-zinc-700)",
                          color: "var(--foreground)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelFormatter={(d) => formatDateVN(String(d))}
                        formatter={(v, name) => [
                          v ?? "—",
                          name === "value" ? "Giá trị đo" : "Ngưỡng",
                        ]}
                      />
                      <Legend
                        formatter={(v) => (v === "value" ? "Giá trị đo" : "Ngưỡng cho phép")}
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="threshold"
                        stroke="var(--color-amber-400)"
                        strokeDasharray="6 4"
                        dot={false}
                        strokeWidth={2}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-sky-400)"
                        strokeWidth={2.5}
                        dot={(props) => {
                          const { cx, cy, payload, key } = props;
                          const failed = payload.passed === false;
                          return (
                            <circle
                              key={key}
                              cx={cx}
                              cy={cy}
                              r={failed ? 5 : 3}
                              fill={failed ? "var(--color-rose-400)" : "var(--color-sky-400)"}
                              stroke={failed ? "var(--color-rose-300)" : "none"}
                            />
                          );
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {monitoring.length === 0 ? (
              <EmptyState
                icon={Waves}
                title="Chưa có kỳ quan trắc"
                message="Bấm “Thêm kỳ quan trắc” để ghi kết quả đo."
              />
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div
                  className="overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-label="Bảng quan trắc môi trường"
                >
                  <table className="w-full text-sm sm:min-w-[760px]">
                    <thead>
                      <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                        <th className="text-left p-3">NGÀY ĐO</th>
                        <th className="text-left p-3">NHÓM</th>
                        <th className="text-left p-3">CHỈ TIÊU</th>
                        <th className="text-left p-3">GIÁ TRỊ / NGƯỠNG</th>
                        <th className="text-left p-3">VỊ TRÍ</th>
                        <th className="text-left p-3">ĐẠT</th>
                        <th className="text-left p-3 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitoring.map((m) => (
                        <tr
                          key={m.id}
                          className={`border-b border-zinc-800/60 last:border-0 ${
                            m.passed === false ? "bg-rose-950/20" : ""
                          }`}
                        >
                          <td className="p-3 text-xs text-zinc-400">
                            {formatDateVN(m.measuredAt)}
                          </td>
                          <td className="p-3 text-xs text-zinc-400">
                            {MON_CATEGORY_LABEL[m.category]}
                          </td>
                          <td className="p-3">{m.indicator}</td>
                          <td className="p-3 text-xs">
                            {m.value ?? "—"} / {m.threshold ?? "—"} {m.unit ?? ""}
                          </td>
                          <td className="p-3 text-xs text-zinc-400">{m.location ?? "—"}</td>
                          <td className="p-3">
                            {m.passed === null ? (
                              <span className="text-zinc-500 text-xs">Chưa đánh giá</span>
                            ) : m.passed ? (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-900 text-emerald-200">
                                Đạt
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-900 text-rose-200">
                                <AlertTriangle className="w-3 h-3" /> Vượt ngưỡng
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {canManage && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setEditMon(m)}
                                  aria-label="Sửa kỳ quan trắc"
                                  className="text-zinc-400 hover:text-white"
                                  title="Sửa"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteMon(m.id)}
                                  aria-label="Xoá kỳ quan trắc"
                                  className="text-zinc-400 hover:text-rose-400"
                                  title="Xoá"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "waste" &&
          (waste.length === 0 ? (
            <EmptyState
              icon={Trash}
              title="Chưa có lượt ghi chất thải"
              message="Bấm “Ghi nhận chất thải” để thêm khối lượng theo loại."
            />
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Bảng chất thải"
              >
                <table className="w-full text-sm sm:min-w-[720px]">
                  <thead>
                    <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                      <th className="text-left p-3">NGÀY</th>
                      <th className="text-left p-3">LOẠI</th>
                      <th className="text-left p-3">KHỐI LƯỢNG</th>
                      <th className="text-left p-3">XỬ LÝ</th>
                      <th className="text-left p-3">ĐƠN VỊ THU GOM</th>
                      <th className="text-left p-3 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {waste.map((w) => (
                      <tr key={w.id} className="border-b border-zinc-800/60 last:border-0">
                        <td className="p-3 text-xs text-zinc-400">{formatDateVN(w.logDate)}</td>
                        <td className="p-3 text-xs text-zinc-400">
                          {WASTE_TYPE_LABEL[w.wasteType]}
                        </td>
                        <td className="p-3 text-xs">
                          {w.quantity ?? "—"} {w.unit ?? ""}
                        </td>
                        <td className="p-3 text-xs text-zinc-400">{w.disposalMethod ?? "—"}</td>
                        <td className="p-3 text-xs text-zinc-400">{w.handler ?? "—"}</td>
                        <td className="p-3">
                          {canManage && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditWaste(w)}
                                aria-label="Sửa lượt ghi"
                                className="text-zinc-400 hover:text-white"
                                title="Sửa"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteWaste(w.id)}
                                aria-label="Xoá lượt ghi"
                                className="text-zinc-400 hover:text-rose-400"
                                title="Xoá"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

        {tab === "report" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h2 className="font-semibold text-sm text-zinc-300 mb-3">Tổng hợp giấy phép</h2>
              <ul className="text-sm space-y-1">
                {(Object.keys(PERMIT_KIND_LABEL) as PermitKind[]).map((k) => (
                  <li key={k} className="flex justify-between text-zinc-400">
                    <span>{PERMIT_KIND_LABEL[k]}</span>
                    <span className="text-white font-medium">
                      {permits.filter((p) => p.kind === k).length}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h2 className="font-semibold text-sm text-zinc-300 mb-3">
                Tổng hợp chất thải theo loại
              </h2>
              <ul className="text-sm space-y-1">
                {wasteTotals.map((t) => (
                  <li key={t.type} className="flex justify-between text-zinc-400">
                    <span>{WASTE_TYPE_LABEL[t.type]}</span>
                    <span className="text-white font-medium">
                      {t.total.toLocaleString("vi-VN")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:col-span-2">
              <h2 className="font-semibold text-sm text-zinc-300 mb-3">
                Quan trắc — tổng số kỳ theo nhóm
              </h2>
              <ul className="text-sm grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(MON_CATEGORY_LABEL) as MonCategory[]).map((c) => (
                  <li
                    key={c}
                    className="flex flex-col items-center bg-zinc-950 border border-zinc-800 rounded-lg p-2"
                  >
                    <span className="text-lg font-bold">
                      {monitoring.filter((m) => m.category === c).length}
                    </span>
                    <span className="text-xs text-zinc-400">{MON_CATEGORY_LABEL[c]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>

      {(addPermitOpen || editPermit) && (
        <PermitModal
          doc={editPermit}
          onClose={() => {
            setAddPermitOpen(false);
            setEditPermit(null);
          }}
          onSaved={() => {
            setAddPermitOpen(false);
            setEditPermit(null);
            refresh();
          }}
        />
      )}

      {(addMonOpen || editMon) && (
        <MonitoringModal
          record={editMon}
          onClose={() => {
            setAddMonOpen(false);
            setEditMon(null);
          }}
          onSaved={() => {
            setAddMonOpen(false);
            setEditMon(null);
            refresh();
          }}
        />
      )}

      {(addWasteOpen || editWaste) && (
        <WasteModal
          log={editWaste}
          onClose={() => {
            setAddWasteOpen(false);
            setEditWaste(null);
          }}
          onSaved={() => {
            setAddWasteOpen(false);
            setEditWaste(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

const WASTE_TYPES_LIST: WasteType[] = ["ran_xd", "nguy_hai", "nuoc_thai", "khac"];

function PermitModal({
  doc,
  onClose,
  onSaved,
}: {
  doc: Permit | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<PermitKind>(doc?.kind ?? "giay_phep_mt");
  const [code, setCode] = useState(doc?.code ?? "");
  const [title, setTitle] = useState(doc?.title ?? "");
  const [issuedBy, setIssuedBy] = useState(doc?.issuedBy ?? "");
  const [issuedDate, setIssuedDate] = useState(doc?.issuedDate ?? "");
  const [expiryDate, setExpiryDate] = useState(doc?.expiryDate ?? "");
  const [status, setStatus] = useState<PermitStatus>(doc?.status ?? "valid");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        kind,
        code: code.trim() || null,
        title: title.trim(),
        issuedBy: issuedBy.trim() || null,
        issuedDate: issuedDate || null,
        expiryDate: expiryDate || null,
        status,
      };

      let id = doc?.id;
      if (!id) {
        const res = await fetch("/api/env-permits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          setErr(j?.error ?? "Không tạo được hồ sơ");
          return;
        }
        id = j.id;
      } else if (!file) {
        const res = await fetch(`/api/env-permits/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          setErr((await res.json().catch(() => null))?.error ?? "Không sửa được hồ sơ");
          return;
        }
      }

      if (file && id) {
        const form = new FormData();
        for (const [k, v] of Object.entries(payload)) if (v != null) form.append(k, String(v));
        form.append("file", file);
        const res = await fetch(`/api/env-permits/${id}`, { method: "PATCH", body: form });
        if (!res.ok) {
          setErr((await res.json().catch(() => null))?.error ?? "Không lưu được file");
          return;
        }
      }

      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {doc ? "Sửa hồ sơ môi trường" : "Thêm hồ sơ môi trường"}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Loại
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PermitKind)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(PERMIT_KIND_LABEL) as PermitKind[]).map((k) => (
              <option key={k} value={k}>
                {PERMIT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Tên hồ sơ
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Số hồ sơ
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Nơi cấp
            <input
              value={issuedBy}
              onChange={(e) => setIssuedBy(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày cấp
            <input
              type="date"
              value={issuedDate}
              onChange={(e) => setIssuedDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Ngày hết hạn
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Trạng thái
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PermitStatus)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(PERMIT_STATUS_LABEL) as PermitStatus[]).map((s) => (
              <option key={s} value={s}>
                {PERMIT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
          <Upload className="w-4 h-4" />
          {file ? file.name : doc?.originalName ? "Thay file đính kèm" : "Chọn file (PDF/ảnh)"}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

function MonitoringModal({
  record,
  onClose,
  onSaved,
}: {
  record: MonRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [measuredAt, setMeasuredAt] = useState(record?.measuredAt ?? todayISO());
  const [category, setCategory] = useState<MonCategory>(record?.category ?? "nuoc_thai");
  const [indicator, setIndicator] = useState(record?.indicator ?? "");
  const [value, setValue] = useState(record?.value != null ? String(record.value) : "");
  const [unit, setUnit] = useState(record?.unit ?? "");
  const [threshold, setThreshold] = useState(
    record?.threshold != null ? String(record.threshold) : "",
  );
  const [location, setLocation] = useState(record?.location ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = measuredAt.length > 0 && indicator.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        measuredAt,
        category,
        indicator: indicator.trim(),
        value: value === "" ? null : Number(value),
        unit: unit.trim() || null,
        threshold: threshold === "" ? null : Number(threshold),
        location: location.trim() || null,
        note: note.trim() || null,
      };
      const url = record ? `/api/env-monitoring/${record.id}` : "/api/env-monitoring";
      const res = await fetch(url, {
        method: record ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được kỳ quan trắc");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{record ? "Sửa kỳ quan trắc" : "Thêm kỳ quan trắc"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày đo
            <input
              type="date"
              value={measuredAt}
              onChange={(e) => setMeasuredAt(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Nhóm
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MonCategory)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(MON_CATEGORY_LABEL) as MonCategory[]).map((c) => (
                <option key={c} value={c}>
                  {MON_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Chỉ tiêu
          <input
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            placeholder="VD: pH, TSS, độ ồn dBA"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-zinc-400">
            Giá trị đo
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Ngưỡng
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Đơn vị
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Vị trí đo
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
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

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

function WasteModal({
  log,
  onClose,
  onSaved,
}: {
  log: WasteLog | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [logDate, setLogDate] = useState(log?.logDate ?? todayISO());
  const [wasteType, setWasteType] = useState<WasteType>(log?.wasteType ?? "ran_xd");
  const [quantity, setQuantity] = useState(log?.quantity != null ? String(log.quantity) : "");
  const [unit, setUnit] = useState(log?.unit ?? "");
  const [disposalMethod, setDisposalMethod] = useState(log?.disposalMethod ?? "");
  const [handler, setHandler] = useState(log?.handler ?? "");
  const [note, setNote] = useState(log?.note ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = logDate.length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        logDate,
        wasteType,
        quantity: quantity === "" ? null : Number(quantity),
        unit: unit.trim() || null,
        disposalMethod: disposalMethod.trim() || null,
        handler: handler.trim() || null,
        note: note.trim() || null,
      };
      const url = log ? `/api/waste-logs/${log.id}` : "/api/waste-logs";
      const res = await fetch(url, {
        method: log ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được lượt ghi");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{log ? "Sửa lượt ghi chất thải" : "Ghi nhận chất thải"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Loại chất thải
            <select
              value={wasteType}
              onChange={(e) => setWasteType(e.target.value as WasteType)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(WASTE_TYPE_LABEL) as WasteType[]).map((t) => (
                <option key={t} value={t}>
                  {WASTE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Khối lượng
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Đơn vị
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="VD: tấn, m³, kg"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Phương thức xử lý
          <input
            value={disposalMethod}
            onChange={(e) => setDisposalMethod(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Đơn vị thu gom
          <input
            value={handler}
            onChange={(e) => setHandler(e.target.value)}
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

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}
