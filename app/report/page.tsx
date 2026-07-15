"use client";
import { useEffect, useState } from "react";
import { Printer, Download } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import SystemFilter from "@/app/components/SystemFilter";
import ReportPrintable, {
  type ReportDelayedTask,
  type ReportKpi,
  type ReportRange,
  type ReportForecast,
} from "@/app/components/ReportPrintable";

export default function ReportPage() {
  const [data, setData] = useState<{
    delayedTasks: ReportDelayedTask[];
    kpi: ReportKpi[];
    totalDelayed: number;
    groupProgress: Record<string, number>;
  } | null>(null);
  const [forecast, setForecast] = useState<ReportForecast[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [system, setSystem] = useState("");
  const [systemName, setSystemName] = useState<string | null>(null);
  const [range, setRange] = useState<ReportRange>("day");
  // Chặn effect fetch bên dưới chạy lần đầu với system=""/range="day" mặc định trước khi
  // effect đọc URL kịp cập nhật state (race condition — xem M36).
  const [systemReady, setSystemReady] = useState(false);

  // Đọc `?system=` và `?range=` lúc mount để link chia sẻ/từ hub trỏ thẳng vào đúng bộ lọc (M36).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSystem(params.get("system") ?? "");
    const r = params.get("range");
    if (r === "week" || r === "month") setRange(r);
    setSystemReady(true);
  }, []);

  function updateRange(next: ReportRange) {
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
    if (!systemReady) return;
    const params = new URLSearchParams();
    if (system) params.set("system", system);
    if (range !== "day") params.set("range", range);
    const qs = params.toString() ? `?${params.toString()}` : "";
    fetch(`/api/dashboard${qs}`)
      .then((r) => r.json())
      .then(setData);
    // /api/dashboard/forecast chưa hỗ trợ `system` (ngoài phạm vi PR1) — giữ nguyên không lọc.
    fetch("/api/dashboard/forecast")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setForecast(j?.forecast ?? []));
  }, [system, range, systemReady]);
  useEffect(() => {
    fetch("/api/project")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setProjectName(j?.name ?? null));
  }, []);
  // Tên hệ để hiện "— Hệ <tên>" trong tiêu đề khi đang lọc.
  useEffect(() => {
    if (!system) {
      setSystemName(null);
      return;
    }
    fetch("/api/systems")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d = (j?.systems ?? []).find((x: { code: string }) => x.code === system);
        setSystemName(d?.name ?? null);
      });
  }, [system]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        subtitle="Bản in — dùng nút Tải PDF/In rồi chọn “Save as PDF”"
        bottomActions={
          <div className="flex items-center gap-2">
            <SystemFilter value={system} onChange={setSystem} />
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="shrink-0">Kỳ:</span>
              <select
                value={range}
                onChange={(e) => updateRange(e.target.value as ReportRange)}
                aria-label="Chọn kỳ báo cáo"
                className="min-h-10 bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 text-sm outline-none"
              >
                <option value="day">Hiện tại</option>
                <option value="week">Theo tuần</option>
                <option value="month">Theo tháng</option>
              </select>
            </label>
            <a
              href="/api/export/pdf"
              download
              aria-label="Tải PDF"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-on-accent px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Tải PDF</span>
            </a>
            <button
              onClick={() => window.print()}
              aria-label="In"
              className="flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Printer className="w-4 h-4" /> <span className="hidden sm:inline">In</span>
            </button>
          </div>
        }
      />

      <main className="p-4 sm:p-6 pb-24 print:p-0">
        <ReportPrintable
          data={data}
          forecast={forecast}
          projectName={projectName}
          systemName={systemName}
          range={range}
        />
      </main>
    </div>
  );
}
