"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Users, AlertTriangle, CalendarClock } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

// M59 PR1 — Trang Tài nguyên: histogram tải nhân lực KẾ HOẠCH (từ phân công) vs THỰC TẾ
// (từ chấm công) theo tuần + bảng cảnh báo gán chồng người. Chỉ đọc, không nhập liệu.

type WorkloadRow = {
  week: string;
  userId: number;
  userName: string;
  systemCode: string | null;
  systemColor: string | null;
  taskCount: number;
};
type ManpowerRow = {
  week: string;
  crewId: number | null;
  crewName: string | null;
  manpower: number;
};
type ConflictTask = {
  id: number;
  code: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  sheetSlug: string | null;
};
type Conflict = {
  userId: number;
  userName: string;
  overlappingTaskCount: number;
  tasks: ConflictTask[];
};
type Data = {
  from: string;
  to: string;
  workload: WorkloadRow[];
  manpower: ManpowerRow[];
  conflicts?: Conflict[];
};

// Màu hệ (systems.color) → biến CSS Tailwind (không hardcode hex, không dùng dark:) —
// literal đầy đủ để JIT nhận diện, cùng bộ tên màu với lib/systemColors.ts. KHÔNG tái dùng
// `systemColorClasses` vì hàm đó trả CLASS Tailwind ('bg-sky-400') dùng cho className, còn
// recharts `fill`/`stroke` cần GIÁ TRỊ màu SVG ('var(--color-sky-400)') — 2 đầu ra khác nhau,
// gộp lại sẽ phải thêm abstraction thừa (YAGNI).
const COLOR_VAR: Record<string, string> = {
  zinc: "var(--color-zinc-400)",
  amber: "var(--color-amber-400)",
  sky: "var(--color-sky-400)",
  violet: "var(--color-violet-400)",
  emerald: "var(--color-emerald-400)",
  rose: "var(--color-rose-400)",
};
const colorVar = (c?: string | null) => COLOR_VAR[c ?? ""] ?? "var(--color-zinc-400)";

// 'YYYY-MM-DD' → 'dd/MM' cho nhãn trục tuần (ngắn gọn).
function weekLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function fmtDMY(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function ResourcesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlan, setShowPlan] = useState(true);
  const [showActual, setShowActual] = useState(true);
  const [minTasks, setMinTasks] = useState(5);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/resources?view=conflicts&minTasks=${minTasks}`)
      .then(async (r) => {
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        return r.json();
      })
      .then((j) => j && setData(j))
      .finally(() => setLoading(false));
  }, [minTasks]);

  // Danh mục hệ xuất hiện (mã + màu) — mỗi hệ 1 chuỗi cột chồng.
  const systems = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const r of data?.workload ?? []) {
      const key = r.systemCode ?? "—";
      if (!map.has(key)) map.set(key, r.systemColor);
    }
    return [...map.entries()].map(([code, color]) => ({ code, color }));
  }, [data]);

  // Gộp workload + manpower theo tuần thành 1 mảng cho ComposedChart.
  const chartData = useMemo(() => {
    const weeks = new Set<string>();
    for (const r of data?.workload ?? []) weeks.add(r.week);
    for (const r of data?.manpower ?? []) weeks.add(r.week);
    const sorted = [...weeks].sort();
    const rowByWeek = new Map<string, Record<string, number | string>>();
    for (const w of sorted) rowByWeek.set(w, { week: w, label: weekLabel(w), manpower: 0 });
    for (const r of data?.workload ?? []) {
      const row = rowByWeek.get(r.week)!;
      const key = r.systemCode ?? "—";
      row[key] = (Number(row[key]) || 0) + r.taskCount;
    }
    for (const r of data?.manpower ?? []) {
      const row = rowByWeek.get(r.week)!;
      row.manpower = (Number(row.manpower) || 0) + r.manpower;
    }
    return sorted.map((w) => rowByWeek.get(w)!);
  }, [data]);

  const hasData = (data?.workload.length ?? 0) > 0 || (data?.manpower.length ?? 0) > 0;
  const conflicts = data?.conflicts ?? [];

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Tài nguyên"
        subtitle="Tải nhân lực kế hoạch (phân công) vs thực tế (chấm công) theo tuần + cảnh báo gán chồng"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-6">
        {!hasData ? (
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <EmptyState
              icon={Users}
              title="Chưa có số liệu tài nguyên"
              message="Cần phân công người phụ trách (assigned_to) cho task + chấm công (attendance) mới có số liệu. Vào trang Nhân sự & Tổ chức để phân công và trang Nhật ký/Chấm công để ghi nhận nhân lực."
            />
          </section>
        ) : (
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-sky-400 shrink-0" />
                <h2 className="text-base font-semibold text-zinc-100">Tải theo tuần</h2>
              </div>
              <div className="flex items-center gap-2 sm:ml-auto">
                <button
                  onClick={() => setShowPlan((v) => !v)}
                  aria-pressed={showPlan}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                    showPlan
                      ? "bg-zinc-800 border-zinc-600 text-zinc-100"
                      : "bg-transparent border-zinc-800 text-zinc-500"
                  }`}
                >
                  Kế hoạch (số task)
                </button>
                <button
                  onClick={() => setShowActual((v) => !v)}
                  aria-pressed={showActual}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                    showActual
                      ? "bg-zinc-800 border-zinc-600 text-zinc-100"
                      : "bg-transparent border-zinc-800 text-zinc-500"
                  }`}
                >
                  Thực tế (nhân lực)
                </button>
              </div>
            </div>
            <p className="text-xs text-zinc-400 mb-4">
              Cột chồng = số task được giao đang chạy mỗi tuần (theo hệ); đường = tổng nhân lực chấm
              công mỗi tuần.
            </p>
            {/* Mobile: cho cuộn ngang khi nhiều tuần, giữ chiều cao cố định. */}
            <div className="overflow-x-auto scrollbar-none">
              <div style={{ minWidth: Math.max(560, chartData.length * 48), height: 300 }}>
                <ResponsiveContainer>
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: 8, bottom: 4, left: -18 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-800)" />
                    <XAxis
                      dataKey="label"
                      stroke="var(--color-zinc-600)"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="var(--color-zinc-600)"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="var(--color-zinc-600)"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--color-zinc-800)" }}
                      contentStyle={{
                        background: "var(--color-zinc-900)",
                        border: "1px solid var(--color-zinc-700)",
                        borderRadius: 8,
                        color: "var(--foreground)",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {showPlan &&
                      systems.map((s) => (
                        <Bar
                          key={s.code}
                          yAxisId="left"
                          dataKey={s.code}
                          name={`KH ${s.code}`}
                          stackId="plan"
                          fill={colorVar(s.color)}
                          maxBarSize={40}
                        />
                      ))}
                    {showActual && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="manpower"
                        name="Nhân lực (thực tế)"
                        stroke="var(--color-amber-400)"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        {/* ── Cảnh báo gán chồng người ── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-base font-semibold text-zinc-100">Cảnh báo gán chồng</h2>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-400 sm:ml-auto">
              Ngưỡng số task chồng
              <select
                value={minTasks}
                onChange={(e) => setMinTasks(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-100"
              >
                <option value={3}>≥ 3</option>
                <option value={5}>≥ 5</option>
                <option value={8}>≥ 8</option>
                <option value={10}>≥ 10</option>
              </select>
            </label>
          </div>
          {conflicts.length === 0 ? (
            <EmptyState
              compact
              icon={Users}
              message={`Không có người nào bị gán chồng ≥ ${minTasks} task cùng lúc.`}
            />
          ) : (
            <div className="divide-y divide-zinc-800">
              {conflicts.map((c) => (
                <div key={c.userId} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-zinc-100">{c.userName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300">
                      {c.overlappingTaskCount} task cùng lúc
                    </span>
                  </div>
                  {/* Bảng task chồng — header dính khi cuộn dọc, mỗi dòng bấm nhảy tới task. */}
                  <div className="overflow-x-auto scrollbar-none">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-zinc-900">
                        <tr className="text-left text-zinc-400">
                          <th className="py-1.5 pr-3 font-medium">Mã</th>
                          <th className="py-1.5 pr-3 font-medium">Tên</th>
                          <th className="py-1.5 pr-3 font-medium whitespace-nowrap">Bắt đầu</th>
                          <th className="py-1.5 pr-3 font-medium whitespace-nowrap">Kết thúc</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.tasks.map((t) => {
                          const href = t.sheetSlug
                            ? `/tracking/${t.sheetSlug}?task=${t.id}`
                            : undefined;
                          const cells = (
                            <>
                              <td className="py-1.5 pr-3 font-mono text-zinc-300 whitespace-nowrap">
                                {t.code}
                              </td>
                              <td className="py-1.5 pr-3 text-zinc-200">{t.name}</td>
                              <td className="py-1.5 pr-3 text-zinc-400 whitespace-nowrap">
                                {fmtDMY(t.startDate)}
                              </td>
                              <td className="py-1.5 pr-3 text-zinc-400 whitespace-nowrap">
                                {fmtDMY(t.endDate)}
                              </td>
                            </>
                          );
                          return href ? (
                            // Cả dòng điều hướng được bằng chuột LẪN bàn phím (Enter/Space) —
                            // <tr> không bọc <Link> hợp lệ trong <table> nên dùng role/tabIndex.
                            <tr
                              key={t.id}
                              role="button"
                              tabIndex={0}
                              aria-label={`Mở task ${t.code} — ${t.name}`}
                              className="cursor-pointer hover:bg-zinc-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400"
                              onClick={() => (window.location.href = href)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  window.location.href = href;
                                }
                              }}
                            >
                              {cells}
                            </tr>
                          ) : (
                            <tr key={t.id}>{cells}</tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
