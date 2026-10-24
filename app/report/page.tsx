"use client";
import { useEffect, useState } from "react";
import { Printer, Download } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import SystemFilter from "@/app/components/SystemFilter";
import { ErrorState } from "@/app/components/ErrorState";
import { Button } from "@/app/components/ui";
import { redirectToLogin } from "@/app/lib/me";
import ReportPrintable, {
  type ReportDelayedTask,
  type ReportKpi,
  type ReportRange,
  type ReportForecast,
} from "@/app/components/ReportPrintable";

type ReportData = {
  delayedTasks: ReportDelayedTask[];
  kpi: ReportKpi[];
  totalDelayed: number;
  groupProgress: Record<string, number>;
};

export default function ReportPage() {
  const [result, setResult] = useState<{
    system: string;
    range: ReportRange;
    data: ReportData;
  } | null>(null);
  const [forecast, setForecast] = useState<ReportForecast[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [system, setSystem] = useState("");
  const [systems, setSystems] = useState<{ code: string; name: string }[]>([]);
  const systemName = systems.find((item) => item.code === system)?.name ?? null;
  const [range, setRange] = useState<ReportRange>("day");
  const data = result?.system === system && result.range === range ? result.data : null;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [forecastRetry, setForecastRetry] = useState(0);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
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
    const controller = new AbortController();
    setResult(null);
    setLoadError(null);
    const params = new URLSearchParams();
    if (system) params.set("system", system);
    if (range !== "day") params.set("range", range);
    const qs = params.toString() ? `?${params.toString()}` : "";
    void (async () => {
      try {
        const response = await fetch(`/api/dashboard${qs}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          await redirectToLogin();
          return;
        }
        const json = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok)
          throw new Error(json?.error ?? `Lỗi tải dữ liệu báo cáo (${response.status})`);
        if (
          !json ||
          !Array.isArray(json.kpi) ||
          !Array.isArray(json.delayedTasks) ||
          typeof json.totalDelayed !== "number"
        ) {
          throw new Error("Dữ liệu báo cáo chưa hợp lệ. Vui lòng thử lại.");
        }
        setResult({ system, range, data: json });
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof TypeError
            ? "Không tải được dữ liệu — kiểm tra kết nối mạng"
            : error instanceof Error
              ? error.message
              : "Không tải được báo cáo",
        );
      }
    })();
    return () => controller.abort();
  }, [system, range, systemReady, retry]);
  useEffect(() => {
    const controller = new AbortController();
    setForecastLoading(true);
    setForecastError(null);
    // /api/dashboard/forecast chưa hỗ trợ `system` (ngoài phạm vi PR1) — giữ nguyên không lọc.
    // Chỉ tải khi mở trang/thử lại; đổi kỳ hoặc hệ không làm thay đổi endpoint này.
    void (async () => {
      try {
        const response = await fetch("/api/dashboard/forecast", { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          await redirectToLogin();
          return;
        }
        const json = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok || !Array.isArray(json?.forecast))
          throw new Error("Không tải được dự báo hoàn thành");
        setForecast(json.forecast);
      } catch {
        if (!controller.signal.aborted)
          setForecastError("Không tải được dự báo hoàn thành. Vui lòng thử lại.");
      } finally {
        if (!controller.signal.aborted) setForecastLoading(false);
      }
    })();
    return () => controller.abort();
  }, [forecastRetry]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/project", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!controller.signal.aborted) setProjectName(j?.name ?? null);
      })
      .catch(() => {});
    // Tên hệ dùng cùng danh mục cho mọi lựa chọn trong lần mở trang.
    void fetch("/api/systems", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!controller.signal.aborted && Array.isArray(j?.systems)) setSystems(j.systems);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        subtitle="Bản in — dùng nút Tải PDF/In rồi chọn “Save as PDF”"
        bottomActions={
          <div className="flex flex-wrap items-center gap-2">
            <SystemFilter
              value={system}
              onChange={setSystem}
              selectClassName="min-h-11 min-w-0 max-w-full bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 text-base sm:text-sm outline-none"
            />
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="shrink-0">Kỳ:</span>
              <select
                value={range}
                onChange={(e) => updateRange(e.target.value as ReportRange)}
                aria-label="Chọn kỳ báo cáo"
                className="min-h-11 bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-1.5 text-base sm:text-sm outline-none"
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
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-on-accent px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Tải PDF</span>
            </a>
            <button
              onClick={() => window.print()}
              aria-label="In"
              disabled={!data || !!loadError || forecastLoading || !!forecastError}
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4" /> <span className="hidden sm:inline">In</span>
            </button>
          </div>
        }
      />

      <main className="p-4 sm:p-6 pb-24 print:p-0">
        {loadError ? (
          <div role="alert">
            <ErrorState message={loadError} onRetry={() => setRetry((value) => value + 1)} />
          </div>
        ) : !data ? (
          <p role="status" className="py-12 text-center text-zinc-400">
            Đang tải báo cáo…
          </p>
        ) : (
          <>
            {forecastError ? (
              <div
                role="alert"
                className="no-print max-w-4xl mx-auto mb-4 rounded-lg border border-red-700 bg-red-950/30 p-4 text-sm text-red-300"
              >
                <p>{forecastError}</p>
                <Button
                  variant="secondary"
                  className="mt-3 min-h-11"
                  onClick={() => setForecastRetry((value) => value + 1)}
                >
                  Thử lại
                </Button>
              </div>
            ) : forecastLoading ? (
              <p role="status" className="no-print max-w-4xl mx-auto mb-4 text-sm text-zinc-400">
                Đang tải dự báo hoàn thành…
              </p>
            ) : null}
            <ReportPrintable
              data={data}
              forecast={forecast}
              projectName={projectName}
              systemName={systemName}
              range={range}
            />
          </>
        )}
      </main>
    </div>
  );
}
