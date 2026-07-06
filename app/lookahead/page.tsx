"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, CalendarClock } from "lucide-react";
import { LookaheadTable } from "@/app/components/LookaheadTable";
import { redirectToLogin } from "@/app/lib/me";
import { formatDateVN } from "@/lib/date";

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
  const [data, setData] = useState<Data | null>(null);
  const [days, setDays] = useState(14);
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lookahead?days=${days}`).then(async (r) => {
      if (r.status === 401) {
        redirectToLogin();
        return;
      }
      setData(await r.json());
    });
  }, [days]);
  useEffect(() => {
    fetch("/api/project")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setProjectName(j?.name ?? null));
  }, []);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="no-print sticky top-0 bg-zinc-100 border-b border-zinc-300 px-6 py-3 flex items-center gap-3">
        <Link href="/" aria-label="Quay lại" className="text-zinc-600 hover:text-zinc-900">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <span className="text-sm text-zinc-600">
          Kế hoạch ngắn hạn cho họp giao ban — in hoặc lưu PDF
        </span>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Số ngày xem trước"
          className="ml-auto border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value={7}>7 ngày</option>
          <option value={14}>14 ngày</option>
          <option value={21}>21 ngày</option>
        </select>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm"
        >
          <Printer className="w-4 h-4" /> In / Lưu PDF
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-8">
        <div className="border-b-2 border-zinc-900 pb-4 mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="w-6 h-6" /> KẾ HOẠCH {data?.days ?? days} NGÀY TỚI
          </h1>
          <p className="text-zinc-600">
            {projectName ?? "XBoss"} · {formatDateVN(data?.from ?? null)} →{" "}
            {formatDateVN(data?.until ?? null)}
          </p>
        </div>

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
          <p className="text-sm text-zinc-400 mb-6">Không có deadline nào trong giai đoạn này.</p>
        )}
        {groupBySheet(data?.due ?? []).map((g) => (
          <div key={g.sheet} className="mb-2 avoid-break">
            <h3 className="font-semibold text-sm bg-zinc-50 border-l-4 border-zinc-900 pl-2 py-1 mb-1">
              {g.sheet} ({g.tasks.length})
            </h3>
            <LookaheadTable tasks={g.tasks} dateCol="endDate" />
          </div>
        ))}

        <p className="text-xs text-zinc-600 mt-8" suppressHydrationWarning>
          Xuất từ XBoss · {new Date().toLocaleString("vi-VN")}
        </p>
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
