"use client";
import { useEffect, useMemo, useState } from "react";
import ParetoLyDoTre from "@/app/components/ParetoLyDoTre";
import { AlertTriangle, Clock, Printer } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import ScheduleControlPanel from "@/app/components/ScheduleControlPanel";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";
import DelayedGroupsTable from "@/app/components/DelayedGroupsTable";
import SystemFilter from "@/app/components/SystemFilter";
import type { CriticalRow } from "@/lib/tien-do/schedule-control";

type Delayed = {
  id: number;
  code: string;
  name: string;
  status: string;
  endDate: string;
  progressPercent: number;
  floorLabel: string | null;
  sheetType: string;
  sheetSlug: string | null;
  delayReason: string | null;
  delayNote: string | null;
};
type ParetoRow = { slug: string | null; label: string; count: number };
type Data = {
  critical: CriticalRow[];
  delayed: Delayed[];
  delayPareto: ParetoRow[];
  groupProgress: Record<string, number>;
};

export default function ScheduleControlPage() {
  const [data, setData] = useState<Data | null>(null);
  const [system, setSystem] = useState("");
  // Chặn effect fetch bên dưới chạy lần đầu với `system=""` trước khi effect đọc URL kịp
  // cập nhật state (race condition — xem M36).
  const [systemReady, setSystemReady] = useState(false);
  const [reasonFilter, setReasonFilter] = useState<string | null>("");

  // Đọc `?system=` lúc mount để link chia sẻ/từ hub trỏ thẳng vào đúng bộ lọc (M36).
  useEffect(() => {
    setSystem(new URLSearchParams(window.location.search).get("system") ?? "");
    setSystemReady(true);
  }, []);

  useEffect(() => {
    if (!systemReady) return;
    const qs = system ? `?system=${encodeURIComponent(system)}` : "";
    fetch(`/api/schedule-control${qs}`).then(async (r) => {
      if (r.status === 401) {
        redirectToLogin();
        return;
      }
      setData(await r.json());
    });
  }, [system, systemReady]);

  const totalDelayed = data?.delayed.length ?? 0;

  const filteredDelayed = useMemo(() => {
    if (!data) return [];
    if (!reasonFilter) return data.delayed;
    if (reasonFilter === "__none") return data.delayed.filter((t) => !t.delayReason);
    return data.delayed.filter((t) => t.delayReason === reasonFilter);
  }, [data, reasonFilter]);
  const delayedGroupCount = useMemo(
    () => new Set(filteredDelayed.map((t) => `${t.sheetType}::${t.floorLabel ?? ""}`)).size,
    [filteredDelayed],
  );
  const groupProgressMap = useMemo(
    () => new Map(Object.entries(data?.groupProgress ?? {})),
    [data],
  );

  if (!data) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white schedule-control-print">
      <AppHeader title="Đường găng & Chậm tiến độ">
        <SystemFilter value={system} onChange={setSystem} />
        <button
          onClick={() => window.print()}
          className="no-print flex items-center gap-2 min-h-10 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg px-3 py-1.5 text-sm transition"
        >
          <Printer className="w-4 h-4" /> In
        </button>
      </AppHeader>

      <main className="px-3 sm:px-6 py-4 w-full max-w-6xl mx-auto space-y-6">
        {/* ── Đường găng (component dùng chung với Dashboard tổng) ── */}
        <ScheduleControlPanel critical={data.critical} />

        {/* ── Pareto nguyên nhân trễ (component dùng chung với /progress/[system]) ── */}
        <ParetoLyDoTre
          rows={data.delayPareto}
          soViecTre={totalDelayed}
          reasonFilter={reasonFilter}
          setReasonFilter={setReasonFilter}
          tieuDe="Nguyên nhân trễ (Pareto)"
        />

        {/* ── Bảng trễ ── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-red-400 shrink-0" />
            <h2 className="font-semibold text-sm">Danh sách hạng mục trễ</h2>
            <span className="text-xs font-normal text-zinc-400">
              ({delayedGroupCount} hạng mục · {filteredDelayed.length}/{totalDelayed} công tác)
            </span>
          </div>
          <DelayedGroupsTable
            tasks={filteredDelayed}
            showTaskCode
            taskHref={(t) =>
              t.sheetSlug
                ? `/tracking/${t.sheetSlug}${t.floorLabel ? `?floor=${encodeURIComponent(t.floorLabel)}` : ""}`
                : null
            }
            groupProgress={groupProgressMap}
          />
        </section>
      </main>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .schedule-control-print {
            background: #fff !important;
            color: #18181b !important;
          }
          @page {
            margin: 12mm;
          }
          tr {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
