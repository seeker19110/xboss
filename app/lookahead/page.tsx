"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, CalendarClock } from "lucide-react";
import { LookaheadTable } from "@/app/components/LookaheadTable";
import SystemFilter from "@/app/components/SystemFilter";
import { redirectToLogin } from "@/app/lib/me";
import { formatDateVN, formatDateTimeVN } from "@/lib/nen/date";

type LTask = {
  id: number;
  code: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  floorLabel: string | null;
  packageCode: string;
  sheetType: string;
  delayReason: string | null;
  waitingFront?: boolean;
};
type Data = { days: number; from: string; until: string; starting: LTask[]; due: LTask[] };

// Nhóm task theo hệ (sheet) — giữ thứ tự xuất hiện.
function groupBySheet(tasks: LTask[]): { sheet: string; tasks: LTask[] }[] {
  const groups: { sheet: string; tasks: LTask[] }[] = [];
  for (const t of tasks) {
    let g = groups.find((x) => x.sheet === t.sheetType);
    if (!g) {
      g = { sheet: t.sheetType, tasks: [] };
      groups.push(g);
    }
    g.tasks.push(t);
  }
  return groups;
}

export default function LookaheadPage() {
  const [result, setResult] = useState<{ days: number; system: string; data: Data } | null>(null);
  const [days, setDays] = useState(14);
  const [system, setSystem] = useState("");
  const data = result?.days === days && result.system === system ? result.data : null;
  // Chặn effect fetch bên dưới chạy lần đầu với `system=""` trước khi effect đọc URL kịp
  // cập nhật state (race condition — 2 request chạy song song, kết quả không lọc có
  // thể ghi đè kết quả đã lọc nếu về sau). Xem M36.
  const [systemReady, setSystemReady] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  // Đọc `?system=` lúc mount để link chia sẻ/từ hub trỏ thẳng vào đúng bộ lọc (M36).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSystem(params.get("system") ?? "");
    const requestedDays = Number(params.get("days"));
    if ([7, 14, 21].includes(requestedDays)) setDays(requestedDays);
    setSystemReady(true);
  }, []);

  function updateDays(next: number) {
    setDays(next);
    const url = new URL(window.location.href);
    if (next === 14) url.searchParams.delete("days");
    else url.searchParams.set("days", String(next));
    window.history.replaceState(null, "", url.toString());
  }

  useEffect(() => {
    if (!systemReady) return;
    const controller = new AbortController();
    setResult(null);
    setLoadError(null);
    const qs = `?days=${days}${system ? `&system=${encodeURIComponent(system)}` : ""}`;
    void (async () => {
      try {
        const response = await fetch(`/api/lookahead${qs}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          await redirectToLogin();
          return;
        }
        const json = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(json?.error ?? `Lỗi tải kế hoạch (${response.status})`);
        if (!json || !Array.isArray(json.starting) || !Array.isArray(json.due)) {
          throw new Error("Dữ liệu kế hoạch chưa hợp lệ. Vui lòng thử lại.");
        }
        setResult({ days, system, data: json });
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof TypeError
            ? "Không tải được kế hoạch — kiểm tra kết nối mạng"
            : error instanceof Error
              ? error.message
              : "Không tải được kế hoạch",
        );
      }
    })();
    return () => controller.abort();
  }, [days, system, systemReady, retry]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/project", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!controller.signal.aborted) setProjectName(j?.name ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <div className="sheet-stable min-h-screen bg-white text-zinc-900">
      <div className="no-print sticky top-0 bg-zinc-100 border-b border-zinc-300 px-3 sm:px-6 py-3 flex flex-wrap items-center gap-3">
        <Link
          href="/"
          aria-label="Quay lại"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <span className="text-sm text-zinc-600">
          Kế hoạch ngắn hạn cho họp giao ban — in hoặc lưu PDF
        </span>
        <SystemFilter
          value={system}
          onChange={setSystem}
          labelClassName="ml-auto flex items-center gap-1.5 min-w-0 max-w-full text-xs text-zinc-600"
          selectClassName="min-h-11 min-w-0 max-w-full border border-zinc-300 rounded-lg px-3 py-2 text-base sm:text-sm bg-white"
        />
        <select
          value={days}
          onChange={(e) => updateDays(Number(e.target.value))}
          aria-label="Số ngày xem trước"
          className="min-h-11 border border-zinc-300 rounded-lg px-3 py-2 text-base sm:text-sm bg-white"
        >
          <option value={7}>7 ngày</option>
          <option value={14}>14 ngày</option>
          <option value={21}>21 ngày</option>
        </select>
        <button
          onClick={() => window.print()}
          disabled={!data || !!loadError}
          className="flex min-h-11 items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Printer className="w-4 h-4" /> In / Lưu PDF
        </button>
      </div>

      <main className="max-w-4xl mx-auto p-4 sm:p-8">
        <div className="border-b-2 border-zinc-900 pb-4 mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="w-6 h-6" /> KẾ HOẠCH {data?.days ?? days} NGÀY TỚI
          </h1>
          <p className="text-zinc-600">
            {projectName ?? "XBoss"} · {formatDateVN(data?.from ?? null)} →{" "}
            {formatDateVN(data?.until ?? null)}
          </p>
        </div>

        {loadError ? (
          <div role="alert" className="py-12 text-center">
            <h2 className="text-base font-semibold text-zinc-900">Không tải được kế hoạch</h2>
            <p className="mt-2 text-sm text-zinc-600">{loadError}</p>
            <button
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => setRetry((value) => value + 1)}
            >
              Thử lại
            </button>
          </div>
        ) : !data ? (
          <p role="status" className="py-12 text-center text-zinc-600">
            Đang tải kế hoạch…
          </p>
        ) : (
          <>
            <h2 className="font-bold text-lg mb-1">
              1. Công việc sắp bắt đầu ({data?.starting.length ?? 0})
            </h2>
            <p className="text-xs text-zinc-500 mb-3">
              Chuẩn bị mặt bằng, vật tư, nhân lực trước ngày bắt đầu.
            </p>
            {data?.starting.length === 0 && (
              <p className="text-sm text-zinc-400 mb-6">
                Không có công việc nào bắt đầu trong giai đoạn này.
              </p>
            )}
            {groupBySheet(data?.starting ?? []).map((g) => (
              <div key={g.sheet} className="mb-2 avoid-break">
                <h3 className="font-semibold text-sm bg-zinc-50 border-l-4 border-zinc-900 pl-2 py-1 mb-1">
                  {g.sheet} ({g.tasks.length})
                </h3>
                <LookaheadTable tasks={g.tasks} dateCol="startDate" />
              </div>
            ))}

            <h2 className="font-bold text-lg mb-1 mt-8 page-break">
              2. Công việc đến hạn ({data?.due.length ?? 0})
            </h2>
            <p className="text-xs text-zinc-500 mb-3">
              Phải hoàn thành trong giai đoạn này — ưu tiên dòng đang trễ (đỏ).
            </p>
            {data?.due.length === 0 && (
              <p className="text-sm text-zinc-400 mb-6">
                Không có deadline nào trong giai đoạn này.
              </p>
            )}
            {groupBySheet(data?.due ?? []).map((g) => (
              <div key={g.sheet} className="mb-2 avoid-break">
                <h3 className="font-semibold text-sm bg-zinc-50 border-l-4 border-zinc-900 pl-2 py-1 mb-1">
                  {g.sheet} ({g.tasks.length})
                </h3>
                <LookaheadTable tasks={g.tasks} dateCol="endDate" />
              </div>
            ))}
          </>
        )}

        <p className="text-xs text-zinc-600 mt-8" suppressHydrationWarning>
          Xuất từ XBoss · {formatDateTimeVN(new Date())}
        </p>
      </main>

      {/* Hex cứng trong khối in dưới đây là CHỦ ĐÍCH — trang in luôn cần giấy trắng bất kể
          theme, và @media print không đọc được biến CSS đã bị html.<theme> đảo. */}
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
