"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, FileEdit, NotebookPen, Users } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { ErrorState } from "@/app/components/ErrorState";
import { fetchMe, redirectToLogin } from "@/app/lib/me";
import { todayISO } from "@/lib/date";
import DiaryEditorModal from "@/app/diary/DiaryEditorModal";
import ManpowerChart from "@/app/diary/ManpowerChart";

type DayStatus = { date: string; status: "draft" | "locked" };
type ManpowerRow = { date: string; crew: string; headcount: number };

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `Tháng ${m}/${y}`;
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function DiaryPage() {
  const [tab, setTab] = useState<"calendar" | "manpower">("calendar");
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [days, setDays] = useState<DayStatus[]>([]);
  const [manpower, setManpower] = useState<ManpowerRow[]>([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch(`/api/diaries?month=${month}`)
      .then(async (r) => {
        if (r.status === 401) {
          await redirectToLogin();
          return;
        }
        if (!r.ok) {
          // Lỗi thật (403/500...) — không được nuốt thành lịch rỗng.
          const j = await r.json().catch(() => null);
          setLoadError(j?.error ?? `Lỗi tải nhật ký công trường (${r.status})`);
          return;
        }
        const j = await r.json();
        setDays(j.days ?? []);
        setManpower(j.manpower ?? []);
        setLoadError(null);
      })
      .catch(() => setLoadError("Mất kết nối mạng — không tải được nhật ký công trường"));
  }, [month]);

  useEffect(() => {
    fetchMe().then((u) => setRole(u?.role ?? ""));
  }, []);
  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return <PageSkeleton />;

  if (loadError) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
        <AppHeader title="Nhật ký thi công" subtitle="Nhật ký công trường · Nhân lực" />
        <ErrorState message={loadError} onRetry={load} />
      </div>
    );
  }

  const statusByDate = new Map(days.map((d) => [d.date, d.status]));
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const crewSuggestions = Array.from(new Set(manpower.map((mp) => mp.crew))).sort();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="Nhật ký thi công" subtitle="Nhật ký công trường · Nhân lực" />

      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-6 pb-24 space-y-6">
        <div
          className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit"
          role="tablist"
        >
          {(
            [
              ["calendar", "Lịch nhật ký", NotebookPen],
              ["manpower", "Biểu đồ nhân lực", Users],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition shrink-0 ${
                tab === key
                  ? "bg-zinc-800 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "calendar" && (
          <div className="bento-card p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <button
                onClick={() => setMonth((mo) => shiftMonth(mo, -1))}
                aria-label="Tháng trước"
                className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100">{monthLabel(month)}</h2>
              <button
                onClick={() => setMonth((mo) => shiftMonth(mo, 1))}
                aria-label="Tháng sau"
                className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="text-xs font-semibold text-zinc-400 py-1 uppercase tracking-wide"
                >
                  {w}
                </div>
              ))}
              {cells.map((date, i) => {
                if (!date) return <div key={i} className="aspect-square" />;
                const status = statusByDate.get(date);
                const isToday = date === todayISO();
                const dayNum = parseInt(date.slice(8, 10));
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 text-sm transition active:scale-95 ${
                      isToday
                        ? "border-sky-500 bg-sky-950/40 text-sky-200 font-bold ring-1 ring-sky-500/50 shadow-xs"
                        : "border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-200"
                    }`}
                  >
                    <span className="font-mono text-xs sm:text-sm">{dayNum}</span>
                    {status === "locked" && <Lock className="w-3 h-3 text-emerald-400" />}
                    {status === "draft" && <FileEdit className="w-3 h-3 text-amber-400" />}
                    {!status && <span className="w-1 h-1 rounded-full bg-zinc-700" />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4 text-xs text-zinc-400 flex-wrap pt-3 border-t border-zinc-800/80">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" /> Chưa lập
              </span>
              <span className="flex items-center gap-1.5">
                <FileEdit className="w-3 h-3 text-amber-400" /> Bản nháp
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-emerald-400" /> Đã duyệt khoá
              </span>
            </div>
          </div>
        )}

        {tab === "manpower" && (
          <div className="bento-card p-4 sm:p-6">
            <ManpowerChart manpower={manpower} />
          </div>
        )}
      </main>

      {selectedDate && (
        <DiaryEditorModal
          date={selectedDate}
          role={role}
          crewSuggestions={crewSuggestions}
          onClose={() => setSelectedDate(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
