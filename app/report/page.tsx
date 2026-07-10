"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft, Download } from "lucide-react";
import { STATUS_LABEL, type StatusSlug } from "@/lib/status";
import { formatDateVN } from "@/lib/date";
import HeFilter from "@/app/components/HeFilter";

type DelayedTask = {
  id: number;
  name: string;
  status: string;
  endDate: string;
  progressPercent: number;
  floorLabel: string;
  sheetType: string;
};
type KPI = {
  sheetType: string;
  total: number;
  avgProgress: number;
  delayed: number;
  avgProgressPrev?: number;
  deltaProgress?: number;
};
type Range = "day" | "week" | "month";
type Forecast = {
  sheetType: string;
  progress: number;
  ratePerWeek: number;
  deadline: string | null;
  eta: string | null;
  daysLeft: number | null;
  lateDays: number | null;
};

export default function ReportPage() {
  const [data, setData] = useState<{
    delayedTasks: DelayedTask[];
    kpi: KPI[];
    totalDelayed: number;
  } | null>(null);
  const [forecast, setForecast] = useState<Forecast[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [he, setHe] = useState("");
  const [heName, setHeName] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("day");
  // Chặn effect fetch bên dưới chạy lần đầu với he=""/range="day" mặc định trước khi
  // effect đọc URL kịp cập nhật state (race condition — xem M36).
  const [heReady, setHeReady] = useState(false);

  // Đọc `?he=` và `?range=` lúc mount để link chia sẻ/từ hub trỏ thẳng vào đúng bộ lọc (M36).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHe(params.get("he") ?? "");
    const r = params.get("range");
    if (r === "week" || r === "month") setRange(r);
    setHeReady(true);
  }, []);

  function updateRange(next: Range) {
    setRange(next);
    try {
      const url = new URL(window.location.href);
      if (next === "day") url.searchParams.delete("range");
      else url.searchParams.set("range", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* URL không hợp lệ (hiếm) — bỏ qua */
    }
  }

  useEffect(() => {
    if (!heReady) return;
    const params = new URLSearchParams();
    if (he) params.set("he", he);
    if (range !== "day") params.set("range", range);
    const qs = params.toString() ? `?${params.toString()}` : "";
    fetch(`/api/dashboard${qs}`)
      .then((r) => r.json())
      .then(setData);
    // /api/dashboard/forecast chưa hỗ trợ `he` (ngoài phạm vi PR1) — giữ nguyên không lọc.
    fetch("/api/dashboard/forecast")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setForecast(j?.forecast ?? []));
  }, [he, range, heReady]);
  useEffect(() => {
    fetch("/api/project")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setProjectName(j?.name ?? null));
  }, []);
  // Tên hệ để hiện "— Hệ <tên>" trong tiêu đề khi đang lọc.
  useEffect(() => {
    if (!he) {
      setHeName(null);
      return;
    }
    fetch("/api/disciplines")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d = (j?.disciplines ?? []).find((x: { code: string }) => x.code === he);
        setHeName(d?.name ?? null);
      });
  }, [he]);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="no-print sticky top-0 bg-zinc-100 border-b border-zinc-300 px-6 py-3 flex items-center gap-3">
        <Link href="/" aria-label="Quay lại" className="text-zinc-600 hover:text-zinc-900">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <span className="text-sm text-zinc-600">
          Báo cáo in — dùng nút bên phải rồi chọn &ldquo;Save as PDF&rdquo;
        </span>
        <div className="ml-auto flex items-center gap-2">
          <HeFilter
            value={he}
            onChange={setHe}
            labelClassName="flex items-center gap-1.5 text-xs text-zinc-600"
            selectClassName="min-h-10 border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span className="shrink-0">Kỳ:</span>
            <select
              value={range}
              onChange={(e) => updateRange(e.target.value as Range)}
              aria-label="Chọn kỳ báo cáo"
              className="min-h-10 border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="day">Hiện tại</option>
              <option value="week">Theo tuần</option>
              <option value="month">Theo tháng</option>
            </select>
          </label>
          <a
            href="/api/export/pdf"
            download
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm transition"
          >
            <Download className="w-4 h-4" /> Tải PDF
          </a>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm"
          >
            <Printer className="w-4 h-4" /> In
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-8">
        <div className="border-b-2 border-zinc-900 pb-4 mb-6">
          <h1 className="text-2xl font-bold">
            BÁO CÁO TIẾN ĐỘ THI CÔNG ACMV{heName ? ` — Hệ ${heName}` : ""}
          </h1>
          <p className="text-zinc-600">
            {projectName ?? "XBoss"} · Ngày: {new Date().toLocaleDateString("vi-VN")}
          </p>
        </div>

        <h2 className="font-bold text-lg mb-3">1. Tổng quan KPI</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="border border-red-300 bg-red-50 rounded-lg p-3">
            <p className="text-xs text-red-700 uppercase">Tổng công việc trễ</p>
            <p className="text-3xl font-bold text-red-700">{data?.totalDelayed ?? 0}</p>
          </div>
          {data?.kpi.map((k) => {
            const delta = k.deltaProgress;
            return (
              <div key={k.sheetType} className="border border-zinc-300 rounded-lg p-3">
                <p className="text-xs text-zinc-500 uppercase">{k.sheetType}</p>
                <p className="text-2xl font-bold">{Math.round((k.avgProgress ?? 0) * 100)}%</p>
                <p className="text-xs text-zinc-500">
                  {k.delayed} trễ / {k.total} task
                </p>
                {range !== "day" && delta !== undefined && (
                  <p
                    className={`text-xs font-medium mt-1 ${delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-600" : "text-zinc-500"}`}
                  >
                    Δ kỳ: {delta > 0 ? "+" : ""}
                    {Math.round(delta * 100)}%
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <h2 className="font-bold text-lg mb-3">2. Tiến độ theo hệ</h2>
        <div className="mb-6 space-y-2">
          {data?.kpi.map((k) => {
            const pct = Math.round((k.avgProgress ?? 0) * 100);
            return (
              <div key={k.sheetType} className="flex items-center gap-3">
                <span className="w-28 text-sm shrink-0">{k.sheetType}</span>
                <div className="flex-1 bg-zinc-100 border border-zinc-200 rounded h-5 overflow-hidden">
                  <div
                    className={`h-full ${k.delayed > 0 ? "bg-amber-500" : "bg-emerald-600"}`}
                    style={{
                      width: `${pct}%`,
                      printColorAdjust: "exact",
                      WebkitPrintColorAdjust: "exact",
                    }}
                  />
                </div>
                <span className="w-12 text-right text-sm font-medium shrink-0">{pct}%</span>
                <span
                  className={`w-16 text-right text-xs shrink-0 ${k.delayed > 0 ? "text-red-600" : "text-zinc-400"}`}
                >
                  {k.delayed > 0 ? `${k.delayed} trễ` : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {forecast.some((f) => f.eta) && (
          <>
            <h2 className="font-bold text-lg mb-3">
              3. Dự báo hoàn thành (ngoại suy từ tốc độ thực tế)
            </h2>
            <table className="w-full text-sm border-collapse mb-6">
              <thead>
                <tr className="bg-zinc-100 border-y border-zinc-300 text-left">
                  <th className="p-2">Hệ</th>
                  <th className="p-2">Tiến độ</th>
                  <th className="p-2">Tốc độ/tuần</th>
                  <th className="p-2">Deadline</th>
                  <th className="p-2">Dự kiến xong</th>
                  <th className="p-2">Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((f) => (
                  <tr key={f.sheetType} className="border-b border-zinc-200">
                    <td className="p-2">{f.sheetType}</td>
                    <td className="p-2">{Math.round(f.progress * 100)}%</td>
                    <td className="p-2">
                      {f.progress >= 0.999 ? "—" : `${(f.ratePerWeek * 100).toFixed(1)}%`}
                    </td>
                    <td className="p-2">{formatDateVN(f.deadline)}</td>
                    <td className="p-2 font-medium">
                      {f.progress >= 0.999 ? "Đã xong" : formatDateVN(f.eta)}
                    </td>
                    <td
                      className={`p-2 ${(f.lateDays ?? 0) > 0 ? "text-red-600 font-medium" : "text-emerald-700"}`}
                    >
                      {f.lateDays === null || f.progress >= 0.999
                        ? "—"
                        : f.lateDays > 0
                          ? `Trễ ~${f.lateDays} ngày`
                          : `Sớm ${-f.lateDays} ngày`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 className="font-bold text-lg mb-3 page-break">
          {forecast.some((f) => f.eta) ? "4" : "3"}. Danh sách công việc đang trễ
        </h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-100 border-y border-zinc-300 text-left">
              <th className="p-2">Chi tiết</th>
              <th className="p-2">Sheet</th>
              <th className="p-2">Tầng</th>
              <th className="p-2">Kết thúc</th>
              <th className="p-2">%</th>
              <th className="p-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {data?.delayedTasks.map((t) => (
              <tr key={t.id} className="border-b border-zinc-200">
                <td className="p-2">{t.name}</td>
                <td className="p-2">{t.sheetType}</td>
                <td className="p-2">{t.floorLabel || "—"}</td>
                <td className="p-2 text-red-600">{formatDateVN(t.endDate)}</td>
                <td className="p-2">{Math.round((t.progressPercent ?? 0) * 100)}%</td>
                <td className="p-2">{STATUS_LABEL[t.status as StatusSlug] ?? "Đang trễ"}</td>
              </tr>
            ))}
            {!data?.delayedTasks.length && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-zinc-600">
                  Không có công việc trễ.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Khối chữ ký — chuẩn báo cáo xây dựng VN */}
        <div className="grid grid-cols-2 gap-8 mt-12 mb-8 avoid-break">
          <div className="text-center">
            <p className="font-bold text-sm uppercase">Người lập báo cáo</p>
            <p className="text-xs text-zinc-500 italic">(Ký, ghi rõ họ tên)</p>
            <div className="h-24" />
          </div>
          <div className="text-center">
            <p className="font-bold text-sm uppercase">Trưởng dự án</p>
            <p className="text-xs text-zinc-500 italic">(Ký, ghi rõ họ tên)</p>
            <div className="h-24" />
          </div>
        </div>

        <p className="text-xs text-zinc-600 mt-8">Xuất từ XBoss · Hệ thống quản lý thi công MEP</p>
      </div>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: #fff;
          }
          @page {
            margin: 14mm;
          }
          .page-break {
            break-before: page;
          }
          .avoid-break {
            break-inside: avoid;
          }
          thead {
            display: table-header-group;
          }
          tr {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
